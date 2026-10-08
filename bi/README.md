# Relatório Power BI · SOEA por vínculo

Relatório de todos os participantes agrupados pelo **vínculo** escolhido no cadastro
(Comunidade, Empresa, Empresa do Sistema, Entidade, Instituição de Ensino Superior, Startup do Sistema),
alimentado direto pela API da aplicação.

> O arquivo `.pbix` é montado no Power BI Desktop. Aqui está tudo que ele precisa: as duas rotas da API,
> as consultas Power Query, as medidas DAX, o tema de cores e o desenho das páginas.
> Tempo estimado: 15 a 20 minutos. Esta pasta ainda **não foi aberta no Power BI Desktop**: se alguma
> consulta reclamar, o erro aparece no próprio Power Query e o ajuste costuma ser de uma linha.

```
bi/
├── powerquery/   Participantes.pq · Capturas.pq · Vinculos.pq
├── dax/          medidas.dax
└── tema-soea.json   cores da marca (navy, laranja, roxo)
```

## 1. Preparar a API (uma vez)

1. **Banco:** rode `backend/migrations/01_vinculo_no_cadastro.sql` (cria `users.vinculo`). Sem isso, `/bi/participantes` dá erro 500.
2. **Gere uma chave só de leitura** e guarde em um cofre de senhas:
   ```
   python -c "import secrets; print(secrets.token_urlsafe(48))"
   ```
3. **Vercel** (projeto do backend) → Settings → Environment Variables: crie `BI_API_KEY` com a chave, tipo **Secret**,
   e faça **Redeploy**. Em desenvolvimento, coloque no `backend/.env`.
4. **Teste:**
   ```
   curl -H "X-API-Key: SUA_CHAVE" https://gamificacao-soea.vercel.app/bi/participantes
   ```
   Esperado: JSON com `total` e a lista `participantes`. Sem chave: `401`. Com `BI_API_KEY` vazia: `404`.

| Rota | Conteúdo |
|---|---|
| `GET /bi/participantes` | 1 linha por participante: `id_participante`, `nome`, `vinculo`, `vinculo_rotulo`, `pontos`, `nivel`, `qrs_capturados`, `perguntas_respondidas`, `data_registro` |
| `GET /bi/capturas` | 1 linha por QR lido: `id_participante`, `local`, `pontos_qr`, `capturado_em` |

Contas criadas antes do campo "vínculo" aparecem como **Não informado**. Administradores nunca entram.

## 2. Montar no Power BI Desktop

1. **Parâmetro:** Página Inicial → Transformar dados → Gerenciar Parâmetros → Novo.
   Nome `ChaveApiBi`, Tipo `Texto`, Valor atual = a chave.
2. **Consultas:** Nova Fonte → Consulta em Branco → Editor Avançado → cole o conteúdo de cada `.pq`
   e renomeie a consulta para `Participantes`, `Capturas` e `Vinculos`.
   - Se pedir credencial: **Anônimo** (a autenticação é pelo cabeçalho). Nível de privacidade: **Organizacional**.
   - Se o backend mudar de endereço, troque a URL no topo de `Participantes.pq` e `Capturas.pq`.
3. **Fechar e Aplicar.**
4. **Modelo** (visão de modelo), três relações *muitos-para-um*, filtro em **uma direção**:
   - `Vinculos[vinculo]` → `Participantes[vinculo]`
   - `Participantes[id_participante]` → `Capturas[id_participante]`
5. **Ordem dos vínculos:** em `Vinculos`, selecione `vinculo_rotulo` → Ferramentas de coluna → *Classificar por coluna* → `ordem`.
6. **Medidas:** crie uma tabela vazia `Medidas` e cole cada medida de `dax/medidas.dax`.
7. **Tema:** Exibição → Temas → Procurar temas → `tema-soea.json`.

## 3. Páginas do relatório

**Página 1 · Visão geral**
| Visual | Campos |
|---|---|
| Cartões (4) | `Total Participantes`, `Taxa de Engajamento`, `QRs Lidos`, `Pontos Médios` |
| Barras horizontais | eixo `Vinculos[vinculo_rotulo]`, valor `Total Participantes` (rótulos com `% de Participantes`) |
| Rosca | legenda `Vinculos[vinculo_rotulo]`, valor `Total Participantes` |
| Colunas | eixo `Participantes[data_cadastro]`, valor `Total Participantes` (cadastros por dia) |
| Segmentação | `Vinculos[vinculo_rotulo]` |

**Página 2 · Engajamento por vínculo**
| Visual | Campos |
|---|---|
| Matriz | linhas `Vinculos[vinculo_rotulo]`; valores `Total Participantes`, `Taxa de Engajamento`, `Pontos Médios`, `Nível Médio`, `QRs por Participante`, `Perguntas Respondidas` |
| Barras agrupadas | eixo `Capturas[local]`, legenda `Vinculos[vinculo_rotulo]`, valor `Total Capturas` |
| Linha | eixo `Capturas[hora_leitura]`, valor `Total Capturas` (horários de pico) |
| Cartões | `Vínculo Líder`, `Vínculo Mais Engajado` |

**Página 3 · Participantes**
Tabela com `nome`, `vinculo_rotulo`, `pontos`, `nivel`, `qrs_capturados`, `perguntas_respondidas`, `registrado_em`,
ordenada por `pontos`; segmentações por vínculo e por nome; cartão `Último Cadastro`.
(Esta página mostra nomes: restrinja quem recebe o relatório, veja a seção de privacidade.)

## 4. Publicar e atualizar sozinho

1. Página Inicial → Publicar → escolha o workspace.
2. No Power BI Service: conjunto de dados → Configurações → **Credenciais da fonte de dados** → Autenticação **Anônima**,
   nível de privacidade **Organizacional** → Entrar. Em **Parâmetros**, confira `ChaveApiBi`.
3. **Atualização agendada**: ligue e escolha os horários (a licença Pro permite até 8 por dia).
   Não precisa de gateway: a API é pública na internet (HTTPS).
4. Para trocar a chave no futuro: gere outra, atualize `BI_API_KEY` na Vercel, depois o parâmetro no Service.

## 5. Privacidade (LGPD) e segurança

- A API só envia o necessário: **nome, vínculo, pontos e contagens**. **Nunca** envia e-mail, telefone, senha ou administradores.
- Mesmo assim, o relatório lista **nomes**. Compartilhe só com quem precisa. Para uma versão agregada,
  apague a coluna `nome` na consulta `Participantes` (e a Página 3).
- A chave `BI_API_KEY` dá leitura dos dados do relatório. Trate como senha: não coloque em repositório nem em chat.
  Se vazar, gere outra e troque na Vercel.
- A rota é limitada a 60 chamadas a cada 10 minutos por IP e responde `404` se a chave não estiver configurada.
- Atenção: `GET /ranking?limit=0` (rota pública do app) também devolve o nome de **todos** os participantes. Se isso
  não for desejado, limite o parâmetro no backend.

## 6. Se os vínculos mudarem

Atualize em quatro lugares: `backend/vinculos.py`, `frontend/lib/event.ts`, o `CHECK` de `users.vinculo`
(nova migração) e `bi/powerquery/Vinculos.pq`.
