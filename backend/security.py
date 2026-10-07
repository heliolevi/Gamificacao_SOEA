"""Primitivas de segurança: senhas, códigos de uso único, JWT, refresh token, IP e rate limit."""
import hashlib
import hmac
import secrets
import time
import uuid

import jwt
from fastapi import HTTPException, Request
from passlib.hash import pbkdf2_sha256

import config
from database import banco_dados

# ==================== SENHAS ====================

# Hash de uma senha qualquer, usado para gastar o mesmo tempo quando o e-mail não existe
# (impede descobrir quais e-mails têm conta medindo o tempo de resposta do login).
_HASH_FALSO = pbkdf2_sha256.hash(secrets.token_urlsafe(16))


def hash_senha(senha: str) -> str:
    return pbkdf2_sha256.hash(senha)


def verificar_senha(senha: str, senha_hash: str | None) -> bool:
    if not senha_hash:
        pbkdf2_sha256.verify(senha, _HASH_FALSO)
        return False
    try:
        return pbkdf2_sha256.verify(senha, senha_hash)
    except (ValueError, TypeError):
        return False


# ==================== CÓDIGOS POR E-MAIL ====================

def gerar_otp() -> str:
    """Código numérico de 6 dígitos vindo de fonte criptográfica."""
    return f"{secrets.randbelow(10**6):06d}"


def hash_otp(codigo: str, contexto: str) -> str:
    """HMAC do código amarrado ao contexto (e-mail/propósito). O código nunca vai para o banco."""
    mensagem = f"{contexto}:{codigo}".encode()
    return hmac.new(config.OTP_PEPPER.encode(), mensagem, hashlib.sha256).hexdigest()


def mascarar_email(email: str) -> str:
    nome, _, dominio = email.partition("@")
    visivel = nome[:2] if len(nome) > 3 else nome[:1]
    return f"{visivel}{'•' * max(len(nome) - len(visivel), 2)}@{dominio}"


# ==================== JWT ====================

def _agora() -> int:
    return int(time.time())


def criar_access_token(id_user: str, token_version: int) -> str:
    agora = _agora()
    payload = {
        "sub": str(id_user),
        "tv": int(token_version),
        "typ": "access",
        "iat": agora,
        "nbf": agora,
        "exp": agora + config.ACCESS_TOKEN_TTL,
        "jti": uuid.uuid4().hex,
        "iss": config.JWT_ISSUER,
        "aud": config.JWT_AUDIENCE,
    }
    return jwt.encode(payload, config.JWT_SECRET, algorithm=config.JWT_ALGORITHM)


def criar_desafio(id_user: str, proposito: str) -> str:
    """Token curto que representa 'senha conferida, falta o código do e-mail'."""
    agora = _agora()
    payload = {
        "sub": str(id_user),
        "typ": "challenge",
        "pur": proposito,
        "iat": agora,
        "exp": agora + config.CHALLENGE_TTL,
        "jti": uuid.uuid4().hex,
        "iss": config.JWT_ISSUER,
        "aud": config.JWT_AUDIENCE,
    }
    return jwt.encode(payload, config.JWT_SECRET, algorithm=config.JWT_ALGORITHM)


def decodificar_token(token: str, tipo_esperado: str) -> dict:
    """Valida assinatura, emissor, audiência, validade e tipo. Erro genérico para o cliente."""
    try:
        payload = jwt.decode(
            token,
            config.JWT_SECRET,
            algorithms=[config.JWT_ALGORITHM],
            audience=config.JWT_AUDIENCE,
            issuer=config.JWT_ISSUER,
            options={"require": ["exp", "iat", "sub", "typ", "iss", "aud"]},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Sessão expirada. Faça login novamente.")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Token inválido.")
    if payload.get("typ") != tipo_esperado:
        raise HTTPException(status_code=401, detail="Token inválido.")
    return payload


# ==================== REFRESH TOKEN ====================

def gerar_refresh_token() -> tuple[str, str]:
    """Retorna (token, hash). Só o hash vai para o banco; o token só existe no cookie."""
    token = secrets.token_urlsafe(48)
    return token, hash_refresh(token)


def hash_refresh(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


# ==================== IP E RATE LIMIT ====================

def ip_cliente(request: Request) -> str:
    """IP real do usuário atrás da Vercel (x-real-ip), com fallback para x-forwarded-for."""
    ip = (request.headers.get("x-real-ip") or "").strip()
    if not ip:
        encaminhado = request.headers.get("x-forwarded-for") or ""
        ip = encaminhado.split(",")[0].strip()
    if not ip and request.client:
        ip = request.client.host
    return ip[:64] or "desconhecido"


def limitar(chave: str, janela_segundos: int, limite: int, mensagem: str | None = None) -> None:
    """Conta uma tentativa no banco (vale entre todas as instâncias). Estourou → 429."""
    try:
        res = banco_dados.rpc(
            "rl_hit", {"p_key": chave, "p_window_seconds": janela_segundos, "p_limit": limite}
        ).execute()
        dentro = bool(res.data)
    except Exception as e:  # falha fechada: sem contador, sem tentativa
        print(f"[rate-limit] erro ao consultar contador: {e}")
        raise HTTPException(status_code=503, detail="Serviço temporariamente indisponível. Tente em instantes.")
    if not dentro:
        raise HTTPException(
            status_code=429,
            detail=mensagem or "Muitas tentativas. Aguarde um pouco e tente de novo.",
            headers={"Retry-After": str(janela_segundos)},
        )


def igualar_tempo(inicio: float, minimo: float = 0.9) -> None:
    """Faz respostas 'existe'/'não existe' levarem o mesmo tempo (anti-enumeração)."""
    restante = minimo - (time.monotonic() - inicio)
    if restante > 0:
        time.sleep(restante + secrets.randbelow(120) / 1000)
