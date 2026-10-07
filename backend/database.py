import os

import jwt
from dotenv import load_dotenv

load_dotenv()

"""
Escolha do banco:
- DATABASE_URL preenchido → Postgres direto (Neon, Railway, Render, Docker, local…).
- Senão → Supabase (SUPABASE_URL + SUPABASE_KEY de servidor).
O resto do backend usa `banco_dados` igual nos dois casos.
"""

DATABASE_URL = (os.getenv("DATABASE_URL") or "").strip()


def _papel_da_chave(chave: str) -> str | None:
    """Descobre se a chave do Supabase é de servidor (service_role) ou pública (anon)."""
    if not chave:
        return None
    if chave.startswith("sb_secret_"):
        return "service_role"
    if chave.startswith("sb_publishable_"):
        return "anon"
    try:
        return jwt.decode(chave, options={"verify_signature": False}).get("role")
    except jwt.PyJWTError:
        return None


if DATABASE_URL:
    from pg_client import PgClient

    banco_dados = PgClient(DATABASE_URL, max_size=int(os.getenv("DB_POOL_MAX", "10")))
else:
    from supabase import create_client

    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")
    # Com RLS ligado e sem políticas para anon, só a chave de servidor enxerga as tabelas.
    if _papel_da_chave(key) != "service_role":
        raise RuntimeError(
            "Configure DATABASE_URL (Postgres direto) ou SUPABASE_KEY com a chave de servidor "
            "(service_role ou sb_secret_...). Nunca use a chave de servidor no frontend."
        )
    banco_dados = create_client(url, key)
