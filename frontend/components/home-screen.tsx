"use client"

import { useEffect, useRef, useState } from "react"
import { motion, useScroll, useTransform } from "motion/react"
import { ArrowRight, ChevronRight, HelpCircle, QrCode, ScanLine, Users } from "lucide-react"
import { cn } from "@/lib/utils"
import { apiFetch, getStoredUser } from "@/lib/api"
import { EASE_OUT, riseItem, staggerList } from "@/lib/motion"
import { haptic } from "@/lib/gsap"
import { Avatar, Reveal, SectionTitle, SkeletonList, XpPill, type Tom } from "@/components/soea/kit"
import { TextForm } from "@/components/soea/text-form"
import { SoeaMark } from "@/components/soea/mark"
import { CountUp } from "@/components/itw/brand"
import { DevCard } from "@/components/contact-screen"

interface HomeScreenProps {
  onNavigate: (tab: string) => void
}

type Jogador = { id: string; nome: string; pontos: number }
type Posicao = { posicao: number; pontos: number; nivel: number; qrs_capturados: number }

function saudacao() {
  const h = new Date().getHours()
  if (h < 12) return "Bom dia"
  if (h < 18) return "Boa tarde"
  return "Boa noite"
}

export function HomeScreen({ onNavigate }: HomeScreenProps) {
  const [user, setUser] = useState<any>(() => (typeof window !== "undefined" ? getStoredUser() : null))
  const [top, setTop] = useState<Jogador[]>([])
  const [eu, setEu] = useState<Posicao | null>(null)
  const [carregado, setCarregado] = useState(false)

  useEffect(() => {
    const salvo = getStoredUser()
    if (!salvo) return
    setUser(salvo)
    ;(async () => {
      try {
        const [rankingRes, posicaoRes] = await Promise.all([apiFetch(`/ranking?limit=3`), apiFetch(`/usuarios/me/posicao`)])
        const ranking = rankingRes.ok ? await rankingRes.json() : []
        setTop((Array.isArray(ranking) ? ranking : []).map((j: any) => ({ id: String(j.id), nome: j.nome, pontos: j.pontos ?? 0 })))
        if (posicaoRes.ok) setEu(await posicaoRes.json())
      } catch (e) {
        console.error("Erro ao carregar dados da Home:", e)
      } finally {
        setCarregado(true)
      }
    })()
  }, [])

  const pontos = Number(eu?.pontos ?? user?.pontos) || 0
  const primeiroNome = (user?.nome || "").trim().split(/\s+/)[0] || "participante"

  // Frase de situação com dados reais, no lugar de números soltos
  let situacao = "Escaneie seu primeiro QR Code para entrar no ranking."
  if (eu && pontos > 0) {
    if (eu.posicao <= 3) situacao = `Você está em ${eu.posicao}º lugar. Segure o pódio.`
    else if (top[2]) {
      const gap = Math.max(1, top[2].pontos - pontos + 1)
      situacao = `Faltam ${gap.toLocaleString("pt-BR")} pts para o pódio.`
    }
  }

  return (
    <div className="space-y-8">
      {/* saudação */}
      <section>
        <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: EASE_OUT }} className="kicker">
          {saudacao()},
        </motion.p>
        <TextForm
          as="h1"
          text={primeiroNome}
          delay={0.05}
          className="mt-0.5 block font-display text-[clamp(32px,9.5vw,42px)] font-extrabold leading-[1.08] tracking-[-0.035em] text-ink"
        />
        <motion.p
          key={situacao}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="mt-1.5 max-w-[34ch] text-[16px] leading-relaxed text-muted-foreground"
        >
          {situacao}
        </motion.p>
      </section>

      <Placar pontos={pontos} eu={eu} />

      <ScanCta onClick={() => onNavigate("scan")} />

      <DevCard onClick={() => onNavigate("contact")} />

      {/* quem está na frente */}
      <Reveal as="section" className="space-y-3.5">
        <SectionTitle
          kicker="Ao vivo"
          action={
            <button
              onClick={() => onNavigate("ranking")}
              className="focus-ring -mr-2 flex min-h-11 shrink-0 items-center gap-0.5 whitespace-nowrap rounded-[10px] px-2 text-[14px] font-bold text-orange-ink"
            >
              Ver ranking <ChevronRight className="h-4 w-4" />
            </button>
          }
        >
          Pódio agora
        </SectionTitle>

        {!carregado ? (
          <SkeletonList rows={3} />
        ) : top.length === 0 ? (
          <div className="rounded-[14px] border border-dashed border-line-strong px-5 py-6 text-[15px] leading-relaxed text-muted-foreground">
            Ninguém pontuou ainda. O primeiro QR escaneado coloca você no topo.
          </div>
        ) : (
          <motion.ol variants={staggerList} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.4 }} className="divide-y divide-line overflow-hidden rounded-[14px] border border-line">
            {top.map((j, i) => (
              <motion.li key={j.id} variants={riseItem}>
                <LinhaTop posicao={i + 1} jogador={j} eu={String(user?.id_user) === j.id} />
              </motion.li>
            ))}
          </motion.ol>
        )}
      </Reveal>

      <ComoPontuar onScan={() => onNavigate("scan")} onPerfil={() => onNavigate("profile")} />
    </div>
  )
}

/* Placar: bloco azul-marinho da marca. O X oficial aparece cortado no canto e desliza
   com o scroll (paralaxe leve), como os grafismos do site Confea-X. */
function Placar({ pontos, eu }: { pontos: number; eu: Posicao | null }) {
  const ref = useRef<HTMLElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] })
  const y = useTransform(scrollYProgress, [0, 1], [-30, 50])
  const rot = useTransform(scrollYProgress, [0, 1], [-6, 8])

  return (
    <motion.section
      ref={ref}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: EASE_OUT, delay: 0.1 }}
      className="relative overflow-hidden rounded-[18px] bg-navy p-5 text-white"
      aria-label="Seu placar"
    >
      <motion.div aria-hidden style={{ y, rotate: rot }} className="pointer-events-none absolute -right-16 -top-12 w-56 opacity-[0.12]">
        <SoeaMark className="h-auto w-full" />
      </motion.div>

      <div className="relative">
        <p className="text-[13px] font-semibold text-navy-soft">Seus pontos</p>
        <p className="mt-0.5 font-display text-[44px] font-extrabold leading-none tracking-[-0.04em]">
          <CountUp value={pontos} />
        </p>

        <dl className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-[10px] bg-white/10 px-3 py-2.5">
            <dt className="text-[12px] font-semibold text-navy-soft">Posição</dt>
            <dd className="tabular mt-0.5 text-[18px] font-extrabold">{eu?.posicao ? `${eu.posicao}º` : "–"}</dd>
          </div>
          <div className="rounded-[10px] bg-white/10 px-3 py-2.5">
            <dt className="text-[12px] font-semibold text-navy-soft">QR Codes</dt>
            <dd className="tabular mt-0.5 flex items-center gap-1.5 text-[18px] font-extrabold">
              <QrCode className="h-4 w-4 text-orange" /> {eu?.qrs_capturados ?? 0}
            </dd>
          </div>
        </dl>

        <XpPill pontos={pontos} tone="dark" className="mt-5" />
      </div>
    </motion.section>
  )
}

const TOM_POSICAO: Tom[] = ["orange", "purple", "navy"]

function LinhaTop({ posicao, jogador, eu }: { posicao: number; jogador: Jogador; eu: boolean }) {
  return (
    <div className={cn("flex h-16 items-center gap-3 px-4", eu ? "bg-orange-tint" : "bg-white")}>
      <span className="tabular w-5 text-center font-display text-[15px] font-extrabold text-subtle">{posicao}</span>
      <Avatar name={jogador.nome} tone={TOM_POSICAO[posicao - 1] ?? "muted"} className="h-10 w-10 text-[14px]" />
      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">{eu ? "Você" : jogador.nome}</span>
      <span className="tabular text-[15px] font-bold text-ink">
        {jogador.pontos.toLocaleString("pt-BR")} <span className="text-[13px] font-semibold text-subtle">pts</span>
      </span>
    </div>
  )
}

/* Ação principal da tela: botão laranja grande, com visor vivo e um reflexo que passa. */
function ScanCta({ onClick }: { onClick: () => void }) {
  return (
    <motion.button
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.18 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => {
        haptic(10)
        onClick()
      }}
      className="focus-ring relative flex w-full items-center gap-4 overflow-hidden rounded-[18px] bg-orange-strong p-4 text-left text-white shadow-[0_16px_32px_-16px_var(--brand-orange)]"
    >
      <span aria-hidden className="soea-sheen pointer-events-none absolute inset-y-0 left-0 w-1/5 bg-white/20" />
      <span className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-[14px] bg-white">
        <Visor />
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="block whitespace-nowrap font-display text-[19px] font-extrabold leading-tight">Escanear QR Code</span>
        <span className="mt-0.5 block text-[14px] leading-snug text-white/90">Aponte a câmera e pontue na hora.</span>
      </span>
      <motion.span animate={{ x: [0, 4, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }} className="relative">
        <ArrowRight className="h-6 w-6" strokeWidth={2.4} />
      </motion.span>
    </motion.button>
  )
}

function Visor() {
  return (
    <span className="relative block h-10 w-10">
      {[
        "left-0 top-0 border-l-[3px] border-t-[3px] rounded-tl-[8px]",
        "right-0 top-0 border-r-[3px] border-t-[3px] rounded-tr-[8px]",
        "left-0 bottom-0 border-l-[3px] border-b-[3px] rounded-bl-[8px]",
        "right-0 bottom-0 border-r-[3px] border-b-[3px] rounded-br-[8px]",
      ].map((c) => (
        <span key={c} className={cn("absolute h-3 w-3 border-orange", c)} />
      ))}
      <QrCode className="absolute inset-[8px] h-6 w-6 text-navy" strokeWidth={1.9} />
      <motion.span
        className="absolute inset-x-0.5 h-[2px] rounded-full bg-orange"
        animate={{ top: ["8%", "88%", "8%"] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
      />
    </span>
  )
}

/* Regras rápidas, reveladas ao rolar. Cada item leva para onde a ação acontece. */
function ComoPontuar({ onScan, onPerfil }: { onScan: () => void; onPerfil: () => void }) {
  const itens = [
    { icone: ScanLine, titulo: "QR Codes do evento", texto: "Cada QR encontrado soma pontos uma vez.", acao: onScan, cor: "bg-orange-tint text-orange-ink" },
    { icone: HelpCircle, titulo: "Perguntas bônus", texto: "Alguns QR trazem uma pergunta. Acertou, ganhou mais.", acao: onScan, cor: "bg-purple-tint text-purple" },
    { icone: Users, titulo: "Networking", texto: "Escaneie o QR de outro participante. Os dois pontuam.", acao: onPerfil, cor: "bg-surface-2 text-navy" },
  ]
  return (
    <section className="space-y-3.5">
      <Reveal>
        <SectionTitle kicker="Regras">Como pontuar</SectionTitle>
      </Reveal>
      <ul className="space-y-2.5">
        {itens.map(({ icone: Icone, titulo, texto, acao, cor }, i) => (
          <Reveal as="li" key={titulo} delay={i * 0.06}>
            <button onClick={acao} className="focus-ring pressable flex w-full items-center gap-3.5 rounded-[14px] border border-line bg-white p-3.5 text-left hover:bg-surface">
              <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full", cor)}>
                <Icone className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-bold text-ink">{titulo}</span>
                <span className="block text-[14px] leading-snug text-muted-foreground">{texto}</span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-subtle" />
            </button>
          </Reveal>
        ))}
      </ul>
    </section>
  )
}
