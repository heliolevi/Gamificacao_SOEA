"use client"

import { cn } from "@/lib/utils"

/**
 * Botão principal (padrão do site Confea-X: raio 10px, peso forte).
 * Tons: "cyan" (nome legado) = laranja da marca · "crimson" = perigo · "white" = neutro ·
 * "purple" = ação secundária da marca.
 */
export function PrimaryButton({
  children,
  loading,
  className,
  tone = "cyan",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean; tone?: "cyan" | "crimson" | "white" | "purple" }) {
  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      aria-busy={loading || undefined}
      className={cn(
        "focus-ring pressable relative flex h-[52px] w-full items-center justify-center gap-2.5 rounded-[10px] px-5 text-[16px] font-bold disabled:opacity-45",
        tone === "cyan" && "bg-orange-strong text-white shadow-[0_10px_24px_-12px_var(--brand-orange)] hover:bg-[#b93c11]",
        tone === "purple" && "bg-purple text-white hover:bg-[#572c88]",
        tone === "crimson" && "bg-danger text-white",
        tone === "white" && "border border-line-strong bg-white text-ink hover:bg-surface",
        className,
      )}
    >
      {loading ? (
        <span className="flex items-center gap-1.5" aria-label="Processando">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-2 w-2 animate-pulse rounded-full bg-current" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </span>
      ) : (
        children
      )}
    </button>
  )
}

/** Cartão de superfície (raio 14px do site). `corners` mantido por compatibilidade. */
export function Panel({
  children,
  className,
  corners: _corners = false,
  cornerColor: _cornerColor,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { corners?: boolean; cornerColor?: string }) {
  return (
    <div {...props} className={cn("relative rounded-[14px] border border-line bg-white", className)}>
      {children}
    </div>
  )
}

/** Cabeçalho de seção no padrão do site: rótulo laranja pequeno + título forte. */
export function SectionHeader({
  kicker,
  title,
  action,
  className,
}: {
  kicker?: string
  title: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("flex items-end justify-between gap-4", className)}>
      <div className="min-w-0">
        {kicker && <p className="kicker">{kicker}</p>}
        <h2 className="mt-0.5 font-display text-[20px] font-extrabold leading-tight text-ink">{title}</h2>
      </div>
      {action}
    </div>
  )
}

export function SkeletonRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-2", className)} aria-label="Carregando" role="status">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex h-14 items-center gap-3 rounded-[14px] border border-line bg-white px-3" style={{ opacity: 1 - i * 0.14 }}>
          <div className="soea-skeleton h-8 w-8 rounded-full" />
          <div className="soea-skeleton h-3 flex-1 rounded-full" />
          <div className="soea-skeleton h-3 w-12 rounded-full" />
        </div>
      ))}
    </div>
  )
}
