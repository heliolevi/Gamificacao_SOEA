"""
Testes de integração da autenticação contra um Postgres local REAL (as funções SQL da
migração rodam de verdade). O cliente do Supabase é trocado por um adaptador mínimo
que traduz as chamadas usadas pelo backend para SQL.

Rodar:  TEST_PG_DSN=postgresql://postgres@localhost:5432/postgres pytest backend/tests -q
"""
import datetime as dt
import os
import sys
import types
import uuid
from decimal import Decimal
from pathlib import Path

import psycopg
import pytest
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

BACKEND = Path(__file__).resolve().parents[1]
DSN = os.getenv("TEST_PG_DSN", "host=/tmp port=5544 user=postgres")
DB = "soea_test"

os.environ.update(
    {
        "ENV": "test",
        "JWT_SECRET": "x" * 48,
        "OTP_PEPPER": "p" * 48,
        "COOKIE_SECURE": "false",
        "COOKIE_PATH": "/auth",
        "RESEND_API_KEY": "",
        "BREVO_API_KEY": "",
        "TURNSTILE_SECRET": "",
    }
)

UUID_PARAMS = {"p_attempt_id", "p_id_user"}


def _saida(v):
    if isinstance(v, uuid.UUID):
        return str(v)
    if isinstance(v, (dt.datetime, dt.date)):
        return v.isoformat()
    if isinstance(v, Decimal):
        return int(v)
    return v


def _linha(r):
    return {k: _saida(v) for k, v in r.items()}


class _Res:
    def __init__(self, data, count=None):
        self.data = data
        self.count = count


class _Query:
    def __init__(self, conn, tabela):
        self.conn, self.tabela = conn, tabela
        self.op, self.cols, self.dados, self.conflito = None, "*", None, None
        self.filtros, self.lim, self.unico = [], None, False

    def select(self, *cols, count=None):
        self.op, self.cols = "select", ", ".join(cols) if cols else "*"
        return self

    def insert(self, dados):
        self.op, self.dados = "insert", dados
        return self

    def update(self, dados):
        self.op, self.dados = "update", dados
        return self

    def upsert(self, dados, on_conflict=None):
        self.op, self.dados, self.conflito = "upsert", dados, on_conflict
        return self

    def eq(self, col, val):
        self.filtros.append((col, val))
        return self

    def limit(self, n):
        self.lim = n
        return self

    def single(self):
        self.unico = True
        return self

    def order(self, *a, **k):
        return self

    @staticmethod
    def _v(v):
        return Jsonb(v) if isinstance(v, (dict, list)) else v

    def _where(self):
        if not self.filtros:
            return "", []
        return " where " + " and ".join(f"{c}::text = %s" for c, _ in self.filtros), [str(v) for _, v in self.filtros]

    def execute(self):
        where, params = self._where()
        with self.conn.cursor(row_factory=dict_row) as cur:
            if self.op == "select":
                sql = f"select {self.cols} from {self.tabela}{where}" + (f" limit {self.lim}" if self.lim else "")
                cur.execute(sql, params)
                rows = [_linha(r) for r in cur.fetchall()]
                return _Res(rows[0] if self.unico and rows else (None if self.unico else rows))
            cols = list(self.dados.keys())
            vals = [self._v(self.dados[c]) for c in cols]
            if self.op == "insert":
                sql = f"insert into {self.tabela} ({', '.join(cols)}) values ({', '.join(['%s'] * len(cols))}) returning *"
                cur.execute(sql, vals)
            elif self.op == "upsert":
                alvo = self.conflito
                sets = ", ".join(f"{c} = excluded.{c}" for c in cols)
                sql = (
                    f"insert into {self.tabela} ({', '.join(cols)}) values ({', '.join(['%s'] * len(cols))}) "
                    f"on conflict ({alvo}) do update set {sets} returning *"
                )
                cur.execute(sql, vals)
            elif self.op == "update":
                sets = ", ".join(f"{c} = %s" for c in cols)
                cur.execute(f"update {self.tabela} set {sets}{where} returning *", vals + params)
            return _Res([_linha(r) for r in cur.fetchall()])


class _Rpc:
    def __init__(self, conn, nome, params):
        self.conn, self.nome, self.params = conn, nome, params

    def execute(self):
        if self.nome == "get_enum_values":
            return _Res(["UNDB", "UFMA", "Outra"])
        args = ", ".join(f"{k} => %s{'::uuid' if k in UUID_PARAMS else ''}" for k in self.params)
        with self.conn.cursor() as cur:
            cur.execute(f"select public.{self.nome}({args})", list(self.params.values()))
            return _Res(cur.fetchone()[0])


class FakeSupabase:
    def __init__(self, conn):
        self.conn = conn

    def table(self, nome):
        return _Query(self.conn, nome)

    def rpc(self, nome, params):
        return _Rpc(self.conn, nome, params)


class EmailsCapturados:
    def __init__(self):
        self.enviados = []

    def enviar(self, para, assunto, html, texto):
        self.enviados.append({"para": para, "assunto": assunto, "texto": texto})

    def ultimo_codigo(self, para):
        import re

        for m in reversed(self.enviados):
            if m["para"] == para:
                achado = re.search(r"Seu código: (\d{6})", m["texto"])
                if achado:
                    return achado.group(1)
        return None


@pytest.fixture(scope="session")
def conn():
    with psycopg.connect(DSN, autocommit=True) as admin:
        admin.execute(f"drop database if exists {DB}")
        admin.execute(f"create database {DB}")
    c = psycopg.connect(f"{DSN} dbname={DB}", autocommit=True)
    c.execute((BACKEND / "tests" / "stub_schema.sql").read_text())
    c.execute((BACKEND / "migrations" / "00_banco_novo_completo.sql").read_text())
    yield c
    c.close()


@pytest.fixture(scope="session")
def app_mod(conn):
    # usa o MESMO cliente Postgres da produção (pg_client.PgClient), não um simulador
    sys.path.insert(0, str(BACKEND))
    from pg_client import PgClient

    fake_db = types.ModuleType("database")
    fake_db.banco_dados = PgClient(f"{DSN} dbname={DB}", max_size=4)
    sys.modules["database"] = fake_db
    sys.path.insert(0, str(BACKEND))
    import main  # noqa: E402

    return main


@pytest.fixture()
def emails(app_mod):
    import email_provider

    cap = EmailsCapturados()
    email_provider.definir_provedor(cap)
    return cap


@pytest.fixture()
def client(app_mod, conn, emails, monkeypatch):
    from fastapi.testclient import TestClient
    import security

    monkeypatch.setattr(security, "igualar_tempo", lambda *a, **k: None)
    import auth_routes

    monkeypatch.setattr(auth_routes, "igualar_tempo", lambda *a, **k: None)
    conn.execute("truncate rate_limits, sessions, auth_codes, pending_registrations")
    conn.execute("delete from users")
    return TestClient(app_mod.app)
