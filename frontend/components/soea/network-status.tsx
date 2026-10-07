"use client"

import { useEffect } from "react"
import { notify } from "@/lib/notify"

/** Avisa quando o celular perde ou recupera a conexão (comum em pavilhão de evento). */
export function NetworkStatus() {
  useEffect(() => {
    const off = () =>
      notify.offline("Sem conexão", "Suas capturas precisam de internet. Assim que voltar, é só escanear de novo.", {
        id: "rede",
        duracao: Infinity,
      })
    const on = () => {
      notify.dismiss("rede")
      notify.success("Conexão de volta", undefined, { id: "rede-ok", duracao: 2200 })
    }
    if (!navigator.onLine) off()
    window.addEventListener("offline", off)
    window.addEventListener("online", on)
    return () => {
      window.removeEventListener("offline", off)
      window.removeEventListener("online", on)
    }
  }, [])
  return null
}
