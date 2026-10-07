import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import { Analytics } from '@vercel/analytics/next'
import { Toaster } from '@/components/ui/sonner'
import { MotionProvider } from '@/components/soea/motion-provider'
import './globals.css'

// Tipografia do site Confea-X: Open Sans para tudo; JetBrains Mono só em códigos.
// Fontes variáveis empacotadas (sem depender do Google Fonts no build).
const openSans = localFont({
  // subconjunto latin cobre todo o português (á, ã, ç, é, õ…)
  src: '../node_modules/@fontsource-variable/open-sans/files/open-sans-latin-wght-normal.woff2',
  weight: '300 800',
  variable: '--font-open-sans',
  display: 'swap',
})

const jetbrains = localFont({
  src: '../node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2',
  weight: '400 700',
  variable: '--font-jetbrains',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'SOEA · Caça QR',
  description: 'Escaneie os QR Codes do SOEA, responda perguntas bônus e suba no ranking.',
  applicationName: 'SOEA',
  appleWebApp: {
    capable: true,
    title: 'SOEA',
    statusBarStyle: 'default',
  },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  themeColor: '#ffffff',
  colorScheme: 'light',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${openSans.variable} ${jetbrains.variable} bg-background`}
    >
      <body className="font-sans antialiased min-h-dvh">
        <MotionProvider>{children}</MotionProvider>
        <Toaster />
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
