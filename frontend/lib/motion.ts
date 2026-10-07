// Linguagem de movimento do SOEA: saídas exponenciais rápidas e springs com peso.
export const EASE_OUT = [0.16, 1, 0.3, 1] as const
export const EASE_IN_OUT = [0.65, 0, 0.35, 1] as const

export const spring = { type: "spring", stiffness: 420, damping: 34, mass: 0.9 } as const
export const springSoft = { type: "spring", stiffness: 220, damping: 26 } as const
export const springBouncy = { type: "spring", stiffness: 520, damping: 18 } as const

/** Entrada em sequência para listas curtas (sem animar tudo da página). */
export const staggerList = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045, delayChildren: 0.05 } },
}
export const riseItem = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE_OUT } },
}
