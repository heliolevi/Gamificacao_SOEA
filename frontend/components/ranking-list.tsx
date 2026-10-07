"use client"

import { useEffect, useRef, useState } from "react"
import { motion } from "motion/react"
import { Crown } from "lucide-react"
import { cn } from "@/lib/utils"
import { apiFetch, getStoredUser } from "@/lib/api"
import { EASE_OUT, springSoft, springBouncy } from "@/lib/motion"
import { gsap, ScrollTrigger, useGSAP, prefersReducedMotion } from "@/lib/gsap"
import { Avatar, SkeletonList, type Tom } from "@/components/soea/kit"
import { TextForm } from "@/components/soea/text-form"

interface Player {
  id: string
  name: string
  score: number
  nivel: number
  qrCodesFound: number
  position: number
}

interface MinhaPosicao {
  posicao: number
  pontos: number
  nivel: number
}

/** Tela de ranking: pódio + lista + sua posição fixa. Uma chamada a /ranking. */
export function RankingScreen() {
  const [players, setPlayers] = useState<Player[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [eu, setEu] = useState<MinhaPosicao | null>(null)
  const meuId = String(getStoredUser()?.id_user ?? "")

  useEffect(() => {
    ;(async () => {
      try {
        const [response, posRes] = await Promise.all([apiFetch(`/ranking`), apiFetch(`/usuarios/me/posicao`)])
        const data = response.ok ? await response.json() : []
        setPlayers(
          (Array.isArray(data) ? data : []).map((u: any, i: number) => ({
            id: String(u.id ?? i),
            name: u.nome || "Participante",
            score: u.pontos || 0,
            nivel: u.nivel || 1,
            qrCodesFound: u.qrs_capturados || 0,
            position: i + 1,
          })),
        )
        if (posRes.ok) setEu(await posRes.json())
      } catch (error) {
        console.error("Erro ao carregar ranking:", error)
      } finally {
        setIsLoading(false)
      }
    })()
  }, [])

  const hasPodium = players.length >= 3
  const rest = hasPodium ? players.slice(3) : players
  const euNaLista = players.some((p) => p.id === meuId)

  return (
    <div className="space-y-7">
      <div>
        <p className="kicker">Classificação geral</p>
        <TextForm as="h1" text="Ranking" className="mt-0.5 block font-display text-[34px] font-extrabold leading-[1.05] tracking-[-0.035em] text-ink" />
        <p className="mt-1.5 text-[16px] text-muted-foreground">Quem mais caçou QR Codes no SOEA.</p>
      </div>

      {isLoading ? (
        <SkeletonList rows={6} />
      ) : players.length === 0 ? (
        <div className="rounded-[14px] border border-dashed border-line-strong px-5 py-10 text-center text-[15px] leading-relaxed text-muted-foreground">
          O placar ainda está vazio.
          <br />
          Escaneie o primeiro QR e crave seu nome aqui.
        </div>
      ) : (
        <>
          {hasPodium && <Podium top={players.slice(0, 3)} meuId={meuId} />}
          {rest.length > 0 && <RankingList players={rest} meuId={meuId} />}
        </>
      )}

      {!isLoading && eu && !euNaLista && (
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ ...springSoft, delay: 0.4 }}
          className="sticky bottom-[calc(var(--nav-h)+env(safe-area-inset-bottom)+12px)] z-10"
        >
          <div className="flex h-14 items-center gap-3 rounded-full bg-navy pl-2 pr-5 text-white shadow-lift">
            <span className="tabular flex h-10 min-w-10 items-center justify-center rounded-full bg-orange-strong px-2 font-display text-[15px] font-extrabold text-white">
              {eu.posicao}º
            </span>
            <span className="flex-1 font-display text-[16px] font-bold">Você</span>
            <span className="text-[13px] font-semibold text-navy-soft">nível {eu.nivel}</span>
            <span className="tabular font-display text-[16px] font-extrabold">{(eu.pontos ?? 0).toLocaleString("pt-BR")}</span>
          </div>
        </motion.div>
      )}
    </div>
  )
}

export function RankingList({ players, meuId }: { players: Player[]; meuId?: string }) {
  const ref = useRef<HTMLOListElement>(null)

  // Lista longa: cada linha entra quando chega na tela (ScrollTrigger + Lenis no mesmo ticker)
  useGSAP(
    () => {
      if (prefersReducedMotion()) return
      const rows = gsap.utils.toArray<HTMLElement>("[data-row]")
      gsap.set(rows, { opacity: 0, y: 18 })
      ScrollTrigger.batch(rows, {
        start: "top 96%",
        once: true,
        onEnter: (lote) => gsap.to(lote, { opacity: 1, y: 0, duration: 0.55, stagger: 0.05, ease: "expo.out" }),
      })
    },
    { scope: ref, dependencies: [players.length] },
  )

  return (
    <ol ref={ref} className="divide-y divide-line overflow-hidden rounded-[14px] border border-line">
      {players.map((p) => {
        const isMe = !!meuId && p.id === meuId
        return (
          <li
            key={p.id}
            data-row
            className={cn("flex h-16 items-center gap-3 px-4", isMe ? "bg-orange-tint" : "bg-white")}
          >
            <span className="tabular w-7 text-center font-display text-[15px] font-extrabold text-subtle">{p.position}</span>
            <Avatar name={p.name} tone={isMe ? "orange" : "muted"} className="h-10 w-10 text-[14px]" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-semibold text-ink">{isMe ? "Você" : p.name}</p>
              <p className="text-[13px] text-muted-foreground">
                nível {p.nivel}, {p.qrCodesFound} {p.qrCodesFound === 1 ? "QR" : "QRs"}
              </p>
            </div>
            <span className="tabular text-[15px] font-bold text-ink">{p.score.toLocaleString("pt-BR")}</span>
          </li>
        )
      })}
    </ol>
  )
}

const PODIO: { idx: number; h: number; tone: Tom; cor: string }[] = [
  { idx: 1, h: 104, tone: "purple", cor: "var(--brand-purple)" },
  { idx: 0, h: 148, tone: "orange", cor: "var(--brand-orange)" },
  { idx: 2, h: 80, tone: "navy", cor: "var(--brand-navy)" },
]

export function TopThreePodium({ top, meuId }: { top: Player[]; meuId?: string }) {
  return <Podium top={top} meuId={meuId} />
}

/* Momento da tela: as colunas sobem do chão, do centro para fora, e a coroa cai no 1º. */
function Podium({ top, meuId }: { top: Player[]; meuId?: string }) {
  return (
    <div className="grid grid-cols-3 items-end gap-2.5 pt-6">
      {PODIO.map(({ idx, h, tone, cor }) => {
        const p = top[idx]
        const first = idx === 0
        const isMe = !!meuId && p.id === meuId
        const atraso = 0.08 + idx * 0.12 // 1º sobe primeiro, depois 2º e 3º
        return (
          <div key={idx} className="flex min-w-0 flex-col items-center">
            <motion.div
              initial={{ opacity: 0, y: 24, scale: 0.8 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ ...springBouncy, delay: atraso + 0.25 }}
              className="flex w-full min-w-0 flex-col items-center"
            >
              {first && (
                <motion.span
                  initial={{ y: -30, rotate: -25, opacity: 0 }}
                  animate={{ y: 0, rotate: 0, opacity: 1 }}
                  transition={{ ...springBouncy, delay: 0.85 }}
                >
                  <Crown className="mb-1.5 h-7 w-7 text-orange" strokeWidth={2.2} fill="currentColor" fillOpacity={0.2} />
                </motion.span>
              )}
              <Avatar
                name={p.name}
                tone={tone}
                className={cn(first ? "h-[72px] w-[72px] text-[22px]" : "h-14 w-14 text-[17px]", isMe && "ring-2 ring-orange ring-offset-2 ring-offset-white")}
              />
              <span className="mt-2 w-full truncate px-1 text-center text-[14px] font-bold text-ink">
                {isMe ? "Você" : p.name.split(" ")[0]}
              </span>
              <span className="tabular text-[13px] text-muted-foreground">{p.score.toLocaleString("pt-BR")} pts</span>
            </motion.div>
            <motion.div
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ duration: 0.8, ease: EASE_OUT, delay: atraso }}
              style={{ height: h, transformOrigin: "bottom" }}
              className="relative mt-3 flex w-full items-start justify-center overflow-hidden rounded-t-[14px] bg-surface"
            >
              <span className="absolute inset-x-0 top-0 h-1.5" style={{ background: cor }} />
              <span className="tabular mt-4 font-display text-[34px] font-extrabold leading-none" style={{ color: cor }}>
                {idx + 1}
              </span>
            </motion.div>
          </div>
        )
      })}
    </div>
  )
}
