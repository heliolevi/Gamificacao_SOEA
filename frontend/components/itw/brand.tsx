"use client"

import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import { gsap, prefersReducedMotion } from "@/lib/gsap"
import { EVENT } from "@/lib/event"
import { SoeaLockup } from "@/components/soea/mark"

/*
 * A identidade IT-WORKS foi substituída pela SOEA. Estes nomes continuam exportados
 * para as telas que ainda os importam; a implementação agora vem de components/soea.
 */
export function Wordmark({ className, subtitle = true }: { className?: string; subtitle?: boolean }) {
  return (
    <div className={cn("select-none", className)}>
      <SoeaLockup className="text-[40px]" />
      {subtitle && <p className="mt-2 max-w-[26ch] text-[15px] leading-snug text-muted-foreground">{EVENT.fullName}</p>}
    </div>
  )
}

export function WordmarkInline({ className }: { className?: string }) {
  return <SoeaLockup className={className} />
}

/** Número que conta até o valor com GSAP (formatado em pt-BR). */
export function CountUp({ value, duration = 1.2, className, prefix = "" }: { value: number; duration?: number; className?: string; prefix?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const current = useRef(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const fmt = (n: number) => prefix + Math.round(n).toLocaleString("pt-BR")
    if (prefersReducedMotion()) {
      current.current = value
      el.textContent = fmt(value)
      return
    }
    const obj = { v: current.current }
    const tween = gsap.to(obj, {
      v: value,
      duration,
      ease: "power3.out",
      onUpdate: () => {
        el.textContent = fmt(obj.v)
      },
      onComplete: () => {
        current.current = value
      },
    })
    return () => {
      tween.kill()
      current.current = obj.v
    }
  }, [value, duration, prefix])

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {prefix}0
    </span>
  )
}

/** Avatar com iniciais, no estilo "crachá". */
export function InitialsBlock({ name, className, tone = "cyan" }: { name?: string; className?: string; tone?: "cyan" | "crimson" | "gold" | "silver" | "bronze" | "muted" }) {
  const initials =
    name
      ?.trim()
      .split(/\s+/)
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "??"
  const tones: Record<string, string> = {
    cyan: "bg-orange-strong text-white",
    crimson: "bg-purple text-white",
    gold: "bg-orange-strong text-white",
    silver: "bg-purple text-white",
    bronze: "bg-navy text-white",
    muted: "bg-surface-2 text-ink border border-line",
  }
  return (
    <div className={cn("rounded-full flex shrink-0 items-center justify-center font-display font-bold", tones[tone], className)}>
      {initials}
    </div>
  )
}
