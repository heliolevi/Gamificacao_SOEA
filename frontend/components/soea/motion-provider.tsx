"use client"

import { useEffect } from "react"
import Lenis from "lenis"
import { MotionConfig } from "motion/react"
import { gsap, ScrollTrigger } from "@/lib/gsap"

/*
 * Um relógio só: Lenis e ScrollTrigger andam no ticker do GSAP (um único rAF).
 * O Motion usa o próprio frameloop, mas só cuida de elementos dele (layout, presença,
 * gestos) e lê o scroll nativo, que o Lenis mantém. Nenhum elemento tem dois donos.
 *
 * No toque o Lenis deixa a inércia nativa do celular (syncTouch: false): ele suaviza a
 * roda do mouse/trackpad no desktop. Com "reduzir movimento" ligado, nem é criado.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const lenis = new Lenis({ autoRaf: false, syncTouch: false, lerp: 0.12 })
    lenis.on("scroll", ScrollTrigger.update)
    const tick = (time: number) => lenis.raf(time * 1000)
    gsap.ticker.add(tick)
    gsap.ticker.lagSmoothing(0)
    ;(window as any).__lenis = lenis
    return () => {
      gsap.ticker.remove(tick)
      lenis.destroy()
      delete (window as any).__lenis
    }
  }, [])

  return <MotionConfig reducedMotion="user">{children}</MotionConfig>
}

/** Volta ao topo respeitando o Lenis (troca de aba). */
export function scrollToTop() {
  const lenis = (window as any).__lenis as Lenis | undefined
  if (lenis) lenis.scrollTo(0, { immediate: true })
  else window.scrollTo({ top: 0 })
}
