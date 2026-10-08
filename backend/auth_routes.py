"""
Rotas de autenticação do SOEA.

Cadastro em duas etapas
    POST /auth/registro/iniciar    dados do cadastro  → envia código (a conta AINDA não existe)
    POST /auth/registro/reenviar   e-mail             → novo código
    POST /auth/registro/verificar  e-mail+código+senha → cria a conta e abre a sessão

Login
    POST /auth/login               e-mail+senha → sessão, ou desafio com código por e-mail
                                   (admin sempre; conta antiga ainda não verificada)
    POST /auth/login/verificar     desafio+código → sessão
    POST /auth/login/reenviar      desafio        → novo código

Senha
    POST /auth/senha/solicitar     e-mail → código (também serve para contas antigas sem senha)
    POST /auth/senha/confirmar     e-mail+código+nova senha → troca a senha e derruba as outras sessões

Sessão
    POST /auth/refresh             cookie HttpOnly → novo access token (rotação do refresh)
    POST /auth/logout              encerra esta sessão
    POST /auth/logout-todos        encerra todas as sessões da conta
    GET  /auth/me
"""
import time
import uuid
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

import config
import email_provider
from auth import carregar_usuario, get_current_user_row
from database import banco_dados
from nivel import calcular_nivel
from vinculos import VINCULOS
from security import (
    criar_access_token,
    criar_desafio,
    decodificar_token,
    gerar_otp,
    gerar_refresh_token,
    hash_otp,
    hash_refresh,
    hash_senha,
    igualar_tempo,
    ip_cliente,
    limitar,
    mascarar_email,
    verificar_senha,
)

router = APIRouter(prefix="/auth", tags=["auth"])

CODIGO_REGEX = r"^\d{6}$"

# ==================== MODELOS (entrada) ====================


class _Entrada(BaseModel):
    # Campo extra no payload = 422. Nada de "is_admin": true escondido no cadastro.
    model_config = ConfigDict(extra="forbid")


def _email_normalizado(v: str) -> str:
    return v.strip().lower()


def _validar_senha_nova(v: str) -> str:
    if not v.strip() or v.strip() != v:
        raise ValueError("A senha não pode começar ou terminar com espaço.")
    if len(set(v)) <= 2:
        raise ValueError("Escolha uma senha menos óbvia.")
    return v


class RegistroIn(_Entrada):
    nome: str = Field(min_length=6, max_length=120)
    email: EmailStr = Field(max_length=254)
    senha: str = Field(min_length=8, max_length=128)
    vinculo: str = Field(max_length=40)
    telefone: str = Field(default="", max_length=20)
    turnstile_token: str | None = Field(default=None, max_length=2048)

    @field_validator("email")
    @classmethod
    def normalizar_email(cls, v: str) -> str:
        return _email_normalizado(v)

    @field_validator("nome")
    @classmethod
    def _nome(cls, v: str) -> str:
        if any(c.isdigit() for c in v):
            raise ValueError("O nome não pode conter números.")
        if any(c in v for c in "<>{}[]\\/@#$%^*=+|~`"):
            raise ValueError("O nome contém caracteres inválidos.")
        return " ".join(v.split()).title()

    @field_validator("senha")
    @classmethod
    def _senha(cls, v: str) -> str:
        return _validar_senha_nova(v)

    @field_validator("vinculo")
    @classmethod
    def _vinculo(cls, v: str) -> str:
        if v not in VINCULOS:
            raise ValueError("Escolha como você se relaciona com o SOEA.")
        return v

    @field_validator("telefone")
    @classmethod
    def _telefone(cls, v: str) -> str:
        digitos = "".join(c for c in v if c.isdigit())
        if digitos and len(digitos) not in (10, 11):
            raise ValueError("Telefone inválido. Use DDD + número.")
        return digitos


class EmailIn(_Entrada):
    email: EmailStr = Field(max_length=254)
    turnstile_token: str | None = Field(default=None, max_length=2048)
    @field_validator("email")
    @classmethod
    def normalizar_email(cls, v: str) -> str:
        return _email_normalizado(v)


class VerificarRegistroIn(_Entrada):
    email: EmailStr = Field(max_length=254)
    codigo: str = Field(min_length=6, max_length=6, pattern=CODIGO_REGEX)
    senha: str = Field(min_length=1, max_length=128)
    @field_validator("email")
    @classmethod
    def normalizar_email(cls, v: str) -> str:
        return _email_normalizado(v)


class LoginIn(_Entrada):
    email: EmailStr = Field(max_length=254)
    senha: str = Field(min_length=1, max_length=128)
    @field_validator("email")
    @classmethod
    def normalizar_email(cls, v: str) -> str:
        return _email_normalizado(v)


class DesafioIn(_Entrada):
    desafio: str = Field(min_length=20, max_length=2048)


class VerificarDesafioIn(DesafioIn):
    codigo: str = Field(min_length=6, max_length=6, pattern=CODIGO_REGEX)


class ConfirmarSenhaIn(_Entrada):
    email: EmailStr = Field(max_length=254)
    codigo: str = Field(min_length=6, max_length=6, pattern=CODIGO_REGEX)
    nova_senha: str = Field(min_length=8, max_length=128)
    @field_validator("email")
    @classmethod
    def normalizar_email(cls, v: str) -> str:
        return _email_normalizado(v)

    @field_validator("nova_senha")
    @classmethod
    def _senha(cls, v: str) -> str:
        return _validar_senha_nova(v)


# ==================== MODELOS (saída) ====================
# response_model em todas as rotas: só sai o que está listado aqui.
# senha_hash, token_version, personal_code_hash etc. nunca chegam ao cliente.


class UsuarioOut(BaseModel):
    id_user: str
    nome: str
    email: str
    pontos: int = 0
    nivel: int = 1
    is_admin: bool = False


class SessaoOut(BaseModel):
    etapa: str = "ok"
    user: UsuarioOut
    token: str
    expira_em: int


class DesafioOut(BaseModel):
    etapa: str = "codigo"
    desafio: str
    motivo: str
    email: str
    reenviar_em: int


class CodigoEnviadoOut(BaseModel):
    status: str = "codigo_enviado"
    mensagem: str
    expira_em: int = config.OTP_TTL
    reenviar_em: int = config.OTP_REENVIO_SEGUNDOS


class MensagemOut(BaseModel):
    status: str = "ok"
    mensagem: str


# ==================== AUXILIARES ====================


def _agora_iso(segundos_a_frente: int = 0) -> str:
    return (datetime.now(timezone.utc) + timedelta(seconds=segundos_a_frente)).isoformat()


def _usuario_out(u: dict) -> UsuarioOut:
    return UsuarioOut(
        id_user=str(u["id_user"]),
        nome=u.get("nome") or "",
        email=u.get("email") or "",
        pontos=u.get("pontos") or 0,
        nivel=calcular_nivel(u.get("pontos")),
        is_admin=bool(u.get("is_admin")),
    )


def _buscar_por_email(email: str, colunas: str) -> dict | None:
    res = banco_dados.table("users").select(colunas).eq("email", email).limit(1).execute()
    return res.data[0] if res.data else None


def _verificar_turnstile(token: str | None, ip: str) -> None:
    if not config.TURNSTILE_SECRET:
        return
    if not token:
        raise HTTPException(status_code=400, detail="Confirme que você não é um robô.")
    try:
        r = httpx.post(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            data={"secret": config.TURNSTILE_SECRET, "response": token, "remoteip": ip},
            timeout=8,
        )
        ok = r.json().get("success") is True
    except Exception:
        ok = False
    if not ok:
        raise HTTPException(status_code=400, detail="Verificação anti-robô falhou. Tente de novo.")


def _limitar_envio(email: str, escopo: str) -> None:
    """Espera mínima entre envios + teto por hora, por e-mail (evita bombardeio de e-mails)."""
    limitar(
        f"cool:{escopo}:{email}",
        config.OTP_REENVIO_SEGUNDOS,
        1,
        f"Aguarde {config.OTP_REENVIO_SEGUNDOS} segundos para pedir outro código.",
    )
    limitar(f"send:{email}", 3600, config.OTP_ENVIOS_POR_HORA, "Limite de e-mails atingido. Tente mais tarde.")


def _enviar(fn, *args) -> None:
    try:
        fn(*args)
    except Exception as e:
        print(f"[email] falha no envio: {e}")
        raise HTTPException(status_code=502, detail="Não foi possível enviar o e-mail agora. Tente novamente.")


def _set_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=config.COOKIE_NOME,
        value=token,
        max_age=config.REFRESH_TOKEN_TTL,
        httponly=True,
        secure=config.COOKIE_SECURE,
        samesite="strict",
        path=config.COOKIE_PATH,
    )


def _limpar_cookie(response: Response) -> None:
    response.delete_cookie(
        key=config.COOKIE_NOME,
        path=config.COOKIE_PATH,
        httponly=True,
        secure=config.COOKIE_SECURE,
        samesite="strict",
    )


def _abrir_sessao(request: Request, response: Response, id_user: str) -> SessaoOut:
    usuario = carregar_usuario(id_user)
    if not usuario:
        raise HTTPException(status_code=401, detail="Conta não encontrada.")
    if not usuario.get("email_verified_at"):
        raise HTTPException(status_code=403, detail="Confirme seu e-mail para continuar.")

    refresh, refresh_hash = gerar_refresh_token()
    banco_dados.table("sessions").insert(
        {
            "id_user": str(id_user),
            "family_id": str(uuid.uuid4()),
            "refresh_hash": refresh_hash,
            "token_version": int(usuario.get("token_version") or 0),
            "expires_at": _agora_iso(config.REFRESH_TOKEN_TTL),
            "user_agent": (request.headers.get("user-agent") or "")[:300],
            "ip": ip_cliente(request),
        }
    ).execute()
    _set_cookie(response, refresh)
    return SessaoOut(
        user=_usuario_out(usuario),
        token=criar_access_token(usuario["id_user"], usuario.get("token_version") or 0),
        expira_em=config.ACCESS_TOKEN_TTL,
    )


def _exigir_csrf(request: Request) -> None:
    # Cabeçalho customizado força preflight CORS: outro site não consegue mandar.
    if request.headers.get(config.CSRF_HEADER) != "1":
        raise HTTPException(status_code=403, detail="Requisição recusada.")


def _erro_codigo(resultado: dict) -> HTTPException:
    status = resultado.get("status")
    if status == "invalid":
        restantes = resultado.get("restantes", 0)
        sufixo = "tentativa" if restantes == 1 else "tentativas"
        return HTTPException(status_code=400, detail=f"Código incorreto. Você tem mais {restantes} {sufixo}.")
    if status == "locked":
        return HTTPException(status_code=400, detail="Muitas tentativas erradas. Peça um novo código.")
    return HTTPException(status_code=400, detail="Código inválido ou expirado. Peça um novo código.")


def _emitir_codigo_conta(id_user: str, email: str, proposito: str) -> None:
    codigo = gerar_otp()
    banco_dados.table("auth_codes").upsert(
        {
            "id_user": str(id_user),
            "purpose": proposito,
            "otp_hash": hash_otp(codigo, f"{proposito}:{id_user}"),
            "attempts": 0,
            "expires_at": _agora_iso(config.OTP_TTL),
            "created_at": _agora_iso(),
        },
        on_conflict="id_user,purpose",
    ).execute()
    _enviar(email_provider.enviar_codigo, email, codigo, proposito)


MSG_GENERICA_CADASTRO = (
    "Se o e-mail puder ser usado, você vai receber um código de 6 dígitos em instantes. "
    "Confira também a caixa de spam."
)

# ==================== CADASTRO ====================


@router.post("/registro/iniciar", response_model=CodigoEnviadoOut, status_code=202)
def registro_iniciar(dados: RegistroIn, request: Request):
    inicio = time.monotonic()
    ip = ip_cliente(request)
    limitar(f"reg:ip:{ip}", 600, 10)
    _verificar_turnstile(dados.turnstile_token, ip)

    # A espera entre envios vale para qualquer e-mail, exista conta ou não → não revela nada.
    _limitar_envio(dados.email, "reg")

    if _buscar_por_email(dados.email, "id_user"):
        _enviar(email_provider.enviar_aviso_conta_existente, dados.email)
    else:
        codigo = gerar_otp()
        banco_dados.table("pending_registrations").upsert(
            {
                "email": dados.email,
                "attempt_id": str(uuid.uuid4()),
                "payload": {
                    "nome": dados.nome,
                    "vinculo": dados.vinculo,
                    "senha_hash": hash_senha(dados.senha),
                    "telefone": dados.telefone or None,
                },
                "otp_hash": hash_otp(codigo, f"cadastro:{dados.email}"),
                "attempts": 0,
                "expires_at": _agora_iso(config.OTP_TTL),
                "created_at": _agora_iso(),
            },
            on_conflict="email",
        ).execute()
        _enviar(email_provider.enviar_codigo, dados.email, codigo, "cadastro")

    igualar_tempo(inicio)
    return CodigoEnviadoOut(mensagem=MSG_GENERICA_CADASTRO)


@router.post("/registro/reenviar", response_model=CodigoEnviadoOut, status_code=202)
def registro_reenviar(dados: EmailIn, request: Request):
    inicio = time.monotonic()
    limitar(f"reg:ip:{ip_cliente(request)}", 600, 10)
    _limitar_envio(dados.email, "reg")

    pendente = (
        banco_dados.table("pending_registrations")
        .select("email, expires_at")
        .eq("email", dados.email)
        .limit(1)
        .execute()
    )
    if pendente.data:
        codigo = gerar_otp()
        banco_dados.table("pending_registrations").update(
            {
                "otp_hash": hash_otp(codigo, f"cadastro:{dados.email}"),
                "attempts": 0,
                "expires_at": _agora_iso(config.OTP_TTL),
            }
        ).eq("email", dados.email).execute()
        _enviar(email_provider.enviar_codigo, dados.email, codigo, "cadastro")

    igualar_tempo(inicio)
    return CodigoEnviadoOut(mensagem=MSG_GENERICA_CADASTRO)


@router.post("/registro/verificar", response_model=SessaoOut)
def registro_verificar(dados: VerificarRegistroIn, request: Request, response: Response):
    limitar(f"verify:ip:{ip_cliente(request)}", 600, 30)

    pendente = (
        banco_dados.table("pending_registrations")
        .select("attempt_id, payload")
        .eq("email", dados.email)
        .limit(1)
        .execute()
    )
    if not pendente.data:
        verificar_senha(dados.senha, None)  # mesmo custo de tempo
        raise HTTPException(status_code=400, detail="Código inválido ou expirado. Peça um novo código.")

    linha = pendente.data[0]
    # A senha digitada precisa bater com a do cadastro: se alguém trocar o payload entre o
    # envio do código e a confirmação, a conta não é criada com a senha do intruso.
    senha_ok = verificar_senha(dados.senha, (linha.get("payload") or {}).get("senha_hash"))

    res = banco_dados.rpc(
        "consume_registration",
        {
            "p_email": dados.email,
            "p_attempt_id": linha["attempt_id"],
            "p_otp_hash": hash_otp(dados.codigo, f"cadastro:{dados.email}"),
            "p_password_ok": senha_ok,
            "p_max_attempts": config.OTP_MAX_TENTATIVAS,
        },
    ).execute()
    resultado = res.data or {}

    if resultado.get("status") == "exists":
        raise HTTPException(status_code=409, detail="Este e-mail já tem conta. Faça login.")
    if resultado.get("status") != "ok":
        if resultado.get("status") == "invalid" and not senha_ok:
            raise HTTPException(status_code=400, detail="Código ou senha não conferem com o cadastro.")
        raise _erro_codigo(resultado)

    return _abrir_sessao(request, response, resultado["id_user"])


# ==================== LOGIN ====================

MSG_LOGIN_INVALIDO = "E-mail ou senha incorretos. Conta antiga sem senha? Use “Esqueci minha senha”."


@router.post("/login", response_model=SessaoOut | DesafioOut)
def login(dados: LoginIn, request: Request, response: Response):
    ip = ip_cliente(request)
    limitar(f"login:ip:{ip}", 600, 30)
    limitar(f"login:email:{dados.email}", 900, 10, "Muitas tentativas para esta conta. Aguarde 15 minutos.")

    usuario = _buscar_por_email(
        dados.email, "id_user, email, is_admin, senha_hash, email_verified_at"
    )
    if not verificar_senha(dados.senha, (usuario or {}).get("senha_hash")):
        raise HTTPException(status_code=401, detail=MSG_LOGIN_INVALIDO)

    if not usuario.get("email_verified_at"):
        proposito, motivo = "verify_email", "verificar_email"
    elif usuario.get("is_admin"):
        proposito, motivo = "login_2fa", "admin_2fa"
    else:
        return _abrir_sessao(request, response, usuario["id_user"])

    _limitar_envio(usuario["email"], proposito)
    _emitir_codigo_conta(usuario["id_user"], usuario["email"], proposito)
    return DesafioOut(
        desafio=criar_desafio(usuario["id_user"], proposito),
        motivo=motivo,
        email=mascarar_email(usuario["email"]),
        reenviar_em=config.OTP_REENVIO_SEGUNDOS,
    )


@router.post("/login/verificar", response_model=SessaoOut)
def login_verificar(dados: VerificarDesafioIn, request: Request, response: Response):
    limitar(f"verify:ip:{ip_cliente(request)}", 600, 30)
    desafio = decodificar_token(dados.desafio, "challenge")
    id_user, proposito = desafio["sub"], desafio.get("pur")
    if proposito not in ("verify_email", "login_2fa"):
        raise HTTPException(status_code=401, detail="Token inválido.")

    res = banco_dados.rpc(
        "consume_auth_code",
        {
            "p_id_user": id_user,
            "p_purpose": proposito,
            "p_otp_hash": hash_otp(dados.codigo, f"{proposito}:{id_user}"),
            "p_max_attempts": config.OTP_MAX_TENTATIVAS,
        },
    ).execute()
    resultado = res.data or {}
    if resultado.get("status") != "ok":
        raise _erro_codigo(resultado)
    return _abrir_sessao(request, response, id_user)


@router.post("/login/reenviar", response_model=CodigoEnviadoOut, status_code=202)
def login_reenviar(dados: DesafioIn, request: Request):
    limitar(f"reg:ip:{ip_cliente(request)}", 600, 10)
    desafio = decodificar_token(dados.desafio, "challenge")
    proposito = desafio.get("pur")
    if proposito not in ("verify_email", "login_2fa"):
        raise HTTPException(status_code=401, detail="Token inválido.")
    usuario = carregar_usuario(desafio["sub"])
    if not usuario:
        raise HTTPException(status_code=401, detail="Token inválido.")
    _limitar_envio(usuario["email"], proposito)
    _emitir_codigo_conta(usuario["id_user"], usuario["email"], proposito)
    return CodigoEnviadoOut(mensagem=f"Enviamos um novo código para {mascarar_email(usuario['email'])}.")


# ==================== SENHA ====================


@router.post("/senha/solicitar", response_model=CodigoEnviadoOut, status_code=202)
def senha_solicitar(dados: EmailIn, request: Request):
    inicio = time.monotonic()
    ip = ip_cliente(request)
    limitar(f"reset:ip:{ip}", 600, 10)
    _verificar_turnstile(dados.turnstile_token, ip)
    _limitar_envio(dados.email, "reset")

    usuario = _buscar_por_email(dados.email, "id_user, email")
    if usuario:
        _emitir_codigo_conta(usuario["id_user"], usuario["email"], "reset_password")

    igualar_tempo(inicio)
    return CodigoEnviadoOut(
        mensagem="Se existir uma conta com este e-mail, você vai receber um código em instantes."
    )


@router.post("/senha/confirmar", response_model=SessaoOut)
def senha_confirmar(dados: ConfirmarSenhaIn, request: Request, response: Response):
    limitar(f"verify:ip:{ip_cliente(request)}", 600, 30)
    usuario = _buscar_por_email(dados.email, "id_user")
    if not usuario:
        raise HTTPException(status_code=400, detail="Código inválido ou expirado. Peça um novo código.")

    id_user = usuario["id_user"]
    res = banco_dados.rpc(
        "consume_auth_code",
        {
            "p_id_user": id_user,
            "p_purpose": "reset_password",
            "p_otp_hash": hash_otp(dados.codigo, f"reset_password:{id_user}"),
            "p_max_attempts": config.OTP_MAX_TENTATIVAS,
            "p_new_senha_hash": hash_senha(dados.nova_senha),
        },
    ).execute()
    resultado = res.data or {}
    if resultado.get("status") != "ok":
        raise _erro_codigo(resultado)
    # A troca de senha já derrubou todas as sessões antigas; esta é a única nova.
    return _abrir_sessao(request, response, id_user)


# ==================== SESSÃO ====================


@router.post("/refresh", response_model=SessaoOut)
def refresh(request: Request, response: Response):
    _exigir_csrf(request)
    limitar(f"refresh:ip:{ip_cliente(request)}", 60, 60)
    antigo = request.cookies.get(config.COOKIE_NOME)
    if not antigo:
        raise HTTPException(status_code=401, detail="Sessão expirada. Faça login novamente.")

    novo, novo_hash = gerar_refresh_token()
    res = banco_dados.rpc(
        "rotate_session",
        {
            "p_old_hash": hash_refresh(antigo),
            "p_new_hash": novo_hash,
            "p_ttl_seconds": config.REFRESH_TOKEN_TTL,
            "p_user_agent": (request.headers.get("user-agent") or "")[:300],
            "p_ip": ip_cliente(request),
        },
    ).execute()
    resultado = res.data or {}
    status = resultado.get("status")

    if status == "race":
        # Outra aba acabou de renovar; o cookie novo já está no navegador. O front tenta de novo.
        raise HTTPException(status_code=409, detail="Sessão sendo renovada. Tente novamente.")
    if status != "ok":
        if status == "reuse":
            print(f"[auth] reuso de refresh token detectado para {resultado.get('id_user')}")
        _limpar_cookie(response)
        raise HTTPException(
            status_code=401,
            detail="Sessão expirada. Faça login novamente.",
            headers={"set-cookie": response.headers.get("set-cookie", "")},
        )

    usuario = carregar_usuario(resultado["id_user"])
    if not usuario or not usuario.get("email_verified_at"):
        _limpar_cookie(response)
        raise HTTPException(
            status_code=401,
            detail="Sessão expirada. Faça login novamente.",
            headers={"set-cookie": response.headers.get("set-cookie", "")},
        )

    _set_cookie(response, novo)
    return SessaoOut(
        user=_usuario_out(usuario),
        token=criar_access_token(usuario["id_user"], resultado["token_version"]),
        expira_em=config.ACCESS_TOKEN_TTL,
    )


@router.post("/logout", response_model=MensagemOut)
def logout(request: Request, response: Response):
    _exigir_csrf(request)
    token = request.cookies.get(config.COOKIE_NOME)
    if token:
        banco_dados.table("sessions").update({"revoked_at": _agora_iso()}).eq(
            "refresh_hash", hash_refresh(token)
        ).execute()
    _limpar_cookie(response)
    return MensagemOut(mensagem="Sessão encerrada.")


@router.post("/logout-todos", response_model=MensagemOut)
def logout_todos(request: Request, response: Response, usuario: dict = Depends(get_current_user_row)):
    _exigir_csrf(request)
    banco_dados.rpc("bump_token_version", {"p_id_user": usuario["id_user"]}).execute()
    _limpar_cookie(response)
    return MensagemOut(mensagem="Todas as sessões foram encerradas.")


@router.get("/me", response_model=UsuarioOut)
def me(usuario: dict = Depends(get_current_user_row)):
    return _usuario_out(usuario)
