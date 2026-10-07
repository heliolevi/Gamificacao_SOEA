"""Configuração central lida do ambiente. Falha cedo (na importação) se algo crítico faltar."""
import os

from dotenv import load_dotenv

load_dotenv()


def _bool(nome: str, padrao: bool) -> bool:
    valor = os.getenv(nome)
    if valor is None:
        return padrao
    return valor.strip().lower() in ("1", "true", "yes", "sim", "on")


ENV = os.getenv("ENV", "development").strip().lower()
EM_PRODUCAO = ENV == "production"

# ---- tokens ----
JWT_SECRET = os.getenv("JWT_SECRET", "")
JWT_ALGORITHM = "HS256"
JWT_ISSUER = "soea-api"
JWT_AUDIENCE = "soea-app"
ACCESS_TOKEN_TTL = int(os.getenv("ACCESS_TOKEN_TTL", 15 * 60))          # 15 min
REFRESH_TOKEN_TTL = int(os.getenv("REFRESH_TOKEN_TTL", 30 * 24 * 3600))  # 30 dias
CHALLENGE_TTL = 10 * 60                                                  # desafio de 2ª etapa

# ---- códigos por e-mail ----
OTP_PEPPER = os.getenv("OTP_PEPPER", "")
OTP_TTL = 10 * 60
OTP_MAX_TENTATIVAS = 5
OTP_REENVIO_SEGUNDOS = 60
OTP_ENVIOS_POR_HORA = 6

# ---- cookie do refresh token ----
# O front chama a API por /api/* (rewrite do Next), então o cookie é first-party.
COOKIE_NOME = "soea_rt"
COOKIE_PATH = os.getenv("COOKIE_PATH", "/api/auth")
COOKIE_SECURE = _bool("COOKIE_SECURE", True)
CSRF_HEADER = "x-soea-csrf"

# ---- e-mail ----
RESEND_API_KEY = os.getenv("RESEND_API_KEY", "")
BREVO_API_KEY = os.getenv("BREVO_API_KEY", "")
EMAIL_FROM = os.getenv("EMAIL_FROM", "SOEA <nao-responda@example.com>")

# ---- anti-bot (opcional) ----
TURNSTILE_SECRET = os.getenv("TURNSTILE_SECRET", "")

# ---- app ----
PUBLIC_APP_URL = os.getenv("PUBLIC_APP_URL", "https://qr-code-hunt.vercel.app").rstrip("/")
EVENTO_NOME = "SOEA"


def _validar() -> None:
    erros = []
    if len(JWT_SECRET) < 32:
        erros.append("JWT_SECRET ausente ou curto (mínimo 32 caracteres aleatórios).")
    if len(OTP_PEPPER) < 32:
        erros.append("OTP_PEPPER ausente ou curto (mínimo 32 caracteres aleatórios).")
    if EM_PRODUCAO and not (RESEND_API_KEY or BREVO_API_KEY):
        erros.append("BREVO_API_KEY (ou RESEND_API_KEY) é obrigatório em produção.")
    if EM_PRODUCAO and "example.com" in EMAIL_FROM:
        erros.append("EMAIL_FROM precisa usar o domínio verificado no Resend.")
    if EM_PRODUCAO and not COOKIE_SECURE:
        erros.append("COOKIE_SECURE não pode ser false em produção.")
    if erros:
        raise RuntimeError("Configuração inválida:\n- " + "\n- ".join(erros))


_validar()
