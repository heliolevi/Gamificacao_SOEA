"use client"

import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin"
import { SplitText } from "gsap/SplitText"
import { ScrambleTextPlugin } from "gsap/ScrambleTextPlugin"
import { useGSAP } from "@gsap/react"

if (typeof window !== "undefined") {
  // GSAP 3.13+ liberou todos os plugins (inclusive DrawSVG, SplitText e ScrambleText).
  gsap.registerPlugin(ScrollTrigger, DrawSVGPlugin, SplitText, ScrambleTextPlugin, useGSAP)
  // só em dev: facilita inspecionar/depurar animações pelo console
  if (process.env.NODE_ENV !== "production") (window as any).gsap = gsap
}

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

/** Vibração curta em aparelhos que suportam (Android). Silencioso no resto. */
export function haptic(pattern: number | number[] = 12) {
  try {
    navigator.vibrate?.(pattern)
  } catch {}
}

export { gsap, ScrollTrigger, SplitText, useGSAP }
