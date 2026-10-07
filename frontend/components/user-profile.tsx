"use client"

import { useEffect, useState } from "react"
import { motion } from "motion/react"
import { Check, LogOut, Pencil, QrCode, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { notify } from "@/lib/notify"
import { apiFetch, atualizarUsuario, getStoredUser, sair } from "@/lib/api"
import { EASE_OUT, spring } from "@/lib/motion"
import { CountUp } from "@/components/itw/brand"
import { Sheet } from "@/components/itw/sheet"
import { Avatar, Tilt, XpPill } from "@/components/soea/kit"
import { LogoLoader, SoeaMark } from "@/components/soea/mark"

type Stats = { qrCodesFound: number; totalPoints: number; ranking: string; nivel: number }

export function UserProfile() {
  const [user, setUser] = useState<any>(() => (typeof window !== "undefined" ? getStoredUser() : null))
  const [stats, setStats] = useState<Stats>({ qrCodesFound: 0, totalPoints: 0, ranking: "-", nivel: 1 })
  const [isEditing, setIsEditing] = useState(false)
  const [editedName, setEditedName] = useState(user?.nome ?? "")
  const [meuQrUrl, setMeuQrUrl] = useState<string | null>(null)
  const [isQrOpen, setIsQrOpen] = useState(false)
  const [isLoadingQr, setIsLoadingQr] = useState(false)
  const [confirmLogout, setConfirmLogout] = useState(false)

  useEffect(() => {
    if (!user) return
    ;(async () => {
      try {
        const res = await apiFetch(`/usuarios/me/posicao`)
        if (!res.ok) return
        const d = await res.json()
        setStats({
          qrCodesFound: d.qrs_capturados || 0,
          totalPoints: d.pontos || 0,
          ranking: String(d.posicao),
          nivel: d.nivel || 1,
        })
      } catch (e) {
        console.error("Erro ao carregar perfil:", e)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!confirmLogout) return
    const t = setTimeout(() => setConfirmLogout(false), 3000)
    return () => clearTimeout(t)
  }, [confirmLogout])

  const handleLogout = async () => {
    await sair()
    window.location.reload()
  }

  const handleSalvarNome = async () => {
    if (!editedName.trim() || editedName === user.nome) {
      setIsEditing(false)
      return
    }
    try {
      const res = await apiFetch(`/usuarios/me/nome`, {
        method: "PATCH",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ nome: editedName }),
      })
      if (!res.ok) throw new Error()
      const data = await res.json()
      setUser({ ...user, nome: data.nome })
      atualizarUsuario({ nome: data.nome })
      notify.success("Nome atualizado", "É assim que você aparece no ranking.")
    } catch {
      notify.error("Não deu para salvar o nome", "Confira a conexão e tente de novo.")
      setEditedName(user.nome)
    }
    setIsEditing(false)
  }

  const handleAbrirMeuQrCode = async () => {
    setIsQrOpen(true)
    if (meuQrUrl) return
    setIsLoadingQr(true)
    try {
      const res = await apiFetch(`/usuarios/me/qrcode`)
      if (!res.ok) throw new Error()
      setMeuQrUrl(URL.createObjectURL(await res.blob()))
    } catch {
      notify.error("Não deu para gerar seu QR", "Confira a conexão e tente de novo.")
      setIsQrOpen(false)
    } finally {
      setIsLoadingQr(false)
    }
  }

  if (!user) return null

  const posicao = stats.ranking && stats.ranking !== "-" && stats.ranking !== "undefined" ? `${stats.ranking}º lugar` : "sem posição ainda"

  return (
    <div className="space-y-6">
      <div>
        <p className="kicker">Seu crachá</p>
        <h2 className="mt-0.5 font-display text-[28px] font-extrabold leading-tight tracking-[-0.03em] text-ink">Perfil</h2>
      </div>
      {/* Crachá do evento — o momento da tela: entra girando de leve e responde ao toque */}
      <motion.div
        initial={{ opacity: 0, y: 30, rotateX: 18 }}
        animate={{ opacity: 1, y: 0, rotateX: 0 }}
        transition={{ duration: 0.9, ease: EASE_OUT }}
        style={{ transformPerspective: 900 }}
      >
        <Tilt max={7}>
          <div className="relative overflow-hidden rounded-[18px] border border-line bg-white shadow-lift">
            {/* faixa do crachá com o furo do cordão */}
            <div className="relative flex h-14 items-center justify-between bg-navy px-5 text-white">
              <span className="flex items-center gap-2 font-display text-[15px] font-extrabold">
                <SoeaMark className="h-5 w-5" />
                SOEA
              </span>
              <span aria-hidden className="absolute left-1/2 top-3 h-2.5 w-12 -translate-x-1/2 rounded-full bg-white/90" />
              <button
                onClick={() => (confirmLogout ? handleLogout() : setConfirmLogout(true))}
                className={cn(
                  "focus-ring flex h-10 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-bold transition-colors",
                  confirmLogout ? "bg-danger text-white" : "bg-white/12 text-white",
                )}
                aria-label={confirmLogout ? "Confirmar saída" : "Sair da conta"}
              >
                <LogOut className="h-3.5 w-3.5" />
                {confirmLogout ? "Sair agora" : "Sair"}
              </button>
            </div>

            <div className="flex items-start gap-4 px-5 pb-5 pt-5">
              <Avatar name={user.nome} tone="purple" className="h-[72px] w-[72px] text-[24px]" />
              <div className="min-w-0 flex-1">
                {isEditing ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      autoFocus
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSalvarNome()}
                      className="h-11 w-full min-w-0 rounded-[10px] border border-orange bg-white px-3 text-base text-ink outline-none shadow-[0_0_0_4px_var(--brand-orange-tint)]"
                      aria-label="Novo nome"
                      maxLength={120}
                    />
                    <button onClick={handleSalvarNome} aria-label="Salvar nome" className="focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-strong text-white active:scale-90">
                      <Check className="h-4 w-4" strokeWidth={3} />
                    </button>
                    <button
                      onClick={() => {
                        setEditedName(user.nome)
                        setIsEditing(false)
                      }}
                      aria-label="Cancelar"
                      className="focus-ring flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-surface text-ink-soft active:scale-90"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setIsEditing(true)} className="focus-ring group -m-1 flex max-w-full items-start gap-2 rounded-lg p-1 text-left" aria-label="Editar nome">
                    <h1 className="line-clamp-2 font-display text-[22px] font-extrabold leading-tight tracking-[-0.025em] text-ink">{user.nome}</h1>
                    <Pencil className="mt-1.5 h-4 w-4 shrink-0 text-subtle transition-colors group-hover:text-orange-ink" />
                  </button>
                )}
                <p className="mt-0.5 truncate text-[14px] text-muted-foreground">{user.email}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-orange-tint px-2.5 py-1 text-[12px] font-bold text-orange-ink">Nível {stats.nivel}</span>
                  <span className="rounded-full bg-purple-tint px-2.5 py-1 text-[12px] font-bold text-purple">{posicao}</span>
                </div>
              </div>
            </div>

            {/* progresso de nível no próprio crachá */}
            <div className="border-t border-line bg-surface px-5 py-4">
              <XpPill pontos={stats.totalPoints} />
            </div>
          </div>
        </Tilt>
      </motion.div>

      {/* números da conta numa linha só */}
      <motion.dl
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.15 }}
        className="grid grid-cols-3 divide-x divide-line rounded-[14px] border border-line bg-white py-4"
      >
        <div className="flex flex-col items-center gap-0.5">
          <dd className="tabular font-display text-[24px] font-bold leading-none text-ink">
            <CountUp value={stats.totalPoints} />
          </dd>
          <dt className="text-[13px] text-muted-foreground">pontos</dt>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <dd className="tabular font-display text-[24px] font-bold leading-none text-ink">{stats.qrCodesFound}</dd>
          <dt className="text-[13px] text-muted-foreground">{stats.qrCodesFound === 1 ? "QR lido" : "QRs lidos"}</dt>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <dd className="tabular font-display text-[24px] font-bold leading-none text-ink">
            {stats.ranking && stats.ranking !== "-" ? `${stats.ranking}º` : "–"}
          </dd>
          <dt className="text-[13px] text-muted-foreground">no ranking</dt>
        </div>
      </motion.dl>

      <motion.button
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE_OUT, delay: 0.22 }}
        whileTap={{ scale: 0.97 }}
        onClick={handleAbrirMeuQrCode}
        className="focus-ring flex w-full items-center gap-4 rounded-[14px] border border-line bg-white p-4 text-left hover:bg-surface"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-purple-tint text-purple">
          <QrCode className="h-6 w-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[16px] font-bold text-ink">Meu QR de networking</span>
          <span className="block text-[14px] leading-snug text-muted-foreground">Quando alguém escaneia, vocês dois ganham pontos.</span>
        </span>
      </motion.button>

      {/* Sheet: meu QR pessoal */}
      <Sheet
        open={isQrOpen}
        onOpenChange={setIsQrOpen}
        title="Meu QR de networking"
        description="Peça para a pessoa abrir o scanner no modo “QR de amigo”. Vale uma vez por dupla."
      >
        <div className="mx-auto my-3 aspect-square w-full max-w-[280px] rounded-[18px] border border-line bg-white p-5 shadow-soft">
          {isLoadingQr && <LogoLoader className="h-full w-full p-12" label="Gerando seu QR" />}
          {!isLoadingQr && meuQrUrl && (
            <motion.img
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={spring}
              src={meuQrUrl}
              alt="Meu QR Code pessoal"
              className="h-full w-full object-contain"
            />
          )}
        </div>
        <p className="mb-3 text-center text-[14px] text-muted-foreground">Aumente o brilho da tela para ler mais rápido.</p>
      </Sheet>
    </div>
  )
}
