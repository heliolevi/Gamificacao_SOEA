"""Dados para o Power BI: relatório de participantes por vínculo.

Autenticação própria e SÓ de leitura: o Power BI manda a chave em `X-API-Key` (ou
`Authorization: Bearer`). Não usa o login dos usuários, porque o token deles expira em
15 minutos e a atualização agendada do Power BI precisa de uma credencial estável.

Privacidade (LGPD): só sai o necessário para o relatório. E-mail, telefone, senha e
contas de administrador NUNCA são enviados.

Sem BI_API_KEY configurada, as rotas respondem 404 como se não existissem.
"""
import hmac
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response

import config
from database import banco_dados
from bi_montagem import contar_por_usuario, montar_capturas, montar_participantes
from security import ip_cliente, limitar

router = APIRouter(prefix="/bi", tags=["bi"])


def _chave_enviada(request: Request) -> str:
    chave = (request.headers.get("x-api-key") or "").strip()
    if chave:
        return chave
    auth = request.headers.get("authorization") or ""
    return auth[7:].strip() if auth.lower().startswith("bearer ") else ""


def exigir_chave_bi(request: Request) -> None:
    if not config.BI_API_KEY:
        raise HTTPException(status_code=404, detail="Not Found")
    # O limite vale também para chaves erradas: trava tentativa de adivinhar.
    limitar(f"bi:ip:{ip_cliente(request)}", 600, 60)
    if not hmac.compare_digest(_chave_enviada(request).encode(), config.BI_API_KEY.encode()):
        raise HTTPException(status_code=401, detail="Chave inválida.")


# ==================== rotas ====================

def _envelope(chave: str, itens: list[dict], response: Response) -> dict:
    response.headers["Cache-Control"] = "no-store"
    return {"gerado_em": datetime.now(timezone.utc).isoformat(), "total": len(itens), chave: itens}


def _usuarios() -> list[dict]:
    return (
        banco_dados.table("users")
        .select("id_user", "nome", "vinculo", "pontos", "data_registro")
        .eq("is_admin", False)
        .order("data_registro", desc=False)
        .execute()
        .data
    )


@router.get("/participantes")
def bi_participantes(response: Response, _: None = Depends(exigir_chave_bi)):
    """Um registro por participante (sem administradores), com o vínculo escolhido no cadastro."""
    usuarios = _usuarios()
    qrs = contar_por_usuario(banco_dados.table("catch").select("id_user").execute().data)
    perguntas = contar_por_usuario(banco_dados.table("user_perguntas").select("id_user").execute().data)
    return _envelope("participantes", montar_participantes(usuarios, qrs, perguntas), response)


@router.get("/capturas")
def bi_capturas(response: Response, _: None = Depends(exigir_chave_bi)):
    """Um registro por QR Code lido: quem leu, onde e quando. Liga com /bi/participantes por id_participante."""
    ids = {str(u["id_user"]) for u in _usuarios()}
    capturas = banco_dados.table("catch").select("id_user", "code_hash", "catch_time").execute().data
    qrcodes = banco_dados.table("qrcodes").select("code_hash", "local", "pontos").execute().data
    return _envelope("capturas", montar_capturas(capturas, qrcodes, ids), response)
