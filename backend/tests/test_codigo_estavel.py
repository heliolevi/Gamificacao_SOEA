"""Código estável do cadastro: o reenvio manda o mesmo código. Não precisa de Postgres."""
import sys
import types

import pytest


@pytest.fixture()
def security(monkeypatch):
    # `security` importa `database` (que abriria conexão): injeta um falso e isola no teste.
    monkeypatch.setitem(sys.modules, "database", types.SimpleNamespace(banco_dados=object()))
    monkeypatch.delitem(sys.modules, "security", raising=False)
    import security as mod

    monkeypatch.setattr(mod.config, "OTP_PEPPER", "p" * 48)
    return mod


def test_mesmo_contexto_mesmo_codigo(security):
    a = security.codigo_estavel("cadastro:a@b.com:tentativa-1")
    assert a == security.codigo_estavel("cadastro:a@b.com:tentativa-1")
    assert len(a) == 6 and a.isdigit()


def test_tentativa_nova_ou_outro_email_muda_o_codigo(security):
    base = security.codigo_estavel("cadastro:a@b.com:tentativa-1")
    variados = {security.codigo_estavel(f"cadastro:a@b.com:tentativa-{i}") for i in range(2, 40)}
    assert base not in variados and len(variados) > 30
    assert security.codigo_estavel("cadastro:outro@b.com:tentativa-1") != base


def test_pepper_diferente_gera_codigo_diferente(security, monkeypatch):
    a = security.codigo_estavel("cadastro:a@b.com:t")
    monkeypatch.setattr(security.config, "OTP_PEPPER", "q" * 48)
    assert security.codigo_estavel("cadastro:a@b.com:t") != a


def test_cadastro_vale_30_minutos(security):
    assert security.config.OTP_TTL_CADASTRO == 30 * 60 > security.config.OTP_TTL
