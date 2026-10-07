"use client"

import { useEffect, useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import { HeroLogo } from "@/components/soea/hero-logo"
import { TextForm } from "@/components/soea/text-form"
import { EVENT } from "@/lib/event"

/*
 * Abertura do app (uma vez por sessão): o X da marca cresce em 3D, "SOEA" se decodifica
 * e a tela se dissolve na próxima. Toque em qualquer lugar para pular.
 */
const CHAVE = "soea_splash_visto"

export function Splash({ onFim }: { onFim: (mostrou: boolean) => void }) {
  // começa escondido: só monta o logo 3D depois de decidir que a abertura vai rodar
  const [visivel, setVisivel] = useState(false)

  useEffect(() => {
    let jaViu = false
    try {
      jaViu = sessionStorage.getItem(CHAVE) === "1"
      sessionStorage.setItem(CHAVE, "1")
    } catch {}
    const reduz = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (jaViu || reduz) {
      onFim(false)
      return
    }
    setVisivel(true)
    const t = setTimeout(() => setVisivel(false), 3200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <AnimatePresence onExitComplete={() => onFim(true)}>
      {visivel && (
        <motion.div
          key="splash"
          role="presentation"
          onClick={() => setVisivel(false)}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.04, filter: "blur(8px)" }}
          transition={{ duration: 0.6, ease: [0.65, 0, 0.35, 1] }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-white px-6"
        >
          <HeroLogo className="h-[min(62vw,280px)] w-[min(62vw,280px)]" />
          <TextForm
            as="p"
            mode="scramble"
            text={EVENT.name}
            delay={1.1}
            className="mt-2 font-display text-[56px] font-extrabold leading-none tracking-[-0.04em] text-navy"
          />
          <TextForm
            as="p"
            mode="words"
            text={EVENT.fullName}
            delay={1.8}
            className="mt-3 max-w-[26ch] text-center text-[15px] leading-snug text-muted-foreground"
          />
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 2.1, duration: 0.6 }}
            className="absolute bottom-[max(28px,env(safe-area-inset-bottom))] text-[13px] font-semibold text-subtle"
          >
            Uma experiência <span className="text-navy">Confea</span>
            <span className="text-orange-ink">-X</span>
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
