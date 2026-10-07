# 🎯 SOEA · Caça QR

[![UNDB Badge](https://img.shields.io/badge/Software%20House-UNDB-blue)](https://github.com/sua-organizacao-undb)
![Status](https://img.shields.io/badge/Status-Em%20Desenvolvimento-green)

Uma aplicação web interativa desenvolvida com o objetivo de **gamificar eventos** internos e externos da **Software House UNDB**. O projeto transforma a participação em palestras, workshops e dinâmicas em uma experiência lúdica e engajadora por meio do escaneamento de QR Codes.

---

## 🚀 Sobre o Projeto

O **Caça QR Code** foi criado para aumentar o engajamento do público nos eventos da UNDB. A ideia é simples e poderosa: espalhar QR Codes estratégicos pelo local do evento. Cada código escaneado valida a presença, libera conquistas ou soma pontos para o participante em um ranking em tempo real.

### 🌟 Principais Funcionalidades

* **Leitura de QR Code Integrada:** Escaneamento rápido direto pela câmera do celular, sem necessidade de instalar aplicativos adicionais.
* **Gamificação & Pontuação:** Sistema de pontuação dinâmica conforme o usuário descobre novos códigos.
* **Perguntas Bônus:** QR Codes podem liberar perguntas de múltipla escolha ou verdadeiro/falso, com pontuação extra para quem responde rápido (até 10s).
* **Leaderboard (Ranking):** Placar em tempo real para estimular a competitividade saudável entre os participantes.
* **Painel Administrativo:** Interface para a equipe da UNDB gerar QR Codes, gerenciar perguntas, e exportar dados dos participantes (Excel/JSON).

---

## 🛠️ Tecnologias Utilizadas

Abaixo estão as principais tecnologias e bibliotecas adotadas no desenvolvimento do WebApp:

* **Front-end:** [Next.js 16](https://nextjs.org/) (React 19, App Router) + TypeScript
* **Estilização/UI:** Tailwind CSS + componentes [shadcn/ui](https://ui.shadcn.com/) (Radix UI)
* **Leitura de QR:** [html5-qrcode](https://github.com/mebjas/html5-qrcode)
* **Back-end:** [FastAPI](https://fastapi.tiangolo.com/) (Python)
* **Banco de Dados:** [Supabase](https://supabase.com/) (PostgreSQL)
* **Geração de QR Code:** biblioteca `qrcode` (Python)
* **Exportação de relatórios:** `openpyxl` (Excel)

---

## 📦 Como Executar o Projeto

### Pré-requisitos
Antes de começar, você vai precisar ter instalado em sua máquina o [Git](https://git-scm.com), [Node.js](https://nodejs.org/en/) e [Python 3.10+](https://www.python.org/), além de um projeto criado no [Supabase](https://supabase.com/).

### Passo a Passo

1. **Clonar o repositório:**
   ```bash
   git clone https://github.com/seu-usuario/caca-qrcode-undb.git
   cd caca-qrcode-undb
   ```

2. **Configurar o back-end:**
   ```bash
   cd backend
   python -m venv venv
   venv\Scripts\activate       # Windows
   # source venv/bin/activate  # Linux/Mac

   pip install -r requirements.txt
   ```

   Copie `backend/.env.example` para `backend/.env` e preencha. Pontos importantes:
   * `SUPABASE_KEY` precisa ser a chave **service_role** (ou `sb_secret_...`). O backend se recusa a subir com a chave anon.
   * `JWT_SECRET` e `OTP_PEPPER`: gere cada um com `python -c "import secrets; print(secrets.token_urlsafe(48))"`.
   * `BREVO_API_KEY` (ou `RESEND_API_KEY`) e `EMAIL_FROM` (remetente verificado na Brevo, ou domínio verificado no Resend). Sem a chave, em desenvolvimento o código aparece no terminal do uvicorn.
   * Em `http://localhost`, use `COOKIE_SECURE=false`.

   Rode a migração `backend/migrations/2026_10_soea_seguranca.sql` no SQL Editor do Supabase (ela liga o RLS em todas as tabelas).

   Inicie o servidor:
   ```bash
   uvicorn main:app --reload
   ```
   A API ficará disponível em `http://localhost:8000` (documentação interativa em `/docs`).

3. **Configurar o front-end:**
   ```bash
   cd frontend
   npm install
   ```

   Crie um arquivo `.env.local` dentro de `frontend/` apontando para a API. O front chama sempre `/api/*`,
   e o Next repassa para este endereço (assim o cookie de sessão fica no mesmo domínio do app):
   ```env
   API_URL=http://localhost:8000
   # opcional, junto com TURNSTILE_SECRET no backend:
   # NEXT_PUBLIC_TURNSTILE_SITE_KEY=
   ```

   Inicie o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```
   O aplicativo ficará disponível em `http://localhost:3000`.

4. **Testes de autenticação (opcional):** precisam de um Postgres local vazio.
   ```bash
   pip install pytest "psycopg[binary]"
   TEST_PG_DSN="host=localhost port=5432 user=postgres" pytest backend/tests -q
   ```

---

## 📁 Estrutura do Projeto

```
QRCode-Hunt/
├── backend/            # API em FastAPI
│   ├── main.py         # Rotas do jogo (QR codes, perguntas, ranking)
│   ├── auth_routes.py  # Cadastro com código, login, 2FA de admin, senha, sessão
│   ├── auth.py         # Dependências get_current_user / require_admin
│   ├── security.py     # Hash, códigos, JWT, IP real e rate limit no banco
│   ├── email_provider.py # Resend (ou terminal, em desenvolvimento)
│   ├── migrations/     # SQL para rodar no Supabase
│   ├── tests/          # Testes de autenticação contra Postgres real
│   ├── database.py     # Conexão com o Supabase
│   └── requirements.txt
└── frontend/           # Aplicação Next.js
    ├── app/             # Páginas (Home, Admin)
    ├── components/      # Componentes (auth, scanner, ranking, perfil, admin)
    ├── hooks/
    └── lib/
```

---

## 🔑 Como Funciona

* **Cadastro em duas etapas:** o participante preenche os dados e recebe um código de 6 dígitos por e-mail. A conta só é criada depois que o código é confirmado.
* **Login:** e-mail e senha. Administradores sempre recebem um segundo código por e-mail. Contas antigas confirmam o e-mail no primeiro login; contas sem senha usam "Esqueci minha senha".
* **Sessão:** access token de 15 minutos só em memória e refresh token rotativo em cookie HttpOnly. Trocar a senha ou "sair de todos os aparelhos" derruba as outras sessões na hora.
* **Escaneamento:** ao escanear um QR Code pela câmera, o app envia o código capturado para a API, que valida se o código é válido, ativo e ainda não capturado por aquele usuário.
* **Pontuação:** cada captura soma pontos ao participante; QR Codes podem estar vinculados a uma pergunta bônus.
* **Ranking:** a posição de cada participante é calculada por pontos (e, em caso de empate, por ordem de cadastro).
* **Administração:** usuários com a flag `is_admin` têm acesso ao painel para gerar QR Codes, cadastrar perguntas e exportar relatórios dos participantes.

---

## 📌 Status

Projeto em desenvolvimento ativo pela Software House UNDB.
