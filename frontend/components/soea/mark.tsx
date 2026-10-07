"use client"

import { useId, useRef } from "react"
import { cn } from "@/lib/utils"
import { gsap, useGSAP, prefersReducedMotion } from "@/lib/gsap"
import { LOGO_LINES, LOGO_RINGS } from "@/components/soea/logo-geometry"
import { BRAND_ORANGE, BRAND_X_NODES, BRAND_X_PATHS, BRAND_X_VIEWBOX, GUIDE_TRANSFORM } from "@/components/soea/brand-x"

/*
 * O X oficial da Confea-X. A arte nunca é redesenhada: quando a marca "se desenha",
 * quem anima é uma máscara (o esqueleto do traço) que revela as formas oficiais.
 */

type MarkProps = {
  className?: string
  /** desenha a marca ao montar */
  animate?: boolean
  /** atraso do desenho, em segundos */
  delay?: number
  /** pulso suave nos dois nós (anéis) */
  live?: boolean
  /** cor única da marca (padrão: laranja oficial). Use "#fff" sobre fundos escuros/laranja. */
  color?: string
  /** mantido por compatibilidade; a espessura agora é a da arte oficial */
  weight?: number
  title?: string
  onDrawn?: () => void
}

const GUIA = 30 // espessura do traço-guia na máscara (unidades do esqueleto)

function Guias({ className }: { className?: string }) {
  return (
    <g transform={GUIDE_TRANSFORM} className={className} fill="none" stroke="#fff" strokeWidth={GUIA} strokeLinecap="round" strokeLinejoin="round">
      {LOGO_LINES.map((l, i) => (
        <path key={i} data-line d={l.d} />
      ))}
      {LOGO_RINGS.map((r, i) => (
        <circle key={i} data-ring cx={r.cx} cy={r.cy} r={r.r} />
      ))}
    </g>
  )
}

export function SoeaMark({ className, animate = false, delay = 0, live = false, color = BRAND_ORANGE, title = "SOEA · Confea-X", onDrawn }: MarkProps) {
  const ref = useRef<SVGSVGElement>(null)
  const id = useId().replace(/:/g, "")

  useGSAP(
    () => {
      if (!animate) return
      if (prefersReducedMotion()) {
        gsap.set("[data-full]", { opacity: 1 })
        onDrawn?.()
        return
      }
      gsap
        .timeline({ delay, onComplete: onDrawn })
        .from("[data-line]", { drawSVG: "0%", duration: 0.85, ease: "power2.inOut", stagger: 0.12 })
        .from("[data-ring]", { drawSVG: "50% 50%", duration: 0.5, ease: "power2.out", stagger: 0.08 }, "-=0.5")
        // fecha a máscara inteira: garante a arte oficial pixel a pixel no final
        .to("[data-full]", { opacity: 1, duration: 0.25 }, "-=0.1")
        .from("[data-ping]", { opacity: 0, duration: 0.3 }, "<")
    },
    { scope: ref, dependencies: [animate] },
  )

  return (
    <svg ref={ref} viewBox={BRAND_X_VIEWBOX} className={cn("overflow-visible", className)} role="img" aria-label={title}>
      {animate && (
        <defs>
          <mask id={`m${id}`} maskUnits="userSpaceOnUse" x="980" y="315" width="370" height="370">
            <Guias />
            <rect data-full x="980" y="315" width="370" height="370" fill="#fff" opacity={0} />
          </mask>
        </defs>
      )}
      {live &&
        BRAND_X_NODES.map((n, i) => (
          <circle
            key={i}
            data-ping
            className="soea-node-ping"
            style={{ animationDelay: `${i * 1.2}s` }}
            cx={n.cx}
            cy={n.cy}
            r={n.r}
            fill="none"
            stroke={color}
            strokeWidth={5}
          />
        ))}
      <g fill={color} mask={animate ? `url(#m${id})` : undefined}>
        {BRAND_X_PATHS.map((d, i) => (
          <path key={i} d={d} />
        ))}
      </g>
    </svg>
  )
}

/** Assinatura compacta (cabeçalho): X oficial + nome do evento. */
export function SoeaLockup({ className, animate = false, tone = "dark" }: { className?: string; animate?: boolean; tone?: "dark" | "light" }) {
  return (
    <span className={cn("inline-flex items-center gap-2 leading-none", className)}>
      <SoeaMark className="h-[1.15em] w-[1.15em]" animate={animate} delay={0.15} />
      <span className={cn("font-display font-extrabold tracking-[-0.03em]", tone === "dark" ? "text-ink" : "text-white")}>SOEA</span>
    </span>
  )
}

/** Carregamento com a marca: o X se desenha e se desfaz em loop (máscara sobre a arte oficial). */
export function LogoLoader({ className, label = "Carregando", color = BRAND_ORANGE }: { className?: string; label?: string; color?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const id = useId().replace(/:/g, "")
  useGSAP(
    () => {
      if (prefersReducedMotion()) return
      gsap
        .timeline({ repeat: -1, repeatDelay: 0.15 })
        .fromTo("[data-line], [data-ring]", { drawSVG: "0%" }, { drawSVG: "100%", duration: 0.7, ease: "power2.inOut", stagger: 0.07 })
        .to("[data-line], [data-ring]", { drawSVG: "100% 100%", duration: 0.6, ease: "power2.in", stagger: 0.07 }, "+=0.25")
    },
    { scope: ref },
  )
  return (
    <div ref={ref} role="status" aria-label={label} className={cn("flex items-center justify-center", className)}>
      <svg viewBox={BRAND_X_VIEWBOX} className="h-full w-full overflow-visible" aria-hidden>
        <defs>
          <mask id={`l${id}`} maskUnits="userSpaceOnUse" x="980" y="315" width="370" height="370">
            <Guias />
          </mask>
        </defs>
        <g fill={color} opacity={0.14}>
          {BRAND_X_PATHS.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
        <g fill={color} mask={`url(#l${id})`}>
          {BRAND_X_PATHS.map((d, i) => (
            <path key={i} d={d} />
          ))}
        </g>
      </svg>
    </div>
  )
}
