"""Dependências de autenticação usadas pelas rotas privadas."""
from fastapi import Depends, Header, HTTPException

from database import banco_dados
from security import decodificar_token

_COLUNAS = "id_user, nome, email, pontos, is_admin, token_version, email_verified_at"


def carregar_usuario(id_user: str) -> dict | None:
    try:
        res = banco_dados.table("users").select(_COLUNAS).eq("id_user", id_user).limit(1).execute()
    except Exception:
        return None
    return res.data[0] if res.data else None


async def get_current_user_row(authorization: str = Header(None)) -> dict:
    """
    Valida o Bearer token e reconsulta o usuário no banco a cada requisição:
    - conta apagada → 401
    - token_version diferente (senha trocada, 'sair de todos', bloqueio) → 401 na hora
    - e-mail não verificado → 403
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Token ausente. Faça login novamente.")

    payload = decodificar_token(authorization.removeprefix("Bearer ").strip(), "access")
    usuario = carregar_usuario(payload["sub"])
    if not usuario:
        raise HTTPException(status_code=401, detail="Sessão inválida. Faça login novamente.")
    if int(usuario.get("token_version") or 0) != int(payload.get("tv", -1)):
        raise HTTPException(status_code=401, detail="Sessão encerrada. Faça login novamente.")
    if not usuario.get("email_verified_at"):
        raise HTTPException(status_code=403, detail="Confirme seu e-mail para continuar.")
    return usuario


async def get_current_user(usuario: dict = Depends(get_current_user_row)) -> str:
    """Compatível com as rotas antigas: devolve só o id_user autenticado."""
    return usuario["id_user"]


async def require_admin(usuario: dict = Depends(get_current_user_row)) -> str:
    """is_admin vem fresco do banco — nunca de uma claim do token."""
    if not usuario.get("is_admin"):
        raise HTTPException(status_code=403, detail="Acesso negado.")
    return usuario["id_user"]
