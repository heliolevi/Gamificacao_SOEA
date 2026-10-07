"""
Cliente Postgres direto (sem Supabase).

Implementa o mesmo "jeito de perguntar" que o backend já usa com o cliente do Supabase
(`banco_dados.table("users").select(...).eq(...).execute()` e `banco_dados.rpc(...)`),
só que falando SQL direto com qualquer Postgres: Neon, Railway, Render, Docker ou um
Postgres instalado no computador. Assim nenhuma rota precisou mudar.

Segurança:
- Valores SEMPRE vão como parâmetros (%s); nunca são colados no SQL.
- Nomes de tabela e coluna vêm do código, mas mesmo assim passam por uma lista
  de caracteres permitidos antes de entrar no SQL.
"""
from __future__ import annotations

import datetime as dt
import re
import uuid
from decimal import Decimal
from typing import Any

from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool

_IDENT = re.compile(r"^[a-z_][a-z0-9_]*$")
# parâmetros de funções SQL que são uuid (o Postgres não converte texto→uuid sozinho em chamadas nomeadas)
_PARAMS_UUID = {"p_attempt_id", "p_id_user"}
# "tabela(count)" dentro do select → contagem de linhas relacionadas pela coluna id_user
_EMBED_COUNT = re.compile(r"^([a-z_][a-z0-9_]*)\(count\)$")


def _ident(nome: str) -> str:
    nome = nome.strip()
    if not _IDENT.match(nome):
        raise ValueError(f"Identificador SQL inválido: {nome!r}")
    return nome


def _saida(v: Any) -> Any:
    if isinstance(v, uuid.UUID):
        return str(v)
    if isinstance(v, (dt.datetime, dt.date)):
        return v.isoformat()
    if isinstance(v, Decimal):
        return int(v) if v == int(v) else float(v)
    return v


def _entrada(v: Any) -> Any:
    return Jsonb(v) if isinstance(v, (dict, list)) else v


class Resultado:
    def __init__(self, data: Any, count: int | None = None):
        self.data = data
        self.count = count


class Consulta:
    _OPS = {"eq": "=", "neq": "<>", "gt": ">", "gte": ">=", "lt": "<", "lte": "<="}

    def __init__(self, pool: ConnectionPool, tabela: str):
        self._pool = pool
        self._tabela = _ident(tabela)
        self._op = "select"
        self._cols: list[str] = []
        self._contar = False
        self._dados: Any = None
        self._conflito: str | None = None
        self._where: list[tuple[str, list[Any]]] = []
        self._ordem: list[str] = []
        self._limite: int | None = None
        self._unico = False

    # ── operações ──
    def select(self, *cols: str, count: str | None = None):
        self._op = "select"
        partes: list[str] = []
        for c in cols:
            partes += [p.strip() for p in c.split(",") if p.strip()]
        self._cols = partes or ["*"]
        self._contar = count == "exact"
        return self

    def insert(self, dados):
        self._op, self._dados = "insert", dados
        return self

    def update(self, dados: dict):
        self._op, self._dados = "update", dados
        return self

    def upsert(self, dados, on_conflict: str | None = None):
        self._op, self._dados, self._conflito = "upsert", dados, on_conflict
        return self

    def delete(self):
        self._op = "delete"
        return self

    # ── filtros ──
    def _filtro(self, col: str, op: str, val: Any):
        self._where.append((f"{_ident(col)} {op} %s", [_entrada(val)]))
        return self

    def eq(self, col, val):
        if val is None:
            self._where.append((f"{_ident(col)} is null", []))
            return self
        return self._filtro(col, "=", val)

    def neq(self, col, val):
        return self._filtro(col, "<>", val)

    def gt(self, col, val):
        return self._filtro(col, ">", val)

    def gte(self, col, val):
        return self._filtro(col, ">=", val)

    def lt(self, col, val):
        return self._filtro(col, "<", val)

    def lte(self, col, val):
        return self._filtro(col, "<=", val)

    def in_(self, col, valores):
        valores = list(valores)
        if not valores:
            self._where.append(("false", []))
        else:
            self._where.append((f"{_ident(col)} = any(%s)", [valores]))
        return self

    def or_(self, expressao: str):
        """Suporta o formato do PostgREST usado no projeto:
        "and(a.eq.1,b.eq.2),and(a.eq.2,b.eq.1)" e também "a.eq.1,b.eq.2"."""
        grupos = re.findall(r"and\(([^()]*)\)", expressao)
        itens = grupos if grupos else expressao.split(",")
        sqls, params = [], []
        for item in itens:
            conds = []
            for cond in item.split(","):
                col, op, val = cond.split(".", 2)
                if op not in self._OPS:
                    raise ValueError(f"Operador não suportado em or_: {op}")
                conds.append(f"{_ident(col)} {self._OPS[op]} %s")
                params.append(val)
            sqls.append("(" + " and ".join(conds) + ")")
        self._where.append(("(" + " or ".join(sqls) + ")", params))
        return self

    def order(self, col: str, desc: bool = False):
        self._ordem.append(f"{_ident(col)} {'desc' if desc else 'asc'}")
        return self

    def limit(self, n: int):
        self._limite = int(n)
        return self

    def single(self):
        self._unico = True
        return self

    # ── execução ──
    def _sql_where(self) -> tuple[str, list[Any]]:
        if not self._where:
            return "", []
        params: list[Any] = []
        for _, p in self._where:
            params += p
        return " where " + " and ".join(s for s, _ in self._where), params

    def _colunas_select(self) -> str:
        saida = []
        for c in self._cols:
            m = _EMBED_COUNT.match(c)
            if m:
                rel = _ident(m.group(1))
                saida.append(
                    f"json_build_array(json_build_object('count', "
                    f"(select count(*) from {rel} r where r.id_user = {self._tabela}.id_user))) as {rel}"
                )
            elif c == "*":
                saida.append("*")
            else:
                saida.append(_ident(c))
        return ", ".join(saida)

    def execute(self) -> Resultado:
        where, params = self._sql_where()
        with self._pool.connection() as conn, conn.cursor(row_factory=dict_row) as cur:
            if self._op == "select":
                sql = f"select {self._colunas_select()} from {self._tabela}{where}"
                if self._ordem:
                    sql += " order by " + ", ".join(self._ordem)
                if self._limite is not None:
                    sql += f" limit {self._limite}"
                cur.execute(sql, params)
                linhas = [{k: _saida(v) for k, v in r.items()} for r in cur.fetchall()]
                total = None
                if self._contar:
                    cur.execute(f"select count(*) as n from {self._tabela}{where}", params)
                    total = cur.fetchone()["n"]
                if self._unico:
                    return Resultado(linhas[0] if linhas else None, total)
                return Resultado(linhas, total)

            if self._op == "delete":
                cur.execute(f"delete from {self._tabela}{where} returning *", params)
                return Resultado([{k: _saida(v) for k, v in r.items()} for r in cur.fetchall()])

            lote = self._dados if isinstance(self._dados, list) else [self._dados]
            retorno: list[dict] = []
            for dados in lote:
                cols = [_ident(c) for c in dados.keys()]
                vals = [_entrada(dados[c]) for c in dados.keys()]
                if self._op == "update":
                    sets = ", ".join(f"{c} = %s" for c in cols)
                    cur.execute(f"update {self._tabela} set {sets}{where} returning *", vals + params)
                else:
                    sql = f"insert into {self._tabela} ({', '.join(cols)}) values ({', '.join(['%s'] * len(cols))})"
                    if self._op == "upsert":
                        alvo = ", ".join(_ident(c) for c in (self._conflito or "").split(",") if c.strip())
                        if not alvo:
                            raise ValueError("upsert precisa de on_conflict")
                        sets = ", ".join(f"{c} = excluded.{c}" for c in cols)
                        sql += f" on conflict ({alvo}) do update set {sets}"
                    cur.execute(sql + " returning *", vals)
                retorno += [{k: _saida(v) for k, v in r.items()} for r in cur.fetchall()]
            return Resultado(retorno)


class Chamada:
    def __init__(self, pool: ConnectionPool, nome: str, params: dict):
        self._pool, self._nome, self._params = pool, _ident(nome), params

    def execute(self) -> Resultado:
        args = ", ".join(f"{_ident(k)} => %s{'::uuid' if k in _PARAMS_UUID else ''}" for k in self._params)
        with self._pool.connection() as conn, conn.cursor() as cur:
            cur.execute(f"select public.{self._nome}({args})", [_entrada(v) for v in self._params.values()])
            return Resultado(_saida(cur.fetchone()[0]))


class PgClient:
    """Substituto do cliente do Supabase: .table(nome) e .rpc(nome, params)."""

    def __init__(self, dsn: str, min_size: int = 1, max_size: int = 10):
        self._pool = ConnectionPool(
            dsn,
            min_size=min_size,
            max_size=max_size,
            kwargs={"autocommit": True},
            # Neon/hosts serverless derrubam conexões ociosas: testa antes de entregar e descarta as velhas.
            check=ConnectionPool.check_connection,
            max_idle=300,
            open=True,
        )

    def table(self, nome: str) -> Consulta:
        return Consulta(self._pool, nome)

    def rpc(self, nome: str, params: dict | None = None) -> Chamada:
        return Chamada(self._pool, nome, params or {})

    def close(self) -> None:
        self._pool.close()
