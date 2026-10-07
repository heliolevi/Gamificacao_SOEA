'use client'

import { Toaster as Sonner, ToasterProps } from 'sonner'

/* Toaster do SOEA: os cartões são desenhados em lib/notify.tsx; aqui só posição e pilha. */
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme="light"
      className="toaster group"
      position="top-center"
      gap={10}
      visibleToasts={3}
      offset={{ top: 'calc(env(safe-area-inset-top) + 12px)' }}
      mobileOffset={{ top: 'calc(env(safe-area-inset-top) + 10px)' }}
      toastOptions={{ unstyled: true }}
      {...props}
    />
  )
}

export { Toaster }
