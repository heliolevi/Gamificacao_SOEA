"use client"

import { useEffect, useRef, useState } from "react"
import * as THREE from "three"
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js"
import { gsap } from "@/lib/gsap"
import { cn } from "@/lib/utils"
import { LOGO_CENTER, LOGO_LINES, LOGO_RINGS, LOGO_STROKE } from "@/components/soea/logo-geometry"
import { SoeaMark } from "@/components/soea/mark"

/*
 * O X da Confea-X em 3D: cada traço do logo vira um tubo (TubeGeometry) e cada anel
 * um toro, com a mesma espessura da arte. Na entrada os tubos CRESCEM ao longo do
 * próprio caminho (setDrawRange), como se a marca fosse desenhada no ar.
 *
 * Desempenho no celular:
 * - renderiza no ticker do GSAP (um único rAF para o app inteiro, junto com o Lenis);
 * - para de renderizar fora da tela, com a aba escondida ou parado (sem mudança);
 * - devicePixelRatio limitado a 1,75; ~6 mil triângulos no total;
 * - sem WebGL ou com "reduzir movimento": cai para o SVG animado.
 */

const ESCALA = 1 / 120 // unidades do logo (px de 512) → mundo
const RAIO = (LOGO_STROKE / 2) * ESCALA

function paraMundo([x, y]: [number, number]) {
  return new THREE.Vector3((x - LOGO_CENTER.x) * ESCALA, -(y - LOGO_CENTER.y) * ESCALA, 0)
}

function suportaWebGL() {
  try {
    const c = document.createElement("canvas")
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")))
  } catch {
    return false
  }
}

export default function Logo3D({
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
  const host = useRef<HTMLDivElement>(null)
  const [fallback, setFallback] = useState(false)

  useEffect(() => {
    const el = host.current
    if (!el) return
    const reduz = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduz || !suportaWebGL()) {
      setFallback(true)
      return
    }

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" })
    } catch {
      setFallback(true)
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75))
    renderer.outputColorSpace = THREE.SRGBColorSpace
    // Neutral preserva o laranja da marca (o ACES desbota para pêssego)
    renderer.toneMapping = THREE.NeutralToneMapping
    renderer.toneMappingExposure = 1
    el.appendChild(renderer.domElement)
    renderer.domElement.style.width = "100%"
    renderer.domElement.style.height = "100%"
    renderer.domElement.setAttribute("aria-hidden", "true")

    const scene = new THREE.Scene()
    const pmrem = new THREE.PMREMGenerator(renderer)
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = env

    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50)
    camera.position.set(0, 0, 9.4)

    const key = new THREE.DirectionalLight(0xffffff, 0.9)
    key.position.set(-3, 4, 6)
    scene.add(key)
    const rim = new THREE.DirectionalLight(0xffc6ad, 1.6)
    rim.position.set(4, -2, -3)
    scene.add(rim)

    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#eb5c29"),
      roughness: 0.4,
      metalness: 0.08,
      envMapIntensity: 0.32,
    })

    const grupo = new THREE.Group()
    scene.add(grupo)

    // traços → tubos com tampas redondas
    const tubos: { geo: THREE.TubeGeometry; total: number; capFim: THREE.Mesh }[] = []
    const esferaGeo = new THREE.SphereGeometry(RAIO, 20, 14)
    for (const linha of LOGO_LINES) {
      const pontos = linha.pts.map(paraMundo)
      const curva = new THREE.CatmullRomCurve3(pontos, false, "centripetal")
      const segs = Math.max(24, Math.round(curva.getLength() * 26))
      const geo = new THREE.TubeGeometry(curva, segs, RAIO, 16, false)
      const total = geo.index ? geo.index.count : geo.attributes.position.count
      grupo.add(new THREE.Mesh(geo, material))
      const capIni = new THREE.Mesh(esferaGeo, material)
      capIni.position.copy(pontos[0])
      const capFim = new THREE.Mesh(esferaGeo, material)
      capFim.position.copy(pontos[pontos.length - 1])
      grupo.add(capIni, capFim)
      tubos.push({ geo, total, capFim })
    }
    // anéis → toros
    const aneis: { geo: THREE.TorusGeometry; total: number }[] = []
    for (const r of LOGO_RINGS) {
      const geo = new THREE.TorusGeometry(r.r * ESCALA, RAIO, 16, 72)
      const mesh = new THREE.Mesh(geo, material)
      mesh.position.copy(paraMundo([r.cx, r.cy]))
      grupo.add(mesh)
      aneis.push({ geo, total: geo.index ? geo.index.count : 0 })
    }

    // tamanho
    const ajustar = () => {
      const w = el.clientWidth || 1
      const h = el.clientHeight || 1
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      sujo = true
    }
    let sujo = true
    const ro = new ResizeObserver(ajustar)
    ro.observe(el)
    ajustar()

    // crescimento dos traços
    const estado = { p: intro ? 0 : 1, giro: intro ? -0.9 : 0 }
    const aplicarCrescimento = () => {
      const n = tubos.length
      tubos.forEach((t, i) => {
        // cada traço começa um pouco depois do anterior (mesma ordem do SVG)
        const local = gsap.utils.clamp(0, 1, (estado.p * (n + 2) - i * 0.9) / 1.6)
        const count = Math.floor((t.total * local) / 6) * 6
        t.geo.setDrawRange(0, count)
        t.capFim.visible = local >= 0.999
      })
      const pa = gsap.utils.clamp(0, 1, estado.p * 1.6 - 0.6)
      aneis.forEach((a) => a.geo.setDrawRange(0, Math.floor((a.total * pa) / 6) * 6))
      sujo = true
    }
    aplicarCrescimento()

    const tl = gsap.timeline({ delay, onComplete: onDrawn })
    if (intro) {
      tl.to(estado, { p: 1, duration: 1.9, ease: "power2.inOut", onUpdate: aplicarCrescimento })
        .to(estado, { giro: 0, duration: 2.2, ease: "expo.out" }, 0)
    } else {
      onDrawn?.()
    }

    // inclinação: ponteiro/toque e, no Android, o giroscópio
    const alvo = { x: 0, y: 0 }
    const atual = { x: 0, y: 0 }
    const aoMover = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      alvo.y = ((e.clientX - r.left) / r.width - 0.5) * 0.7
      alvo.x = ((e.clientY - r.top) / r.height - 0.5) * 0.5
    }
    const aoSair = () => {
      alvo.x = 0
      alvo.y = 0
    }
    const aoGirar = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return
      alvo.y = gsap.utils.clamp(-0.45, 0.45, (e.gamma / 45) * 0.45)
      alvo.x = gsap.utils.clamp(-0.35, 0.35, ((e.beta - 45) / 45) * 0.35)
    }
    window.addEventListener("pointermove", aoMover, { passive: true })
    el.addEventListener("pointerleave", aoSair)
    window.addEventListener("deviceorientation", aoGirar, { passive: true })

    // visibilidade: só renderiza quando aparece na tela e a aba está ativa
    let visivel = true
    const io = new IntersectionObserver(([e]) => (visivel = e.isIntersecting), { threshold: 0.01 })
    io.observe(el)

    const inicio = performance.now()
    const tick = () => {
      if (!visivel || document.hidden) return
      const t = (performance.now() - inicio) / 1000
      atual.x += (alvo.x - atual.x) * 0.08
      atual.y += (alvo.y - atual.y) * 0.08
      grupo.rotation.x = atual.x + Math.sin(t * 0.7) * 0.06
      grupo.rotation.y = atual.y + estado.giro + Math.sin(t * 0.5) * 0.12
      grupo.position.y = Math.sin(t * 1.1) * 0.06
      renderer.render(scene, camera)
      sujo = false
    }
    gsap.ticker.add(tick)

    return () => {
      gsap.ticker.remove(tick)
      tl.kill()
      ro.disconnect()
      io.disconnect()
      window.removeEventListener("pointermove", aoMover)
      el.removeEventListener("pointerleave", aoSair)
      window.removeEventListener("deviceorientation", aoGirar)
      scene.traverse((o) => {
        if ((o as THREE.Mesh).geometry) (o as THREE.Mesh).geometry.dispose()
      })
      material.dispose()
      env.dispose()
      pmrem.dispose()
      renderer.dispose()
      renderer.domElement.remove()
      void sujo
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div ref={host} className={cn("relative", className)}>
      {fallback && <SoeaMark animate={intro} delay={delay} live onDrawn={onDrawn} className="absolute inset-[14%] h-[72%] w-[72%]" />}
    </div>
  )
}
