"use client"

import { useEffect, useRef } from "react"

/*
 * Cena do Spline usando o runtime oficial direto num <canvas> (sem o wrapper React,
 * que não resolve bem no bundler do Next). Renderiza sob demanda e é descartada ao sair.
 */
export default function SplineScene({
  scene,
  className,
  onLoad,
  onError,
}: {
  scene: string
  className?: string
  onLoad?: () => void
  onError?: () => void
}) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    let app: { dispose?: () => void } | null = null
    let vivo = true
    import("@splinetool/runtime")
      .then(async ({ Application }) => {
        if (!vivo) return
        const a = new Application(canvas, { renderOnDemand: true })
        app = a as unknown as { dispose?: () => void }
        await a.load(scene)
        if (vivo) onLoad?.()
      })
      .catch(() => vivo && onError?.())
    return () => {
      vivo = false
      app?.dispose?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene])

  return <canvas ref={ref} aria-hidden className={className} />
}
