"use client"

import { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion, useScroll, useSpring, useTransform } from "motion/react"
import { AuthForm } from "@/components/auth-form"
import { HomeScreen } from "@/components/home-screen"
import { RankingScreen } from "@/components/ranking-list"
import { UserProfile } from "@/components/user-profile"
import { ContactScreen } from "@/components/contact-screen"
import { QRScanner } from "@/components/qr-scanner"
import { BottomNav, TAB_ORDER, type Tab } from "@/components/bottom-nav"
import { SoeaLockup } from "@/components/soea/mark"
import { scrollToTop } from "@/components/soea/motion-provider"
import { Splash } from "@/components/soea/splash"
import { NetworkStatus } from "@/components/soea/network-status"
import { EASE_OUT } from "@/lib/motion"
import { getStoredUser } from "@/lib/api"
import { Avatar } from "@/components/soea/kit"

export default function Home() {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [activeTab, setActiveTab] = useState<Tab>("home")
  const [isLoading, setIsLoading] = useState(true)
  const [splashFeito, setSplashFeito] = useState(false)
  const [splashMostrou, setSplashMostrou] = useState(false)
  const direcao = useRef(1)

  useEffect(() => {
    try {
      if (localStorage.getItem("user_nexp")) setIsAuthenticated(true)
    } catch {}
    setIsLoading(false)
  }, [])

  const irPara = (tab: Tab) => {
    if (tab === activeTab) return
    direcao.current = TAB_ORDER.indexOf(tab) > TAB_ORDER.indexOf(activeTab) ? 1 : -1
    scrollToTop()
    setActiveTab(tab)
  }

  // Abertura (uma vez por sessão). Nada mais monta por baixo: um contexto WebGL por vez.
  if (!splashFeito || isLoading) {
    return (
      <div className="min-h-dvh bg-white">
        <Splash
          onFim={(mostrou) => {
            setSplashMostrou(mostrou)
            setSplashFeito(true)
          }}
        />
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <main>
        <NetworkStatus />
        <AuthForm logoIntro={!splashMostrou} onSuccess={() => setIsAuthenticated(true)} />
      </main>
    )
  }

  return <AppShell activeTab={activeTab} direcao={direcao.current} irPara={irPara} />
}

function AppShell({ activeTab, direcao: d, irPara }: { activeTab: Tab; direcao: number; irPara: (t: Tab) => void }) {
  const user = typeof window !== "undefined" ? getStoredUser() : null
  // Scroll: o cabeçalho ganha borda/sombra ao rolar e uma linha laranja mostra o progresso
  const { scrollY, scrollYProgress } = useScroll()
  const sombra = useTransform(scrollY, [0, 24], ["0 0 0 rgb(40 45 97 / 0)", "0 6px 20px -14px rgb(40 45 97 / 0.35)"])
  const borda = useTransform(scrollY, [0, 24], ["rgb(228 228 231 / 0)", "rgb(228 228 231 / 1)"])
  const progresso = useSpring(scrollYProgress, { stiffness: 260, damping: 40 })

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="relative min-h-dvh overflow-x-clip bg-white pb-[calc(var(--nav-h)+env(safe-area-inset-bottom)+32px)]"
    >
      <NetworkStatus />
      <motion.header style={{ boxShadow: sombra, borderColor: borda }} className="sticky top-0 z-40 border-b bg-white/95 pt-safe backdrop-blur-md">
        <div className="mx-auto flex h-[var(--header-h)] max-w-md items-center justify-between px-5">
          <button onClick={() => irPara("home")} className="focus-ring -ml-1 rounded-[10px] px-1 py-1" aria-label="Ir para o início">
            <SoeaLockup className="text-[20px]" animate />
          </button>
          <div className="flex items-center">
            <button onClick={() => irPara("profile")} aria-label="Abrir perfil" className="focus-ring pressable rounded-full">
              <Avatar name={user?.nome} tone="purple" className="h-9 w-9 text-[13px]" />
            </button>
          </div>
        </div>
        <motion.span aria-hidden style={{ scaleX: progresso }} className="absolute inset-x-0 -bottom-px h-[2px] origin-left bg-orange" />
      </motion.header>

      <AnimatePresence mode="wait" initial={false} custom={d}>
        <motion.div
          key={activeTab}
          custom={d}
          variants={{
            enter: (dir: number) => ({ opacity: 0, x: dir * 24 }),
            center: { opacity: 1, x: 0 },
            exit: (dir: number) => ({ opacity: 0, x: dir * -24 }),
          }}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.24, ease: EASE_OUT }}
          className="relative mx-auto max-w-md px-5 pt-5"
        >
          {activeTab === "home" && <HomeScreen onNavigate={(t) => irPara(t as Tab)} />}
          {activeTab === "scan" && <QRScanner />}
          {activeTab === "ranking" && <RankingScreen />}
          {activeTab === "profile" && <UserProfile />}
          {activeTab === "contact" && <ContactScreen onBack={() => irPara("home")} />}
        </motion.div>
      </AnimatePresence>

      <BottomNav activeTab={activeTab} onTabChange={(t) => irPara(t as Tab)} />
    </motion.main>
  )
}
