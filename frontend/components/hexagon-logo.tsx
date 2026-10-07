"use client"

import { cn } from "@/lib/utils"
import { SoeaMark } from "@/components/soea/mark"

/** Nome legado (painel admin): agora renderiza o X oficial da Confea-X. */
export function HexagonLogo({ className, size = "md" }: { className?: string; size?: "sm" | "md" | "lg" }) {
  const sizes = { sm: "w-8 h-8", md: "w-12 h-12", lg: "w-20 h-20" }
  return <SoeaMark className={cn(sizes[size], className)} />
}
