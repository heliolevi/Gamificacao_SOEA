import time

from passlib.hash import pbkdf2_sha256

CSRF = {"x-soea-csrf": "1"}

CADASTRO = {
    "nome": "Maria Engenheira",
    "email": "Maria@Exemplo.com",
    "senha": "senha-forte-123",
    "vinculo": "comunidade",
    "telefone": "(98) 98888-7777",
}


def _bearer(t):
    return {"Authorization": f"Bearer {t}"}


def _criar_conta(client, emails, dados=CADASTRO):
    r = client.post("/auth/registro/iniciar", json=dados)
    assert r.status_code == 202, r.text
    email = dados["email"].lower()
    codigo = emails.ultimo_codigo(email)
    r = client.post("/auth/registro/verificar", json={"email": email, "codigo": codigo, "senha": dados["senha"]})
    assert r.status_code == 200, r.text
    return r


def _user_direto(conn, email, senha=None, verificado=True, admin=False):
    conn.execute(
        "insert into users (nome, email, senha_hash, escola, email_verified_at, is_admin, data_registro) "
        "values (%s, %s, %s, 'UNDB', case when %s then now() end, %s, now())",
        ("Pessoa Teste", email, pbkdf2_sha256.hash(senha) if senha else None, verificado, admin),
    )


# ---------------- cadastro ----------------


def test_iniciar_nao_cria_conta_e_envia_codigo(client, conn, emails):
    r = client.post("/auth/registro/iniciar", json=CADASTRO)
    assert r.status_code == 202
    assert set(r.json()) == {"status", "mensagem", "expira_em", "reenviar_em"}
    assert conn.execute("select count(*) from users").fetchone()[0] == 0
    row = conn.execute("select otp_hash, payload from pending_registrations").fetchone()
    codigo = emails.ultimo_codigo("maria@exemplo.com")
    assert codigo and codigo not in row[0]           # só o HMAC fica salvo
    assert "senha" not in row[1] and row[1]["senha_hash"].startswith("$pbkdf2")


def test_campo_extra_no_payload_e_recusado(client):
    r = client.post("/auth/registro/iniciar", json={**CADASTRO, "is_admin": True})
    assert r.status_code == 422


def test_validacoes_do_payload(client):
    for ruim in (
        {"vinculo": "outro"},
        {"vinculo": ""},
        {"data_nasc": "2000-05-10"},  # campo removido: extra="forbid" recusa
        {"nome": "Ana 123 Silva"},
        {"email": "sem-arroba"},
        {"senha": "curta"},
        {"senha": "aaaaaaaaaa"},
        {"escola": "UNDB"},  # campo removido: extra="forbid" recusa
        {"telefone": "123"},
    ):
        r = client.post("/auth/registro/iniciar", json={**CADASTRO, **ruim})
        assert r.status_code == 422, (ruim, r.text)


def test_fluxo_completo_cria_conta_verificada_sem_vazar_hash(client, conn, emails):
    r = _criar_conta(client, emails)
    corpo = r.json()
    assert "senha_hash" not in r.text and "token_version" not in r.text
    assert corpo["user"]["email"] == "maria@exemplo.com"
    assert corpo["user"]["nome"] == "Maria Engenheira"
    assert "soea_rt" in r.cookies
    ok = conn.execute("select email_verified_at is not null, telefone, vinculo from users").fetchone()
    assert ok == (True, "98988887777", "comunidade")
    assert conn.execute("select count(*) from pending_registrations").fetchone()[0] == 0
    me = client.get("/auth/me", headers=_bearer(corpo["token"]))
    assert me.status_code == 200 and me.json()["nivel"] == 1


def test_codigo_errado_conta_tentativas_e_bloqueia(client, conn, emails):
    client.post("/auth/registro/iniciar", json=CADASTRO)
    certo = emails.ultimo_codigo("maria@exemplo.com")
    errado = "000000" if certo != "000000" else "111111"
    for restantes in (4, 3, 2, 1):
        r = client.post("/auth/registro/verificar", json={"email": "maria@exemplo.com", "codigo": errado, "senha": CADASTRO["senha"]})
        assert r.status_code == 400 and f"mais {restantes}" in r.json()["detail"]
    r = client.post("/auth/registro/verificar", json={"email": "maria@exemplo.com", "codigo": errado, "senha": CADASTRO["senha"]})
    assert r.status_code == 400 and "Muitas tentativas" in r.json()["detail"]
    # nem o código certo vale mais
    r = client.post("/auth/registro/verificar", json={"email": "maria@exemplo.com", "codigo": certo, "senha": CADASTRO["senha"]})
    assert r.status_code == 400
    assert conn.execute("select count(*) from users").fetchone()[0] == 0


def test_codigo_certo_com_senha_diferente_nao_cria(client, conn, emails):
    client.post("/auth/registro/iniciar", json=CADASTRO)
    codigo = emails.ultimo_codigo("maria@exemplo.com")
    r = client.post("/auth/registro/verificar", json={"email": "maria@exemplo.com", "codigo": codigo, "senha": "outra-senha-xyz"})
    assert r.status_code == 400
    assert conn.execute("select count(*) from users").fetchone()[0] == 0


def test_codigo_expirado(client, conn, emails):
    client.post("/auth/registro/iniciar", json=CADASTRO)
    codigo = emails.ultimo_codigo("maria@exemplo.com")
    conn.execute("update pending_registrations set expires_at = now() - interval '1 second'")
    r = client.post("/auth/registro/verificar", json={"email": "maria@exemplo.com", "codigo": codigo, "senha": CADASTRO["senha"]})
    assert r.status_code == 400 and "expirado" in r.json()["detail"]


def test_reenvio_respeita_espera(client, emails):
    client.post("/auth/registro/iniciar", json=CADASTRO)
    r = client.post("/auth/registro/reenviar", json={"email": "maria@exemplo.com"})
    assert r.status_code == 429
    r = client.post("/auth/registro/iniciar", json=CADASTRO)
    assert r.status_code == 429


def test_email_ja_cadastrado_responde_igual_e_avisa_dono(client, conn, emails):
    _user_direto(conn, "maria@exemplo.com", "qualquer-coisa-1")
    r = client.post("/auth/registro/iniciar", json=CADASTRO)
    assert r.status_code == 202
    assert conn.execute("select count(*) from pending_registrations").fetchone()[0] == 0
    assert "já tem uma conta" in emails.enviados[-1]["assunto"]


def test_rota_antiga_usuarios_novo_nao_cria_conta(client, conn, emails):
    r = client.post("/usuarios/novo", json=CADASTRO)
    assert r.status_code == 202 and "senha_hash" not in r.text
    assert conn.execute("select count(*) from users").fetchone()[0] == 0


def test_rota_definir_senha_por_data_nascimento_foi_removida(client):
    r = client.post("/usuarios/definir-senha", data={"email": "a@b.com", "data_nasc": "2000-01-01", "nova_senha": "12345678"})
    assert r.status_code in (404, 405)


# ---------------- login ----------------


def test_login_participante_verificado(client, conn):
    _user_direto(conn, "joao@exemplo.com", "senha-do-joao")
    r = client.post("/auth/login", json={"email": "JOAO@exemplo.com", "senha": "senha-do-joao"})
    assert r.status_code == 200 and r.json()["etapa"] == "ok"
    r = client.post("/auth/login", json={"email": "joao@exemplo.com", "senha": "errada-errada"})
    assert r.status_code == 401
    r = client.post("/auth/login", json={"email": "ninguem@exemplo.com", "senha": "errada-errada"})
    assert r.status_code == 401


def test_login_conta_antiga_nao_verificada_pede_codigo(client, conn, emails):
    _user_direto(conn, "antigo@exemplo.com", "senha-antiga-1", verificado=False)
    r = client.post("/auth/login", json={"email": "antigo@exemplo.com", "senha": "senha-antiga-1"})
    assert r.status_code == 200
    corpo = r.json()
    assert corpo["etapa"] == "codigo" and corpo["motivo"] == "verificar_email" and "token" not in corpo
    codigo = emails.ultimo_codigo("antigo@exemplo.com")
    r = client.post("/auth/login/verificar", json={"desafio": corpo["desafio"], "codigo": codigo})
    assert r.status_code == 200 and r.json()["token"]
    assert conn.execute("select email_verified_at is not null from users").fetchone()[0]


def test_admin_sempre_tem_segunda_etapa(client, conn, emails):
    _user_direto(conn, "admin@exemplo.com", "senha-admin-1", admin=True)
    _user_direto(conn, "comum@exemplo.com", "senha-comum-1")
    r = client.post("/auth/login", json={"email": "admin@exemplo.com", "senha": "senha-admin-1"})
    assert r.json()["motivo"] == "admin_2fa"
    codigo = emails.ultimo_codigo("admin@exemplo.com")
    errado = "000000" if codigo != "000000" else "111111"
    assert client.post("/auth/login/verificar", json={"desafio": r.json()["desafio"], "codigo": errado}).status_code == 400
    token = client.post("/auth/login/verificar", json={"desafio": r.json()["desafio"], "codigo": codigo}).json()["token"]
    assert client.get("/qrcodes/listar", headers=_bearer(token)).status_code == 200

    comum = client.post("/auth/login", json={"email": "comum@exemplo.com", "senha": "senha-comum-1"}).json()["token"]
    assert client.get("/qrcodes/listar", headers=_bearer(comum)).status_code == 403


def test_desafio_nao_serve_como_token_de_acesso(client, conn, emails):
    _user_direto(conn, "admin@exemplo.com", "senha-admin-1", admin=True)
    desafio = client.post("/auth/login", json={"email": "admin@exemplo.com", "senha": "senha-admin-1"}).json()["desafio"]
    assert client.get("/qrcodes/listar", headers=_bearer(desafio)).status_code == 401


def test_rate_limit_de_login_por_email(client, conn):
    _user_direto(conn, "alvo@exemplo.com", "senha-certa-1")
    for _ in range(10):
        client.post("/auth/login", json={"email": "alvo@exemplo.com", "senha": "chute-errado"})
    r = client.post("/auth/login", json={"email": "alvo@exemplo.com", "senha": "senha-certa-1"})
    assert r.status_code == 429


def test_rate_limit_conta_por_ip_real(client, conn):
    _user_direto(conn, "x@exemplo.com", "senha-certa-1")
    for i in range(30):
        client.post("/auth/login", json={"email": f"x{i}@exemplo.com", "senha": "chute"}, headers={"x-real-ip": "10.0.0.9"})
    r = client.post("/auth/login", json={"email": "x@exemplo.com", "senha": "senha-certa-1"}, headers={"x-real-ip": "10.0.0.9"})
    assert r.status_code == 429
    r = client.post("/auth/login", json={"email": "x@exemplo.com", "senha": "senha-certa-1"}, headers={"x-real-ip": "10.0.0.10"})
    assert r.status_code == 200


# ---------------- senha ----------------


def test_conta_sem_senha_recupera_por_email(client, conn, emails):
    _user_direto(conn, "legado@exemplo.com", None, verificado=False)
    r = client.post("/auth/login", json={"email": "legado@exemplo.com", "senha": "qualquer"})
    assert r.status_code == 401 and "Esqueci" in r.json()["detail"]
    assert client.post("/auth/senha/solicitar", json={"email": "legado@exemplo.com"}).status_code == 202
    codigo = emails.ultimo_codigo("legado@exemplo.com")
    r = client.post("/auth/senha/confirmar", json={"email": "legado@exemplo.com", "codigo": codigo, "nova_senha": "nova-senha-legal"})
    assert r.status_code == 200, r.text
    r = client.post("/auth/login", json={"email": "legado@exemplo.com", "senha": "nova-senha-legal"})
    assert r.json()["etapa"] == "ok"


def test_solicitar_para_email_inexistente_responde_igual(client, emails):
    r = client.post("/auth/senha/solicitar", json={"email": "fantasma@exemplo.com"})
    assert r.status_code == 202 and emails.enviados == []


def test_troca_de_senha_derruba_sessoes_antigas(client, conn, emails):
    r = _criar_conta(client, emails)
    token_antigo = r.json()["token"]
    cookie_antigo = r.cookies["soea_rt"]
    conn.execute("truncate rate_limits")
    client.cookies.clear()
    client.post("/auth/senha/solicitar", json={"email": "maria@exemplo.com"})
    codigo = emails.ultimo_codigo("maria@exemplo.com")
    client.post("/auth/senha/confirmar", json={"email": "maria@exemplo.com", "codigo": codigo, "nova_senha": "outra-senha-boa"})
    assert client.get("/auth/me", headers=_bearer(token_antigo)).status_code == 401
    client.cookies.clear()
    r = client.post("/auth/refresh", headers=CSRF, cookies={"soea_rt": cookie_antigo})
    assert r.status_code == 401


# ---------------- sessão ----------------


def test_token_version_derruba_na_hora(client, conn, emails):
    token = _criar_conta(client, emails).json()["token"]
    assert client.get("/auth/me", headers=_bearer(token)).status_code == 200
    conn.execute("update users set token_version = token_version + 1")
    assert client.get("/auth/me", headers=_bearer(token)).status_code == 401


def test_conta_nao_verificada_nao_acessa_rotas_privadas(client, conn, emails):
    token = _criar_conta(client, emails).json()["token"]
    conn.execute("update users set email_verified_at = null")
    assert client.get("/usuarios/me/qrcode", headers=_bearer(token)).status_code == 403


def test_token_adulterado_ou_ausente(client, conn, emails):
    token = _criar_conta(client, emails).json()["token"]
    assert client.get("/auth/me").status_code == 401
    assert client.get("/auth/me", headers=_bearer(token[:-3] + "abc")).status_code == 401
    import jwt

    falso = jwt.encode({"sub": "x", "typ": "access"}, "outra-chave" * 4, algorithm="HS256")
    assert client.get("/auth/me", headers=_bearer(falso)).status_code == 401


def test_refresh_rotaciona_e_detecta_reuso(client, conn, emails):
    r = _criar_conta(client, emails)
    c1 = r.cookies["soea_rt"]
    client.cookies.clear()

    assert client.post("/auth/refresh", cookies={"soea_rt": c1}).status_code == 403  # sem cabeçalho CSRF
    r2 = client.post("/auth/refresh", headers=CSRF, cookies={"soea_rt": c1})
    assert r2.status_code == 200 and r2.json()["token"]
    c2 = r2.cookies["soea_rt"]
    assert c2 != c1
    client.cookies.clear()

    # c1 reaparece logo em seguida: corrida entre abas, não derruba nada
    assert client.post("/auth/refresh", headers=CSRF, cookies={"soea_rt": c1}).status_code == 409
    client.cookies.clear()

    # c1 reaparece muito depois: roubo provável → família inteira cai, inclusive c2
    conn.execute("update sessions set revoked_at = now() - interval '5 minutes' where revoked_at is not null")
    assert client.post("/auth/refresh", headers=CSRF, cookies={"soea_rt": c1}).status_code == 401
    client.cookies.clear()
    assert client.post("/auth/refresh", headers=CSRF, cookies={"soea_rt": c2}).status_code == 401


def test_logout_e_logout_todos(client, conn, emails):
    r = _criar_conta(client, emails)
    c1, token = r.cookies["soea_rt"], r.json()["token"]
    client.cookies.clear()
    assert client.post("/auth/logout", headers=CSRF, cookies={"soea_rt": c1}).status_code == 200
    client.cookies.clear()
    assert client.post("/auth/refresh", headers=CSRF, cookies={"soea_rt": c1}).status_code == 401

    client.cookies.clear()
    assert client.post("/auth/logout-todos", headers={**CSRF, **_bearer(token)}).status_code == 200
    assert client.get("/auth/me", headers=_bearer(token)).status_code == 401


def test_rls_bloqueia_anon(conn):
    with conn.transaction():
        conn.execute("set local role anon")
        for tabela in ("users", "sessions", "pending_registrations", "auth_codes", "qrcodes"):
            try:
                with conn.transaction():
                    conn.execute(f"select * from {tabela}")
                raise AssertionError(f"anon conseguiu ler {tabela}")
            except Exception as e:
                assert "permission denied" in str(e)
