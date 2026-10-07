"""Envio de e-mail atrás de uma interface simples — trocar de provedor (Brevo, Resend...) é mexer só aqui."""
from html import escape
from typing import Protocol

import httpx

import config


class EmailProvider(Protocol):
    def enviar(self, para: str, assunto: str, html: str, texto: str) -> None: ...


class ResendProvider:
    URL = "https://api.resend.com/emails"

    def __init__(self, api_key: str, remetente: str):
        self.api_key = api_key
        self.remetente = remetente

    def enviar(self, para: str, assunto: str, html: str, texto: str) -> None:
        resposta = httpx.post(
            self.URL,
            headers={"Authorization": f"Bearer {self.api_key}"},
            json={"from": self.remetente, "to": [para], "subject": assunto, "html": html, "text": texto},
            timeout=10,
        )
        if resposta.status_code >= 400:
            # Não loga o corpo do e-mail (contém o código); só o status e a resposta do provedor.
            raise RuntimeError(f"Resend respondeu {resposta.status_code}: {resposta.text[:300]}")


class BrevoProvider:
    URL = "https://api.brevo.com/v3/smtp/email"

    def __init__(self, api_key: str, remetente: str):
        self.api_key = api_key
        # EMAIL_FROM no formato "Nome <email@dominio>"; o e-mail precisa estar verificado como remetente na Brevo.
        nome, _, resto = remetente.partition("<")
        if resto:
            self.remetente = {"name": nome.strip() or config.EVENTO_NOME, "email": resto.rstrip("> ").strip()}
        else:
            self.remetente = {"name": config.EVENTO_NOME, "email": remetente.strip()}

    def enviar(self, para: str, assunto: str, html: str, texto: str) -> None:
        resposta = httpx.post(
            self.URL,
            headers={"api-key": self.api_key, "accept": "application/json"},
            json={
                "sender": self.remetente,
                "to": [{"email": para}],
                "subject": assunto,
                "htmlContent": html,
                "textContent": texto,
            },
            timeout=10,
        )
        if resposta.status_code >= 400:
            # Não loga o corpo do e-mail (contém o código); só o status e a resposta do provedor.
            raise RuntimeError(f"Brevo respondeu {resposta.status_code}: {resposta.text[:300]}")


class ConsoleProvider:
    """Só para desenvolvimento local: imprime o e-mail no terminal do uvicorn."""

    def enviar(self, para: str, assunto: str, html: str, texto: str) -> None:
        print(f"\n[email:dev] para={para}\n[email:dev] assunto={assunto}\n{texto}\n")


_provedor: EmailProvider | None = None


def provedor() -> EmailProvider:
    global _provedor
    if _provedor is None:
        if config.BREVO_API_KEY:
            _provedor = BrevoProvider(config.BREVO_API_KEY, config.EMAIL_FROM)
        elif config.RESEND_API_KEY:
            _provedor = ResendProvider(config.RESEND_API_KEY, config.EMAIL_FROM)
        elif not config.EM_PRODUCAO:
            _provedor = ConsoleProvider()
        else:
            raise RuntimeError("Nenhum provedor de e-mail configurado.")
    return _provedor


def definir_provedor(p: EmailProvider) -> None:
    """Usado nos testes."""
    global _provedor
    _provedor = p


# ==================== MODELOS ====================

_NAVY_900 = "#0B0D24"
_NAVY_800 = "#12153A"
_ORANGE = "#EB5D2B"


def _layout(titulo: str, corpo_html: str) -> str:
    return f"""<!doctype html>
<html lang="pt-BR"><body style="margin:0;background:{_NAVY_900};font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#F3F4FA">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:{_NAVY_900};padding:32px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:460px;background:{_NAVY_800};border-radius:20px;padding:32px 28px">
<tr><td style="font-size:13px;letter-spacing:4px;font-weight:700;color:{_ORANGE}">{config.EVENTO_NOME}</td></tr>
<tr><td style="padding-top:12px;font-size:22px;font-weight:700;line-height:1.3">{escape(titulo)}</td></tr>
<tr><td style="padding-top:16px;font-size:15px;line-height:1.6;color:#C9CBE6">{corpo_html}</td></tr>
<tr><td style="padding-top:28px;font-size:12px;line-height:1.5;color:#7E82AE">Se não foi você, ignore este e-mail. Ninguém da equipe {config.EVENTO_NOME} vai pedir este código.</td></tr>
</table></td></tr></table></body></html>"""


def _bloco_codigo(codigo: str) -> str:
    digitos = " ".join(codigo)
    return (
        f'<div style="margin:22px 0 6px;padding:18px 0;border-radius:14px;background:{_NAVY_900};'
        f'text-align:center;font-size:34px;font-weight:800;letter-spacing:6px;color:{_ORANGE}">{digitos}</div>'
    )


_ASSUNTOS = {
    "cadastro": "seu código para criar a conta",
    "verify_email": "confirme seu e-mail",
    "login_2fa": "código de acesso do painel",
    "reset_password": "código para redefinir a senha",
}

_TITULOS = {
    "cadastro": "Falta pouco para entrar no jogo",
    "verify_email": "Confirme seu e-mail para continuar",
    "login_2fa": "Confirme seu acesso de administrador",
    "reset_password": "Redefina sua senha",
}


def enviar_codigo(para: str, codigo: str, proposito: str) -> None:
    minutos = config.OTP_TTL // 60
    titulo = _TITULOS[proposito]
    assunto = f"{config.EVENTO_NOME} · {_ASSUNTOS[proposito]}"
    html = _layout(
        titulo,
        f"Use o código abaixo no app. Ele vale por {minutos} minutos e só funciona uma vez."
        + _bloco_codigo(codigo),
    )
    texto = (
        f"{config.EVENTO_NOME} — {titulo}\n\nSeu código: {codigo}\n"
        f"Vale por {minutos} minutos e só funciona uma vez.\n\nSe não foi você, ignore este e-mail."
    )
    provedor().enviar(para, assunto, html, texto)


def enviar_aviso_conta_existente(para: str) -> None:
    titulo = "Você já tem uma conta"
    html = _layout(
        titulo,
        "Alguém (provavelmente você) tentou criar uma conta nova com este e-mail. "
        "Como ele já está cadastrado, basta entrar com sua senha. "
        "Esqueceu? Use <b>Esqueci minha senha</b> na tela de login.",
    )
    texto = (
        f"{config.EVENTO_NOME} — {titulo}\n\nAlguém tentou criar uma conta nova com este e-mail. "
        "Ele já está cadastrado: entre com sua senha ou use 'Esqueci minha senha'."
    )
    provedor().enviar(para, f"{config.EVENTO_NOME} · {titulo.lower()}", html, texto)
