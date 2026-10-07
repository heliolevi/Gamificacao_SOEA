"use client"

import { toast } from "sonner"
import { motion } from "motion/react"
import { AlertTriangle, Check, Info, Star, WifiOff } from "lucide-react"
import { cn } from "@/lib/utils"
import { haptic } from "@/lib/gsap"

/*
 * Toasts do SOEA. Cartão branco próprio (não o visual padrão do sonner): ícone num nó
 * redondo, como os anéis do X, e uma linha de tempo que esvazia até sumir.
 * Arraste para cima para dispensar (gesto do sonner).
 */

type Tipo = "success" | "error" | "reward" | "info" | "offline"

const ESTILO: Record<Tipo, { icone: React.ReactNode; no: string; barra: string }> = {
  success: { icone: <Check className="h-4 w-4" strokeWidth={3} />, no: "bg-success text-white", barra: "bg-success" },
  error: { icone: <AlertTriangle className="h-4 w-4" />, no: "bg-danger text-white", barra: "bg-danger" },
  reward: { icone: <Star className="h-4 w-4" fill="currentColor" />, no: "bg-orange-strong text-white", barra: "bg-orange" },
  info: { icone: <Info className="h-4 w-4" />, no: "bg-purple text-white", barra: "bg-purple" },
  offline: { icone: <WifiOff className="h-4 w-4" />, no: "bg-navy text-white", barra: "bg-navy" },
}

function Cartao({ tipo, titulo, texto, duracao }: { tipo: Tipo; titulo: string; texto?: string; duracao: number }) {
  const e = ESTILO[tipo]
  return (
    <div className="relative flex w-[min(92vw,380px)] items-start gap-3 overflow-hidden rounded-[14px] border border-line bg-white px-4 py-3.5 shadow-lift">
      <motion.span
        initial={{ scale: 0, rotate: -40 }}
        animate={{ scale: 1, rotate: 0 }}
        transition={{ type: "spring", stiffness: 520, damping: 18, delay: 0.05 }}
        className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full", e.no)}
      >
        {e.icone}
      </motion.span>
      <div className="min-w-0 flex-1 pt-0.5">
        <p className="font-display text-[15px] font-bold leading-snug text-ink">{titulo}</p>
        {texto && <p className="mt-0.5 text-[14px] leading-snug text-muted-foreground">{texto}</p>}
      </div>
      {Number.isFinite(duracao) && (
        <motion.span
          aria-hidden
          className={cn("absolute bottom-0 left-0 h-[3px] rounded-full", e.barra)}
          initial={{ width: "100%" }}
          animate={{ width: "0%" }}
          transition={{ duration: duracao / 1000, ease: "linear" }}
        />
      )}
    </div>
  )
}

function mostrar(tipo: Tipo, titulo: string, texto?: string, opcoes: { duracao?: number; id?: string } = {}) {
  const duracao = opcoes.duracao ?? (tipo === "error" ? 5000 : 3600)
  if (tipo === "reward") haptic([10, 30, 14])
  else if (tipo === "error") haptic([30, 40, 30])
  return toast.custom(() => <Cartao tipo={tipo} titulo={titulo} texto={texto} duracao={duracao} />, {
    duration: duracao,
    id: opcoes.id,
  })
}

export const notify = {
  success: (t: string, d?: string, o?: { duracao?: number; id?: string }) => mostrar("success", t, d, o),
  error: (t: string, d?: string, o?: { duracao?: number; id?: string }) => mostrar("error", t, d, o),
  reward: (t: string, d?: string, o?: { duracao?: number; id?: string }) => mostrar("reward", t, d, o),
  info: (t: string, d?: string, o?: { duracao?: number; id?: string }) => mostrar("info", t, d, o),
  offline: (t: string, d?: string, o?: { duracao?: number; id?: string }) => mostrar("offline", t, d, o),
  dismiss: (id?: string) => toast.dismiss(id),
}
