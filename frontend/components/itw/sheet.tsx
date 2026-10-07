"use client"

import { Drawer as DrawerPrimitive } from "vaul"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

/**
 * Bottom sheet (vaul): arrastável para fechar, com alça visível e botão de fechar.
 * Fundo desfocado só para indicar que o conteúdo atrás está em segundo plano.
 */
export function Sheet({
  open,
  onOpenChange,
  title,
  kicker,
  description,
  children,
  className,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  kicker?: string
  description?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <DrawerPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Overlay className="fixed inset-0 z-50 bg-navy-deep/45 backdrop-blur-[2px]" />
        <DrawerPrimitive.Content
          data-lenis-prevent
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 mx-auto flex max-h-[90dvh] w-full max-w-md flex-col rounded-t-[24px] bg-white shadow-lift outline-none",
            className,
          )}
        >
          <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-line-strong" />
          <div className="flex items-start justify-between gap-4 px-5 pb-2 pt-4">
            <div className="min-w-0">
              {kicker && <p className="kicker mb-1">{kicker}</p>}
              <DrawerPrimitive.Title className="font-display text-[22px] font-extrabold leading-tight text-ink">{title}</DrawerPrimitive.Title>
              {description ? (
                <DrawerPrimitive.Description className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">{description}</DrawerPrimitive.Description>
              ) : (
                <DrawerPrimitive.Description className="sr-only">{title}</DrawerPrimitive.Description>
              )}
            </div>
            <DrawerPrimitive.Close
              className="focus-ring pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface text-ink-soft"
              aria-label="Fechar"
            >
              <X className="h-[18px] w-[18px]" />
            </DrawerPrimitive.Close>
          </div>
          <div className="overflow-y-auto px-5 pb-[max(20px,env(safe-area-inset-bottom))]">{children}</div>
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  )
}
