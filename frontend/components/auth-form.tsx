"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { AnimatePresence, motion, useScroll, useTransform } from "motion/react"
import { AlertCircle, ArrowLeft, ArrowRight, ChevronDown, Eye, EyeOff, MailCheck, ShieldCheck } from "lucide-react"
import { authPost, mensagemDeErro, salvarSessao, type Sessao } from "@/lib/api"
import { cn } from "@/lib/utils"
import { gsap, useGSAP, prefersReducedMotion, haptic } from "@/lib/gsap"
import { EVENT, VINCULOS } from "@/lib/event"
import { SoeaLockup, SoeaMark } from "@/components/soea/mark"
import { HeroLogo } from "@/components/soea/hero-logo"
import { TextForm } from "@/components/soea/text-form"
import { notify } from "@/lib/notify"
import { EASE_OUT, spring } from "@/lib/motion"
import { Turnstile, turnstileAtivo } from "@/components/soea/turnstile"
import { PrimaryButton } from "@/components/itw/ui"
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp"

interface AuthFormProps {
  onSuccess?: (userData: any) => void
  /** o logo 3D cresce na entrada (falso quando a abertura do app acabou de mostrar isso) */
  logoIntro?: boolean
}

/*
 * Fluxos (todos com código por e-mail antes de liberar a conta):
 *   cadastro → codigo-cadastro → conta criada já verificada
 *   login → (admin ou conta antiga) codigo-login → sessão
 *   esqueci → codigo-senha → senha nova + sessão
 */
type Etapa = "login" | "cadastro" | "codigo-cadastro" | "codigo-login" | "esqueci" | "codigo-senha"

type Desafio = { token: string; motivo: "verificar_email" | "admin_2fa"; email: string }

const ETAPAS_DE_CODIGO: Etapa[] = ["codigo-cadastro", "codigo-login", "codigo-senha"]

export function AuthForm({ onSuccess, logoIntro = true }: AuthFormProps) {
  const router = useRouter()
  const [etapa, setEtapa] = useState<Etapa>("login")
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [desafio, setDesafio] = useState<Desafio | null>(null)
  const [reenviarEm, setReenviarEm] = useState(0)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const otpRef = useRef<HTMLInputElement>(null)
  // Scroll: o X gigante do fundo desliza mais devagar que a página; o 3D gira de leve
  const { scrollY } = useScroll()
  const xParalaxe = useTransform(scrollY, [0, 400], [0, 90])
  const logoGiro = useTransform(scrollY, [0, 400], [0, -12])

  const [formData, setFormData] = useState({
    name: "",
    email: "",
    senha: "",
    vinculo: "",
    telefone: "",
    codigo: "",
  })
  const set = (campo: keyof typeof formData, valor: string) => setFormData((f) => ({ ...f, [campo]: valor }))

  // contagem regressiva do "reenviar código"
  useEffect(() => {
    if (reenviarEm <= 0) return
    const t = setTimeout(() => setReenviarEm((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [reenviarEm])

  // Entrada: o logo cresce (HeroLogo), "SOEA" se forma (TextForm) e o painel sobe por último.
  useGSAP(
    () => {
      if (prefersReducedMotion()) return
      gsap.from("[data-panel]", { y: 48, opacity: 0, duration: 1, ease: "expo.out", delay: logoIntro ? 0.9 : 0.25 })
    },
    { scope: rootRef },
  )

  // Troca de etapa: campos entram em sequência
  useGSAP(
    () => {
      if (prefersReducedMotion()) return
      gsap.from("[data-field]", { y: 14, opacity: 0, duration: 0.5, stagger: 0.05, ease: "power3.out", clearProps: "all" })
    },
    { scope: formRef, dependencies: [etapa] },
  )

  const irPara = (nova: Etapa) => {
    setEtapa(nova)
    setError(null)
    setShowPassword(false)
    if (ETAPAS_DE_CODIGO.includes(nova)) set("codigo", "")
  }

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, "")
    if (value.length <= 11) {
      value = value.replace(/^(\d{2})(\d)/g, "($1) $2")
      value = value.replace(/(\d{5})(\d)/, "$1-$2")
      set("telefone", value)
    }
  }

  const entrar = (data: Sessao, novaConta = false) => {
    haptic([8, 30, 12])
    salvarSessao(data.user, data.token)
    const nome = (data.user.nome || "").split(" ")[0]
    if (novaConta) notify.reward("Conta criada!", `Bem-vindo ao SOEA, ${nome}. Bora caçar QR Codes.`)
    else notify.success(`Bem-vindo de volta, ${nome}!`)
    if (data.user.is_admin) router.push("/admin")
    else onSuccess?.(data.user)
  }

  const email = formData.email.trim().toLowerCase()

  /** Chama a rota e devolve o JSON; erro vira exceção com a mensagem do servidor. */
  const chamar = async (path: string, body: unknown) => {
    const res = await authPost(path, body)
    const data = await res.json().catch(() => null)
    if (!res.ok) throw new Error(mensagemDeErro(data))
    return data
  }

  const enviarCodigo = useCallback(
    async (codigo: string) => {
      if (isLoading || codigo.length !== 6) return
      setIsLoading(true)
      setError(null)
      try {
        if (etapa === "codigo-cadastro") {
          entrar(await chamar("/registro/verificar", { email, codigo, senha: formData.senha }), true)
        } else if (etapa === "codigo-login" && desafio) {
          entrar(await chamar("/login/verificar", { desafio: desafio.token, codigo }))
        } else if (etapa === "codigo-senha") {
          if (formData.senha.length < 8) throw new Error("A nova senha precisa ter pelo menos 8 caracteres.")
          entrar(await chamar("/senha/confirmar", { email, codigo, nova_senha: formData.senha }))
        }
      } catch (err: any) {
        haptic([30, 40, 30])
        setError(err.message)
        set("codigo", "")
      } finally {
        setIsLoading(false)
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [etapa, email, formData.senha, desafio, isLoading],
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (ETAPAS_DE_CODIGO.includes(etapa)) return enviarCodigo(formData.codigo)

    setIsLoading(true)
    setError(null)
    try {
      if (etapa === "login") {
        const data = await chamar("/login", { email, senha: formData.senha })
        if (data.etapa === "ok") return entrar(data)
        setDesafio({ token: data.desafio, motivo: data.motivo, email: data.email })
        setReenviarEm(data.reenviar_em ?? 60)
        notify.info("Falta um passo", `Enviamos um código para ${data.email}.`)
        irPara("codigo-login")
      } else if (etapa === "cadastro") {
        if (turnstileAtivo && !turnstileToken) throw new Error("Confirme que você não é um robô.")
        const data = await chamar("/registro/iniciar", {
          nome: formData.name,
          email,
          senha: formData.senha,
          vinculo: formData.vinculo,
          telefone: formData.telefone.replace(/\D/g, ""),
          ...(turnstileToken ? { turnstile_token: turnstileToken } : {}),
        })
        setReenviarEm(data.reenviar_em ?? 60)
        notify.info("Código enviado", `Confira a caixa de entrada de ${email}.`)
        irPara("codigo-cadastro")
      } else if (etapa === "esqueci") {
        if (turnstileAtivo && !turnstileToken) throw new Error("Confirme que você não é um robô.")
        const data = await chamar("/senha/solicitar", {
          email,
          ...(turnstileToken ? { turnstile_token: turnstileToken } : {}),
        })
        setReenviarEm(data.reenviar_em ?? 60)
        set("senha", "")
        irPara("codigo-senha")
      }
    } catch (err: any) {
      haptic([30, 40, 30])
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  const reenviar = async () => {
    if (reenviarEm > 0 || isLoading) return
    setError(null)
    try {
      if (etapa === "codigo-cadastro") await chamar("/registro/reenviar", { email })
      else if (etapa === "codigo-login" && desafio) await chamar("/login/reenviar", { desafio: desafio.token })
      else if (etapa === "codigo-senha") await chamar("/senha/solicitar", { email })
      notify.info("Código reenviado", "Confira sua caixa de entrada e o spam.")
      setReenviarEm(60)
      set("codigo", "")
    } catch (err: any) {
      setError(err.message)
    }
  }

  const emCodigo = ETAPAS_DE_CODIGO.includes(etapa)

  // Depois de um código errado o campo é reabilitado: devolve o foco para digitar de novo.
  useEffect(() => {
    if (emCodigo && !isLoading && error) otpRef.current?.focus()
  }, [emCodigo, isLoading, error])
  const emailVisivel = etapa === "codigo-login" ? desafio?.email : email

  const cabecalhoCodigo: Record<string, { titulo: string; texto: string }> = {
    "codigo-cadastro": {
      titulo: "Confira seu e-mail",
      texto: `Enviamos um código de 6 dígitos para ${emailVisivel}. Ele vale por 10 minutos. A conta só é criada depois dele.`,
    },
    "codigo-login":
      desafio?.motivo === "admin_2fa"
        ? {
            titulo: "Acesso de administrador",
            texto: `Por segurança, o painel pede um código enviado para ${emailVisivel}.`,
          }
        : {
            titulo: "Confirme seu e-mail",
            texto: `Sua conta é anterior à confirmação por e-mail. Enviamos um código para ${emailVisivel}.`,
          },
    "codigo-senha": {
      titulo: "Crie uma senha nova",
      texto: `Se ${emailVisivel} tiver conta, o código já está a caminho. Digite-o junto com a senha nova.`,
    },
    esqueci: {
      titulo: "Recuperar acesso",
      texto: "Informe o e-mail da sua conta. Vale também para contas antigas que ainda não têm senha.",
    },
  }

  const submitLabel: Record<Etapa, string> = {
    login: "Entrar",
    cadastro: "Criar conta",
    esqueci: "Enviar código",
    "codigo-cadastro": "Confirmar e entrar",
    "codigo-login": "Confirmar e entrar",
    "codigo-senha": "Salvar senha e entrar",
  }

  const voltar = () => {
    if (etapa === "codigo-cadastro") irPara("cadastro")
    else irPara("login")
  }

  return (
    <div ref={rootRef} className="relative min-h-dvh overflow-x-clip bg-white">
      <div className="relative mx-auto flex min-h-dvh w-full max-w-md flex-col">
        {/* ── topo: bloco azul-marinho da marca com o X em 3D ── */}
        <AnimatePresence mode="wait" initial={false}>
          {!emCodigo ? (
            <motion.section
              key="hero"
              exit={{ opacity: 0, y: -16 }}
              transition={{ duration: 0.3, ease: EASE_OUT }}
              className="relative overflow-hidden bg-navy px-6 pb-14 pt-[max(20px,env(safe-area-inset-top))] text-white"
            >
              {/* o X oficial em escala de cartaz, cortado na borda (como no site Confea-X) */}
              <motion.div aria-hidden style={{ y: xParalaxe }} className="pointer-events-none absolute -right-[38%] -top-[18%] w-[95%] opacity-[0.16]">
                <SoeaMark className="h-auto w-full" />
              </motion.div>

              <div className="relative flex items-center justify-between">
                <SoeaLockup tone="light" className="text-[20px]" />
                <span className="rounded-full border border-white/25 px-3 py-1 text-[12px] font-semibold text-navy-soft">Caça QR</span>
              </div>

              <div className="relative mt-6 grid grid-cols-[1fr_auto] items-end gap-2">
                <div className="min-w-0 pb-1">
                  <p className="flex items-center gap-2 text-[13px] font-semibold text-navy-soft">
                    <span className="h-2 w-2 rounded-full bg-orange" /> {EVENT.name} · Confea-X
                  </p>
                  <TextForm
                    as="h1"
                    mode="words"
                    text="Escaneie, responda e suba no ranking."
                    delay={logoIntro ? 0.9 : 0.1}
                    className="mt-2 font-display text-[clamp(26px,7.4vw,34px)] font-extrabold leading-[1.12] tracking-[-0.03em] text-white"
                  />
                </div>
                <motion.div style={{ rotate: logoGiro }} className="relative -mr-4 h-[min(36vw,150px)] w-[min(36vw,150px)]">
                  <HeroLogo className="absolute inset-0" intro={logoIntro} />
                </motion.div>
              </div>
            </motion.section>
          ) : (
            <motion.section
              key="compacto"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.3, ease: EASE_OUT }}
              className="flex items-center gap-3 px-5 pb-2 pt-[max(20px,env(safe-area-inset-top))]"
            >
              <button
                type="button"
                onClick={voltar}
                className="focus-ring pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line text-ink-soft"
                aria-label="Voltar"
              >
                <ArrowLeft className="h-[18px] w-[18px]" />
              </button>
              <SoeaLockup className="text-[20px]" animate />
            </motion.section>
          )}
        </AnimatePresence>

        {/* ── painel ── */}
        <section
          data-panel
          className={cn(
            "relative z-10 flex-1 bg-white px-5 pb-[max(2rem,env(safe-area-inset-bottom))]",
            emCodigo ? "pt-4" : "-mt-7 rounded-t-[24px] pt-5",
          )}
        >
          {etapa === "login" || etapa === "cadastro" ? (
            <ModeSwitch etapa={etapa} onChange={irPara} />
          ) : (
            <div className="flex items-start gap-3">
              {etapa === "esqueci" && (
                <button
                  type="button"
                  onClick={voltar}
                  className="focus-ring pressable flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line text-ink-soft"
                  aria-label="Voltar"
                >
                  <ArrowLeft className="h-[18px] w-[18px]" />
                </button>
              )}
              <div className="min-w-0 pt-0.5">
                <p className="kicker">{emCodigo ? "Verificação em duas etapas" : "Conta"}</p>
                <h2 className="mt-0.5 font-display text-[24px] font-extrabold leading-tight text-ink">{cabecalhoCodigo[etapa]?.titulo}</h2>
                <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">{cabecalhoCodigo[etapa]?.texto}</p>
              </div>
            </div>
          )}

          <form ref={formRef} onSubmit={handleSubmit} className="mt-6 space-y-4" noValidate={emCodigo}>
            {error && (
              <div data-field role="alert" className="flex gap-2.5 rounded-[10px] border border-danger/25 bg-danger-tint px-4 py-3 text-[14px] leading-relaxed text-danger">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* ── código de 6 dígitos ── */}
            {emCodigo && (
              <div data-field className="space-y-2">
                <label htmlFor="codigo" className="text-[14px] font-semibold text-ink-soft">
                  Código do e-mail
                </label>
                <InputOTP
                  ref={otpRef}
                  id="codigo"
                  maxLength={6}
                  inputMode="numeric"
                  pattern="^[0-9]*$"
                  autoComplete="one-time-code"
                  autoFocus
                  value={formData.codigo}
                  onChange={(v) => set("codigo", v.replace(/\D/g, ""))}
                  onComplete={(v: string) => etapa !== "codigo-senha" && enviarCodigo(v)}
                  disabled={isLoading}
                  containerClassName="w-full"
                >
                  <InputOTPGroup className="grid w-full grid-cols-6 gap-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <InputOTPSlot
                        key={i}
                        index={i}
                        className="h-14 w-full rounded-[10px] border border-line-strong bg-white font-mono text-[24px] font-semibold text-ink shadow-none first:rounded-[10px] first:border last:rounded-[10px] data-[active=true]:border-orange data-[active=true]:ring-4 data-[active=true]:ring-orange-tint"
                      />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
                <div className="flex items-center justify-between pt-1 text-[13px]">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <MailCheck className="h-4 w-4" /> Confira também o spam
                  </span>
                  <button
                    type="button"
                    onClick={reenviar}
                    disabled={reenviarEm > 0}
                    className="focus-ring min-h-11 rounded-[10px] px-2 font-bold text-orange-ink disabled:font-semibold disabled:text-subtle"
                  >
                    {reenviarEm > 0 ? `Reenviar em ${reenviarEm}s` : "Reenviar código"}
                  </button>
                </div>
              </div>
            )}

            {etapa === "cadastro" && (
              <Field label="Nome completo" htmlFor="name">
                <input
                  id="name"
                  autoComplete="name"
                  placeholder="Como aparece no seu crachá"
                  value={formData.name}
                  onChange={(e) => set("name", e.target.value)}
                  className={inputCls}
                  required
                  minLength={6}
                  maxLength={120}
                />
              </Field>
            )}

            {(etapa === "login" || etapa === "cadastro" || etapa === "esqueci") && (
              <Field label="E-mail" htmlFor="email">
                <input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="voce@email.com"
                  value={formData.email}
                  onChange={(e) => set("email", e.target.value)}
                  className={inputCls}
                  required
                  maxLength={254}
                />
              </Field>
            )}

            {(etapa === "login" || etapa === "cadastro" || etapa === "codigo-senha") && (
              <Field label={etapa === "codigo-senha" ? "Senha nova" : "Senha"} hint={etapa === "login" ? undefined : "mínimo 8 caracteres"} htmlFor="senha">
                <input
                  id="senha"
                  type={showPassword ? "text" : "password"}
                  autoComplete={etapa === "login" ? "current-password" : "new-password"}
                  placeholder={etapa === "login" ? "Sua senha" : "Crie uma senha"}
                  value={formData.senha}
                  onChange={(e) => set("senha", e.target.value)}
                  className={cn(inputCls, "pr-12")}
                  minLength={etapa === "login" ? undefined : 8}
                  maxLength={128}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="focus-ring absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-[8px] text-subtle active:text-orange-ink"
                  aria-label={showPassword ? "Esconder senha" : "Mostrar senha"}
                >
                  {showPassword ? <EyeOff className="h-[18px] w-[18px]" /> : <Eye className="h-[18px] w-[18px]" />}
                </button>
              </Field>
            )}

            {etapa === "cadastro" && (
              <>
                <Field label="Seu vínculo com o SOEA" htmlFor="vinculo">
                  <select
                    id="vinculo"
                    value={formData.vinculo}
                    onChange={(e) => set("vinculo", e.target.value)}
                    className={cn(inputCls, "appearance-none pr-11", !formData.vinculo && "text-subtle")}
                    required
                  >
                    <option value="" disabled>
                      Selecione uma opção
                    </option>
                    {VINCULOS.map((v) => (
                      <option key={v.valor} value={v.valor}>
                        {v.rotulo}
                      </option>
                    ))}
                  </select>
                  <ChevronDown aria-hidden className="pointer-events-none absolute right-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-subtle" />
                </Field>
                <Field label="Telefone" hint="opcional" htmlFor="telefone">
                  <input
                    id="telefone"
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel-national"
                    placeholder="(98) 9 0000-0000"
                    value={formData.telefone}
                    onChange={handlePhoneChange}
                    className={inputCls}
                  />
                </Field>
              </>
            )}

            {(etapa === "cadastro" || etapa === "esqueci") && turnstileAtivo && (
              <div data-field>
                <Turnstile onToken={setTurnstileToken} />
              </div>
            )}

            <div data-field className="pt-2">
              <PrimaryButton type="submit" loading={isLoading}>
                {submitLabel[etapa]}
                {!isLoading && <ArrowRight className="h-[18px] w-[18px]" />}
              </PrimaryButton>
            </div>

            {etapa === "cadastro" && (
              <p data-field className="flex items-start justify-center gap-2 text-center text-[13px] leading-relaxed text-muted-foreground">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                Antes de criar a conta, mandamos um código para confirmar que o e-mail é seu.
              </p>
            )}

            {etapa === "login" && (
              <div data-field className="text-center">
                <button
                  type="button"
                  onClick={() => irPara("esqueci")}
                  className="focus-ring min-h-11 rounded-[10px] px-3 text-[14px] font-semibold text-purple underline-offset-4 hover:underline"
                >
                  Esqueci minha senha
                </button>
              </div>
            )}
          </form>
        </section>
      </div>
    </div>
  )
}

/* ───────────────────────── peças do formulário ───────────────────────── */

const inputCls =
  "h-[52px] w-full rounded-[10px] border border-line-strong bg-white px-4 text-base text-ink placeholder:text-subtle outline-none transition-[border-color,box-shadow] focus:border-orange focus:shadow-[0_0_0_4px_var(--brand-orange-tint)] [color-scheme:light]"

function Field({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor: string; children: React.ReactNode }) {
  return (
    <div data-field className="space-y-1.5">
      <label htmlFor={htmlFor} className="flex items-baseline justify-between text-[14px] font-semibold text-ink-soft">
        {label}
        {hint && <span className="text-[13px] font-normal text-subtle">{hint}</span>}
      </label>
      <div className="relative">{children}</div>
    </div>
  )
}

function ModeSwitch({ etapa, onChange }: { etapa: Etapa; onChange: (m: Etapa) => void }) {
  return (
    <div className="grid grid-cols-2 rounded-[12px] bg-surface p-1" role="tablist" aria-label="Acesso">
      {(["login", "cadastro"] as const).map((m) => (
        <button
          key={m}
          type="button"
          role="tab"
          aria-selected={etapa === m}
          onClick={() => onChange(m)}
          className={cn("focus-ring relative h-11 rounded-[10px] text-[15px] font-bold transition-colors", etapa === m ? "text-ink" : "text-muted-foreground")}
        >
          {etapa === m && <motion.span layoutId="auth-modo" transition={spring} className="absolute inset-0 rounded-[10px] bg-white shadow-soft" />}
          <span className="relative">{m === "login" ? "Entrar" : "Criar conta"}</span>
        </button>
      ))}
    </div>
  )
}
