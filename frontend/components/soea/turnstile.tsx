"use client"

import { useEffect, useRef } from "react"

/*
 * Cloudflare Turnstile (anti-robô), opcional. Só aparece se
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY estiver definido; o backend só exige o token se
 * TURNSTILE_SECRET estiver definido. Configure os dois juntos.
 */

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string
      reset: (id?: string) => void
      remove: (id: string) => void
    }
  }
}

let carregando: Promise<void> | null = null
function carregarScript() {
  if (window.turnstile) return Promise.resolve()
  if (!carregando) {
    carregando = new Promise((resolve, reject) => {
      const s = document.createElement("script")
      s.src = SCRIPT_SRC
      s.async = true
      s.onload = () => resolve()
      s.onerror = () => reject(new Error("turnstile"))
      document.head.appendChild(s)
    })
  }
  return carregando
}

export const turnstileAtivo = Boolean(SITE_KEY)

export function Turnstile({ onToken }: { onToken: (token: string | null) => void }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!SITE_KEY || !ref.current) return
    let id: string | undefined
    let vivo = true
    carregarScript()
      .then(() => {
        if (!vivo || !ref.current || !window.turnstile) return
        id = window.turnstile.render(ref.current, {
          sitekey: SITE_KEY,
          theme: "light",
          size: "flexible",
          callback: (t: string) => onToken(t),
          "expired-callback": () => onToken(null),
          "error-callback": () => onToken(null),
        })
      })
      .catch(() => onToken(null))
    return () => {
      vivo = false
      if (id && window.turnstile) window.turnstile.remove(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!SITE_KEY) return null
  return <div ref={ref} className="min-h-[65px] overflow-hidden rounded-2xl" />
}
