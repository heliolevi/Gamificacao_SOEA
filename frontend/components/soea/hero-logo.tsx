"use client"

import dynamic from "next/dynamic"
import { useState } from "react"
import { cn } from "@/lib/utils"
import { SoeaMark } from "@/components/soea/mark"

/*
 * Logo de destaque (splash e login). Três camadas, da mais rica para a mais leve:
 *
 * 1. Spline — se NEXT_PUBLIC_SPLINE_SCENE apontar para uma cena publicada no Spline
 *    (Export → Code → URL ".splinecode"), ela é carregada sob demanda.
 * 2. Three.js — o X da marca em tubos 3D que crescem ao longo do traço (padrão).
 * 3. SVG — o mesmo X se desenhando, para aparelhos sem WebGL ou com "reduzir movimento".
 *
 * Só um contexto WebGL existe por vez: a cena Spline substitui a do Three, nunca soma.
 */

const SPLINE_SCENE = process.env.NEXT_PUBLIC_SPLINE_SCENE

const Logo3D = dynamic(() => import("@/components/soea/logo-3d"), {
  ssr: false,
  loading: () => <SoeaMark className="absolute inset-[14%] h-[72%] w-[72%] opacity-0" />,
})

const SplineScene = dynamic(() => import("@/components/soea/spline-scene"), { ssr: false })

export function HeroLogo({
  className,
  intro = true,
  delay = 0,
  onDrawn,
}: {
  className?: string
  intro?: boolean
  delay?: number
  onDrawn?: () => void
}) {
  const [splinePronta, setSplinePronta] = useState(false)
  const [splineFalhou, setSplineFalhou] = useState(false)

  if (SPLINE_SCENE && !splineFalhou) {
    return (
      <div className={cn("relative", className)}>
        <SplineScene
          scene={SPLINE_SCENE}
          onLoad={() => {
            setSplinePronta(true)
            onDrawn?.()
          }}
          onError={() => setSplineFalhou(true)}
          className={cn("absolute inset-0 h-full w-full transition-opacity duration-700", splinePronta ? "opacity-100" : "opacity-0")}
        />
        {!splinePronta && <SoeaMark animate={intro} delay={delay} live className="absolute inset-[14%] h-[72%] w-[72%]" />}
      </div>
    )
  }

  return <Logo3D className={className} intro={intro} delay={delay} onDrawn={onDrawn} />
}
