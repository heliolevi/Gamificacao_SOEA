"use client"

import { motion } from "motion/react"
import { Home, Trophy, ScanLine, User } from "lucide-react"
import { cn } from "@/lib/utils"
import { haptic } from "@/lib/gsap"
import { spring, springBouncy } from "@/lib/motion"

// "contact" é uma tela secundária (aberta pelo card da Home): não aparece na barra inferior.
export type Tab = "home" | "ranking" | "scan" | "profile" | "contact"
export const TAB_ORDER: Tab[] = ["home", "ranking", "scan", "profile", "contact"]

interface BottomNavProps {
  activeTab: string
  onTabChange: (tab: string) => void
}

const ITENS: { id: Tab; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Início", icon: Home },
  { id: "ranking", label: "Ranking", icon: Trophy },
  { id: "scan", label: "Escanear", icon: ScanLine },
  { id: "profile", label: "Perfil", icon: User },
]

/*
 * Barra inferior branca, ícone + rótulo em todas as abas (nada escondido).
 * A aba ativa ganha um traço laranja que desliza entre as abas (layoutId) — o mesmo
 * traço arredondado do X da marca. "Escanear" é a ação do jogo: botão laranja elevado.
 */
export function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  const go = (id: Tab) => {
    if (id !== activeTab) haptic(8)
    onTabChange(id)
  }

  return (
    <nav aria-label="Navegação principal" className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-white/95 pb-safe backdrop-blur-md">
      <div className="mx-auto grid h-[var(--nav-h)] max-w-md grid-cols-4 items-stretch px-2">
        {ITENS.map(({ id, label, icon: Icon }) => {
          const ativo = activeTab === id
          const scan = id === "scan"
          return (
            <button
              key={id}
              onClick={() => go(id)}
              aria-current={ativo ? "page" : undefined}
              className="focus-ring relative flex flex-col items-center justify-center gap-1 rounded-[10px]"
            >
              {ativo && !scan && (
                <motion.span layoutId="nav-traco" transition={spring} className="absolute top-0 h-[3px] w-8 rounded-full bg-orange" />
              )}
              {scan ? (
                <motion.span
                  whileTap={{ scale: 0.9 }}
                  animate={ativo ? { y: -6, scale: 1.04 } : { y: -6, scale: 1 }}
                  transition={springBouncy}
                  className={cn(
                    "flex h-[52px] w-[52px] items-center justify-center rounded-full bg-orange-strong text-white shadow-[0_10px_22px_-8px_var(--brand-orange)]",
                    ativo && "ring-4 ring-orange-tint",
                  )}
                >
                  <Icon className="h-6 w-6" strokeWidth={2.3} />
                </motion.span>
              ) : (
                <motion.span whileTap={{ scale: 0.88 }} transition={springBouncy} className="flex flex-col items-center gap-1">
                  <Icon className={cn("h-[22px] w-[22px] transition-colors", ativo ? "text-orange-ink" : "text-subtle")} strokeWidth={ativo ? 2.4 : 1.9} />
                </motion.span>
              )}
              <span
                className={cn(
                  "text-[11px] leading-none transition-colors",
                  scan && "-mt-1.5",
                  ativo ? "font-bold text-ink" : "font-semibold text-subtle",
                )}
              >
                {label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
