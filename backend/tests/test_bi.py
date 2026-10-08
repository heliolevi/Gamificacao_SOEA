"""Relatório para o Power BI (/bi/*). Não precisa de Postgres: o banco é substituído por um falso."""
import sys
import types

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from bi_montagem import contar_por_usuario, montar_capturas, montar_participantes
from vinculos import VINCULOS

CHAVE = "k" * 48

USUARIOS = [
    {"id_user": "u1", "nome": "Ana Souza", "vinculo": "comunidade", "pontos": 120, "data_registro": "2026-10-05T12:00:00+00:00"},
    {"id_user": "u2", "nome": "Bruno Lima", "vinculo": "startup_do_sistema", "pontos": 0, "data_registro": "2026-10-06T09:30:00+00:00"},
    {"id_user": "u3", "nome": "Conta Antiga", "vinculo": None, "pontos": 50, "data_registro": "2026-09-01T10:00:00+00:00"},
]
CATCH = [
    {"id_user": "u1", "code_hash": "h1", "catch_time": "2026-10-05T13:00:00+00:00"},
    {"id_user": "u1", "code_hash": "h2", "catch_time": "2026-10-05T13:05:00+00:00"},
    {"id_user": "u3", "code_hash": "h1", "catch_time": "2026-10-06T08:00:00+00:00"},
    {"id_user": "admin1", "code_hash": "h1", "catch_time": "2026-10-06T08:10:00+00:00"},
]
QRCODES = [{"code_hash": "h1", "local": "Auditório", "pontos": 50}, {"code_hash": "h2", "local": "Feira", "pontos": 30}]
RESPOSTAS = [{"id_user": "u1"}, {"id_user": "u1"}, {"id_user": "u3"}]


# ---------- montagem ----------

def test_participantes_com_vinculo_contagens_e_nivel():
    p = {r["id_participante"]: r for r in montar_participantes(USUARIOS, contar_por_usuario(CATCH), contar_por_usuario(RESPOSTAS))}
    assert p["u1"]["vinculo"] == "comunidade" and p["u1"]["vinculo_rotulo"] == "Comunidade"
    assert (p["u1"]["qrs_capturados"], p["u1"]["perguntas_respondidas"], p["u1"]["pontos"]) == (2, 2, 120)
    assert p["u2"]["qrs_capturados"] == 0 and p["u2"]["perguntas_respondidas"] == 0
    assert p["u2"]["vinculo_rotulo"] == "Startup do Sistema"
    assert p["u1"]["nivel"] >= 1


def test_conta_antiga_sem_vinculo_vira_nao_informado():
    p = {r["id_participante"]: r for r in montar_participantes(USUARIOS, contar_por_usuario(CATCH), contar_por_usuario(RESPOSTAS))}
    assert p["u3"]["vinculo"] == "nao_informado" and p["u3"]["vinculo_rotulo"] == "Não informado"


def test_vinculo_desconhecido_nao_quebra():
    r = montar_participantes([{**USUARIOS[0], "vinculo": "algo-que-nao-existe"}], contar_por_usuario([]), contar_por_usuario([]))
    assert r[0]["vinculo"] == "nao_informado"


def test_todos_os_vinculos_tem_rotulo():
    assert len(VINCULOS) == 6
    for slug, rotulo in VINCULOS.items():
        r = montar_participantes([{**USUARIOS[0], "vinculo": slug}], contar_por_usuario([]), contar_por_usuario([]))[0]
        assert (r["vinculo"], r["vinculo_rotulo"]) == (slug, rotulo)


def test_capturas_ignoram_admin_e_trazem_o_local():
    cap = montar_capturas(CATCH, QRCODES, {"u1", "u2", "u3"})
    assert len(cap) == 3 and all(c["id_participante"] != "admin1" for c in cap)
    assert {c["local"] for c in cap} == {"Auditório", "Feira"}
    assert cap[0]["pontos_qr"] == 50


def test_captura_de_qr_apagado_nao_quebra():
    cap = montar_capturas([{"id_user": "u1", "code_hash": "sumiu", "catch_time": "2026-10-05T13:00:00+00:00"}], QRCODES, {"u1"})
    assert cap[0]["local"] == "Desconhecido" and cap[0]["pontos_qr"] == 0


# ---------- rotas (banco falso) ----------

class _Consulta:
    def __init__(self, dados):
        self._dados = dados
        self.filtros = []

    def select(self, *a, **k): return self
    def order(self, *a, **k): return self
    def limit(self, *a, **k): return self

    def eq(self, col, val):
        self.filtros.append((col, val))
        return self

    def execute(self):
        dados = self._dados
        for col, val in self.filtros:
            dados = [d for d in dados if d.get(col) == val]
        return types.SimpleNamespace(data=dados)


class _BancoFalso:
    def __init__(self):
        # is_admin é filtrado no banco pelo .eq("is_admin", False); o falso respeita isso.
        self.tabelas = {
            "users": [{**u, "is_admin": False, "email": "x@y.com", "telefone": "98999999999"} for u in USUARIOS]
            + [{"id_user": "admin1", "nome": "Admin", "vinculo": None, "pontos": 0, "data_registro": None, "is_admin": True}],
            "catch": CATCH,
            "user_perguntas": RESPOSTAS,
            "qrcodes": QRCODES,
        }

    def table(self, nome):
        return _Consulta(self.tabelas[nome])


@pytest.fixture()
def bi_client(monkeypatch):
    # `bi` e `security` importam `database` (que abriria conexão): injeta um falso e isola no teste.
    monkeypatch.setitem(sys.modules, "database", types.SimpleNamespace(banco_dados=_BancoFalso()))
    for m in ("bi", "security"):
        monkeypatch.delitem(sys.modules, m, raising=False)
    import bi

    monkeypatch.setattr(bi, "limitar", lambda *a, **k: None)
    monkeypatch.setattr(bi.config, "BI_API_KEY", CHAVE)
    app = FastAPI()
    app.include_router(bi.router)
    return TestClient(app), bi


def test_sem_chave_configurada_a_rota_nao_existe(bi_client, monkeypatch):
    client, bi = bi_client
    monkeypatch.setattr(bi.config, "BI_API_KEY", "")
    assert client.get("/bi/participantes", headers={"X-API-Key": CHAVE}).status_code == 404


def test_chave_ausente_ou_errada_e_401(bi_client):
    client, _ = bi_client
    assert client.get("/bi/participantes").status_code == 401
    assert client.get("/bi/participantes", headers={"X-API-Key": "errada"}).status_code == 401
    assert client.get("/bi/capturas", headers={"Authorization": "Bearer errada"}).status_code == 401


def test_chave_certa_por_header_ou_bearer(bi_client):
    client, _ = bi_client
    assert client.get("/bi/participantes", headers={"X-API-Key": CHAVE}).status_code == 200
    assert client.get("/bi/participantes", headers={"Authorization": f"Bearer {CHAVE}"}).status_code == 200


def test_participantes_sem_dados_pessoais_e_sem_admin(bi_client):
    client, _ = bi_client
    r = client.get("/bi/participantes", headers={"X-API-Key": CHAVE})
    corpo = r.json()
    assert r.headers["cache-control"] == "no-store"
    assert corpo["total"] == 3 and len(corpo["participantes"]) == 3
    assert "admin1" not in r.text and "Admin" not in r.text
    for proibido in ("email", "telefone", "senha", "x@y.com", "98999999999", "is_admin"):
        assert proibido not in r.text
    por_id = {p["id_participante"]: p for p in corpo["participantes"]}
    assert por_id["u1"]["qrs_capturados"] == 2 and por_id["u3"]["vinculo"] == "nao_informado"


def test_capturas_so_de_participantes(bi_client):
    client, _ = bi_client
    corpo = client.get("/bi/capturas", headers={"X-API-Key": CHAVE}).json()
    assert corpo["total"] == 3
    assert all(c["id_participante"] in {"u1", "u2", "u3"} for c in corpo["capturas"])
