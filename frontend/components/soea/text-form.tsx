"use client"

import { createElement, useRef } from "react"
import { gsap, useGSAP, SplitText, prefersReducedMotion } from "@/lib/gsap"
import { cn } from "@/lib/utils"

/*
 * Texto que "se forma" na tela.
 * - rise: letras sobem de dentro de uma máscara e desfocam → nítidas (títulos).
 * - scramble: caracteres embaralhados que se decodificam no texto final (nome do evento).
 * - words: palavras surgem em sequência (frases de apoio).
 * Leitores de tela recebem o texto inteiro (aria-label), não as letras soltas.
 */

type Modo = "rise" | "scramble" | "words"

export function TextForm({
  text,
  as = "span",
  mode = "rise",
  delay = 0,
  className,
  onDone,
}: {
  text: string
  as?: keyof React.JSX.IntrinsicElements
  mode?: Modo
  delay?: number
  className?: string
  onDone?: () => void
}) {
  const ref = useRef<HTMLElement>(null)

  useGSAP(
    () => {
      const el = ref.current
      if (!el) return
      if (prefersReducedMotion()) {
        gsap.set(el, { opacity: 1 })
        onDone?.()
        return
      }
      gsap.set(el, { opacity: 1 })

      if (mode === "scramble") {
        el.textContent = ""
        gsap.to(el, {
          delay,
          duration: Math.min(1.6, 0.5 + text.length * 0.12),
          scrambleText: { text, chars: "SOEAX01·+", revealDelay: 0.25, speed: 0.55 },
          ease: "none",
          onComplete: onDone,
        })
        return
      }

      const split = SplitText.create(el, {
        type: mode === "words" ? "words" : "chars,words",
        mask: mode === "words" ? "words" : "chars",
        aria: "auto",
      })
      const alvos = mode === "words" ? split.words : split.chars
      gsap.from(alvos, {
        yPercent: 110,
        opacity: 0,
        filter: mode === "rise" ? "blur(6px)" : "none",
        duration: mode === "words" ? 0.7 : 0.75,
        ease: "expo.out",
        stagger: mode === "words" ? 0.05 : 0.035,
        delay,
        clearProps: "filter",
        onComplete: onDone,
      })
    },
    { scope: ref, dependencies: [text, mode] },
  )

  return createElement(
    as,
    { ref, className: cn("opacity-0", className), "aria-label": text },
    text,
  )
}
