"use client"

import { useEffect, useRef, useState } from "react"
import { motion, useMotionValue, useSpring, useTransform } from "motion/react"
import { cn } from "@/lib/utils"
import { EASE_OUT } from "@/lib/motion"
import { levelProgress } from "@/lib/level"

/* ───────────────────────── avatar ───────────────────────── */

// Pódio nas cores da marca: 1º laranja, 2º roxo, 3º azul-marinho (texto branco ≥ 4,5:1).
const TONS = {
  orange: "bg-orange-strong text-white",
  purple: "bg-purple text-white",
  navy: "bg-navy text-white",
  gold: "bg-orange-strong text-white",
  silver: "bg-purple text-white",
  bronze: "bg-navy text-white",
  muted: "bg-surface-2 text-ink-soft",
} as const

export type Tom = keyof typeof TONS

export function iniciais(nome?: string) {
  const partes = (nome || "").trim().split(/\s+/).filter(Boolean)
  if (!partes.length) return "?"
  const a = partes[0][0]
  const b = partes.length > 1 ? partes[partes.length - 1][0] : partes[0][1] || ""
  return (a + b).toUpperCase()
}

export function Avatar({ name, tone = "muted", className }: { name?: string; tone?: Tom; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 select-none items-center justify-center rounded-full font-display font-bold",
        TONS[tone],
        className,
      )}
    >
      {iniciais(name)}
    </span>
  )
}

/* ───────────────────────── medidor de nível ─────────────────────────
 * A pílula com dois anéis nas pontas vem do desenho do X: nível atual → próximo.
 * Preenche quando entra na tela (scroll), não ao montar fora da vista.
 */
export function XpPill({ pontos, className, tone = "light" }: { pontos: number; className?: string; tone?: "light" | "dark" }) {
  const p = levelProgress(pontos)
  const pct = Math.max(0.04, p.pct)
  const dark = tone === "dark"
  return (
    <div className={cn("w-full", className)}>
      <div
        className="flex items-center gap-2"
        role="progressbar"
        aria-label={`Progresso para o nível ${p.nivel + 1}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(p.pct * 100)}
      >
        <Node label={p.nivel} filled dark={dark} />
        <div className={cn("relative h-3 flex-1 overflow-hidden rounded-full", dark ? "bg-white/15" : "bg-surface-2")}>
          <motion.div
            className="absolute inset-y-0 left-0 rounded-full bg-orange"
            initial={{ width: "0%" }}
            whileInView={{ width: `${pct * 100}%` }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 1.2, ease: EASE_OUT, delay: 0.1 }}
          />
        </div>
        <Node label={p.nivel + 1} dark={dark} />
      </div>
      <p className={cn("mt-2.5 flex justify-between gap-3 text-[13px]", dark ? "text-navy-soft" : "text-muted-foreground")}>
        <span>Nível {p.nivel}</span>
        <span>
          faltam <span className={cn("tabular font-bold", dark ? "text-white" : "text-ink")}>{p.faltam.toLocaleString("pt-BR")}</span> pts
        </span>
      </p>
    </div>
  )
}

function Node({ label, filled, dark }: { label: number; filled?: boolean; dark?: boolean }) {
  return (
    <span
      className={cn(
        "flex h-9 min-w-9 shrink-0 items-center justify-center rounded-full border-[3px] px-1 font-display text-[13px] font-extrabold tabular-nums",
        filled
          ? "border-orange bg-orange text-white"
          : dark
            ? "border-white/30 text-white"
            : "border-line-strong text-ink-soft",
      )}
    >
      {label}
    </span>
  )
}

/* ───────────────────────── carregamento ───────────────────────── */

export function SkeletonList({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)} role="status" aria-label="Carregando">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex h-16 items-center gap-3 rounded-[14px] border border-line bg-white px-4" style={{ opacity: 1 - i * 0.16 }}>
          <span className="soea-skeleton h-9 w-9 rounded-full" />
          <span className="soea-skeleton h-3 flex-1 rounded-full" />
          <span className="soea-skeleton h-3 w-12 rounded-full" />
        </div>
      ))}
    </div>
  )
}

/* ───────────────────────── cabeçalho de seção ───────────────────────── */

export function SectionTitle({
  children,
  kicker,
  action,
  className,
}: {
  children: React.ReactNode
  kicker?: string
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        {kicker && <p className="kicker">{kicker}</p>}
        <h2 className="mt-0.5 font-display text-[21px] font-extrabold leading-tight text-ink">{children}</h2>
      </div>
      {action}
    </div>
  )
}

/* ───────────────────────── inclinação 3D (crachá) ───────────────────────── */

export function Tilt({ children, className, max = 10 }: { children: React.ReactNode; className?: string; max?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0.5)
  const y = useMotionValue(0.5)
  const rx = useSpring(useTransform(y, [0, 1], [max, -max]), { stiffness: 220, damping: 20 })
  const ry = useSpring(useTransform(x, [0, 1], [-max, max]), { stiffness: 220, damping: 20 })
  const glareX = useTransform(x, [0, 1], ["0%", "100%"])
  const glareY = useTransform(y, [0, 1], ["0%", "100%"])
  const glare = useTransform([glareX, glareY], ([gx, gy]) => `radial-gradient(circle at ${gx} ${gy}, rgb(255 255 255 / 0.35), transparent 55%)`)

  const mover = (e: React.PointerEvent) => {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    x.set((e.clientX - r.left) / r.width)
    y.set((e.clientY - r.top) / r.height)
  }
  const soltar = () => {
    x.set(0.5)
    y.set(0.5)
  }

  return (
    <div style={{ perspective: 900 }} className={className}>
      <motion.div
        ref={ref}
        onPointerMove={mover}
        onPointerLeave={soltar}
        onPointerUp={soltar}
        style={{ rotateX: rx, rotateY: ry, transformStyle: "preserve-3d" }}
        className="relative"
      >
        {children}
        <motion.div aria-hidden className="pointer-events-none absolute inset-0 rounded-[inherit]" style={{ background: glare }} />
      </motion.div>
    </div>
  )
}

/* ───────────────────────── confete ─────────────────────────
 * Pílulas nas cores da marca, em canvas 2D: um único desenho por quadro, some sozinho.
 */
type Particula = { x: number; y: number; vx: number; vy: number; r: number; vr: number; w: number; h: number; c: string; vida: number }

const CORES_CONFETE = ["#eb5c29", "#eb5c29", "#65349c", "#282d61", "#f7a07f"]

export function Confetti({ origem = { x: 0.5, y: 0.38 }, quantidade = 110 }: { origem?: { x: number; y: number }; quantidade?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [vivo, setVivo] = useState(true)

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVivo(false)
      return
    }
    const canvas = ref.current
    const ctx = canvas?.getContext("2d")
    if (!canvas || !ctx) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const W = window.innerWidth
    const H = window.innerHeight
    canvas.width = W * dpr
    canvas.height = H * dpr
    ctx.scale(dpr, dpr)

    const ox = origem.x * W
    const oy = origem.y * H
    const ps: Particula[] = Array.from({ length: quantidade }, () => {
      const ang = Math.random() * Math.PI * 2
      const vel = 6 + Math.random() * 9
      return {
        x: ox,
        y: oy,
        vx: Math.cos(ang) * vel,
        vy: Math.sin(ang) * vel - 6,
        r: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.4,
        w: 5 + Math.random() * 4,
        h: 12 + Math.random() * 10,
        c: CORES_CONFETE[Math.floor(Math.random() * CORES_CONFETE.length)],
        vida: 1,
      }
    })

    let raf = 0
    const frame = () => {
      ctx.clearRect(0, 0, W, H)
      let restam = 0
      for (const p of ps) {
        p.vy += 0.32
        p.vx *= 0.985
        p.vy *= 0.985
        p.x += p.vx
        p.y += p.vy
        p.r += p.vr
        p.vida -= 0.009
        if (p.vida <= 0 || p.y > H + 40) continue
        restam++
        ctx.save()
        ctx.globalAlpha = Math.min(1, p.vida * 1.6)
        ctx.translate(p.x, p.y)
        ctx.rotate(p.r)
        ctx.fillStyle = p.c
        ctx.beginPath()
        ctx.roundRect(-p.w / 2, -p.h / 2, p.w, p.h, p.w / 2)
        ctx.fill()
        ctx.restore()
      }
      if (restam > 0) raf = requestAnimationFrame(frame)
      else setVivo(false)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!vivo) return null
  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-[80] h-full w-full" />
}

/* ───────────────────────── revelar ao rolar ─────────────────────────
 * Efeito de scroll padrão do app: sobe 20px e aparece quando ~30% entra na tela.
 * Uma vez só (não fica piscando ao rolar para cima e para baixo).
 */
export function Reveal({
  children,
  className,
  delay = 0,
  as = "div",
}: {
  children: React.ReactNode
  className?: string
  delay?: number
  as?: "div" | "section" | "li"
}) {
  const Comp = motion[as]
  return (
    <Comp
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.55, ease: EASE_OUT, delay }}
      className={className}
    >
      {children}
    </Comp>
  )
}
