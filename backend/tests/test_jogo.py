"""Fluxo do jogo ponta a ponta contra o Postgres real, pelo cliente de produção (pg_client)."""
from passlib.hash import pbkdf2_sha256


def _conta(conn, email, nome, admin=False):
    row = conn.execute(
        "insert into users (nome, email, senha_hash, email_verified_at, is_admin) "
        "values (%s, %s, %s, now(), %s) returning id_user",
        (nome, email, pbkdf2_sha256.hash("senha-forte-123"), admin),
    ).fetchone()
    return str(row[0])


def _h(id_user):
    from security import criar_access_token

    return {"Authorization": f"Bearer {criar_access_token(id_user, 0)}"}


def test_fluxo_completo(client, conn):
    conn.execute("delete from qrcodes; delete from perguntas")
    admin = _conta(conn, "admin@soea.app", "Admin Geral", admin=True)
    ana = _conta(conn, "ana@soea.app", "Ana Ribeiro")
    bruno = _conta(conn, "bruno@soea.app", "Bruno Tavares")

    # admin cria pergunta e QR vinculado
    r = client.post(
        "/perguntas/nova",
        data={"enunciado": "O Confea regula a engenharia?", "tipo": "verdadeiro_falso", "resposta_correta": "V",
              "pontos_rapido": 30, "pontos_lento": 10},
        headers=_h(admin),
    )
    assert r.status_code == 200, r.text
    id_pergunta = r.json()["pergunta"]["id_pergunta"]
    r = client.post(f"/qrcodes/gerar?nome_local=Stand%20Confea&pontos=50&id_pergunta={id_pergunta}", headers=_h(admin))
    assert r.status_code == 200, r.text
    code = r.json()["code_hash"]
    assert any(q["code_hash"] == code for q in client.get("/qrcodes/listar", headers=_h(admin)).json())

    # captura: trigger soma os pontos; segunda vez é bloqueada
    r = client.post("/capturar", data={"code_hash": code}, headers=_h(ana))
    assert r.status_code == 200, r.text
    assert r.json()["pontos_total"] == 50 and r.json()["pergunta"]["id_pergunta"] == id_pergunta
    assert client.post("/capturar", data={"code_hash": code}, headers=_h(ana)).status_code == 409

    # resposta rápida e certa: +30 (trigger)
    r = client.post("/responder", data={"id_pergunta": id_pergunta, "resposta": "v", "tempo_segundos": 4}, headers=_h(ana))
    assert r.status_code == 200 and r.json()["acertou"] is True, r.text
    assert conn.execute("select pontos from users where id_user = %s", (ana,)).fetchone()[0] == 80
    assert client.post("/responder", data={"id_pergunta": id_pergunta, "resposta": "V", "tempo_segundos": 4}, headers=_h(ana)).status_code == 400

    # networking (or_ nas duas direções)
    assert client.get("/usuarios/me/qrcode", headers=_h(bruno)).status_code == 200
    code_bruno = conn.execute("select personal_code_hash from users where id_user = %s", (bruno,)).fetchone()[0]
    r = client.post("/amigos/escanear", data={"code_hash": code_bruno}, headers=_h(ana))
    assert r.status_code == 200, r.text
    code_ana = client.get("/usuarios/me/qrcode", headers=_h(ana)) and conn.execute(
        "select personal_code_hash from users where id_user = %s", (ana,)
    ).fetchone()[0]
    assert client.post("/amigos/escanear", data={"code_hash": code_ana}, headers=_h(bruno)).status_code in (400, 409)

    # ranking (catch(count)) e posição (count exato + filtros)
    rk = client.get("/ranking").json()
    assert [j["nome"] for j in rk][:2] == ["Ana Ribeiro", "Bruno Tavares"]
    assert rk[0]["qrs_capturados"] == 1 and all(j["nome"] != "Admin Geral" for j in rk)
    pos = client.get("/usuarios/me/posicao", headers=_h(bruno)).json()
    assert pos["posicao"] == 2 and pos["qrs_capturados"] == 0
    pos = client.get("/usuarios/me/posicao", headers=_h(ana)).json()
    assert pos["posicao"] == 1 and pos["qrs_capturados"] == 2  # 1 QR do evento + 1 de amigo

    # editar nome, desativar QR, apagar pergunta
    assert client.patch("/usuarios/me/nome", data={"nome": "ana ribeiro silva"}, headers=_h(ana)).json()["nome"] == "Ana Ribeiro Silva"
    assert client.patch(f"/qrcodes/status/{code}", json={"ativo": False}, headers=_h(admin)).status_code == 200
    assert client.post("/capturar", data={"code_hash": code}, headers=_h(bruno)).status_code == 403
    assert client.delete(f"/perguntas/{id_pergunta}", headers=_h(admin)).status_code == 200
    assert conn.execute("select id_pergunta from qrcodes where code_hash = %s", (code,)).fetchone()[0] is None

    # participante comum não acessa rotas de admin
    assert client.get("/qrcodes/listar", headers=_h(ana)).status_code == 403
