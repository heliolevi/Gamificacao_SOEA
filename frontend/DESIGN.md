# SOEA · Caça QR — sistema visual (identidade Confea-X)

Redesenho feito do zero a partir da identidade da Confea-X. O visual antigo (noite azul-marinho, Lexend) foi descartado.

## Fontes
- **Site Confea-X (confeax.org.br):** dele vêm o laranja do X (#EB5C29), o roxo de ação secundária (#65349C), a fonte Open Sans, as superfícies brancas e lavanda (#F6F5F9) e os cinzas zinc. Também os raios: botões 10px, cartões 14px e pílulas.
- **Logotipo Confea-X:** o azul-marinho da palavra (#282D61).
- **Manual da marca Confea (2023):** o X nunca é distorcido, recolorido, inclinado ou sombreado, e mantém área de proteção.

## A marca
- `components/soea/brand-x.ts` guarda os **5 vetores oficiais** do X, extraídos do SVG publicado no site, sem nenhuma alteração.
- `SoeaMark` sempre renderiza a arte oficial. Quando a marca "se desenha", quem anima é uma **máscara** (o esqueleto do traço, alinhado por `GUIDE_TRANSFORM`). No final a máscara fecha por inteiro, então o resultado é a arte exata.
- **Grafismo:** o X em escala de cartaz, cortado na borda e com baixa opacidade, como no site. Aparece no topo do login e no placar da Home, e desliza com o scroll (paralaxe).
- **Ícone do app:** X laranja sobre branco, com margem de proteção.

## Cores (app/globals.css)
| Token | Valor | Uso |
|---|---|---|
| `orange` | #EB5C29 | marca, ícones, barras, detalhes (cor oficial) |
| `orange-strong` | #CC4314 | **preenchimento de botões com texto branco** (4,79:1) |
| `orange-ink` | #B8461B | texto em laranja (5,34:1) |
| `orange-tint` | #FDEEE8 | destaque "você" em listas, foco de campo |
| `purple` / `purple-tint` | #65349C / #F1EBF8 | ação secundária, avatar, info |
| `navy` / `navy-deep` | #282D61 / #1C2050 | blocos de destaque (topo do login, placar, barra "Você") |
| `navy-soft` | #C9CBE6 | texto secundário sobre o azul (8:1) |
| `surface` / `surface-2` | #F6F5F9 / #EEECF4 | fundos de grupo, trilhos |
| `line` / `line-strong` | #E4E4E7 / #D4D4D8 | bordas |
| `ink` / `ink-soft` / `muted-foreground` / `subtle` | #17171C / #3F3F46 / #52525B / #71717A | texto |
| `success` / `danger` | #1F7A5C / #B42318 | estados (sempre com ícone + texto) |

Por que existem três laranjas: branco sobre o laranja oficial dá só 3,45:1, abaixo do AA. A cor oficial fica para a marca e os gráficos, e as versões "strong" e "ink" garantem leitura.

**Pódio:** 1º laranja, 2º roxo, 3º azul-marinho (as três cores da marca, sem ouro, prata ou bronze).

## Tipografia
- **Open Sans** variável (300–800) em tudo. Títulos em 800 com tracking negativo; corpo com 16px no mínimo.
- **JetBrains Mono** só nos dígitos do código de verificação.
- **Rótulo de seção** (`.kicker`): texto laranja pequeno acima do título, como "Inovação" e "Conexão" no site.

## Forma e profundidade
- Raios: 10px (botões e campos), 14px (cartões e listas), 18px (blocos de destaque), pílula (chips e nós).
- Sombras frias e baixas, tingidas de azul-marinho (`shadow-soft`, `shadow-lift`), nunca preto puro.
- Botões afundam 1px ao toque (`pressable`).

## Navegação (mobile primeiro)
- Cabeçalho branco com a marca e o avatar (atalho para o perfil). Ao rolar ganha borda e sombra, e uma **linha laranja de progresso do scroll**.
- Barra inferior com ícone e rótulo em todas as abas. Um traço laranja desliza até a aba ativa, e **Escanear** é um botão laranja elevado no centro.
- Toda tela abre com rótulo e título próprios. Alvos de toque ≥ 44px.

## Movimento (bibliotecas, cada elemento tem um dono)
| Lib | Papel |
|---|---|
| **GSAP** (DrawSVG, SplitText, ScrambleText, ScrollTrigger) | máscara que desenha o X, textos se formando, contadores, linhas do ranking entrando ao rolar |
| **Motion** | troca de abas, presença, layout (aba ativa, seletores), `whileInView` (Reveal), paralaxe com `useScroll`, toasts |
| **Lenis** | scroll suave no desktop; inércia nativa no toque |
| **Three.js** | X em tubos 3D que crescem (abertura e login), inclinação pelo dedo ou giroscópio |
| **Spline** | opcional, via `NEXT_PUBLIC_SPLINE_SCENE` |

**Efeitos de scroll:**
- `Reveal`: sobe 20px e aparece uma vez.
- O medidor de nível enche ao entrar na tela.
- Paralaxe do X gigante.
- Barra de progresso no cabeçalho.
- ScrollTrigger.batch no ranking.

**Regras:**
- Um relógio só (`gsap.ticker`).
- Um contexto WebGL por vez.
- Com "reduzir movimento" ligado, tudo cai para estados estáticos.

## Demonstração sem backend
Use `iniciar-front-demo.bat` ou `NEXT_PUBLIC_DEMO=1 npm run dev`.
