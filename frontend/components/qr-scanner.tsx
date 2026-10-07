"use client"

import { useState, useEffect, useRef } from "react"
import { AnimatePresence, motion } from "motion/react"
import { Html5Qrcode } from "html5-qrcode"
import { QrCode, X, Check, AlertTriangle, Timer, Users, TrendingUp, Camera } from "lucide-react"
import { apiFetch, getStoredUser } from "@/lib/api"
import { cn } from "@/lib/utils"
import { haptic } from "@/lib/gsap"
import { EASE_OUT, riseItem, spring, springBouncy, staggerList } from "@/lib/motion"
import { CountUp } from "@/components/itw/brand"
import { PrimaryButton } from "@/components/itw/ui"
import { Confetti } from "@/components/soea/kit"
import { TextForm } from "@/components/soea/text-form"
import { notify } from "@/lib/notify"

interface Pergunta {
  id_pergunta: string
  enunciado: string
  tipo: "multipla_escolha" | "verdadeiro_falso"
  alternativas: Record<string, string>
}

interface ScanResult {
  pontos_qr: number
  nivel_atual: number
  subiu_de_nivel: boolean
  pergunta: Pergunta | null
}

interface FriendScanResult {
  amigo: string
  pontos_ganho: number
  pontos_total: number
  nivel_anterior: number
  nivel_atual: number
  subiu_de_nivel: boolean
}

type ModoScan = "evento" | "amigo"

// --- Cache local de perguntas já respondidas (por usuário) ---
function getAnsweredQuestions(userId: string): string[] {
  try {
    const saved = localStorage.getItem(`answered_questions_${userId}`)
    return saved ? JSON.parse(saved) : []
  } catch { return [] }
}

function markQuestionAnswered(userId: string, questionId: string) {
  try {
    const current = getAnsweredQuestions(userId)
    if (!current.includes(questionId)) {
      localStorage.setItem(
        `answered_questions_${userId}`,
        JSON.stringify([...current, questionId])
      )
    }
  } catch {}
}

function isQuestionAlreadyAnswered(userId: string, questionId: string): boolean {
  return getAnsweredQuestions(userId).includes(questionId)
}

export function QRScanner() {
  const [modoScan, setModoScan] = useState<ModoScan>("evento")
  const [isScanning, setIsScanning] = useState(false)
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [friendResult, setFriendResult] = useState<FriendScanResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Question modal states
  const [pergunta, setPergunta] = useState<Pergunta | null>(null)
  const [respostaSelecionada, setRespostaSelecionada] = useState<string | null>(null)
  const [respondido, setRespondido] = useState(false)
  const [feedbackPergunta, setFeedbackPergunta] = useState<{ acertou: boolean; pontos_bonus: number; resposta_correta: string } | null>(null)
  const tempoInicioRef = useRef<number>(0)
  const [tempoDecorrido, setTempoDecorrido] = useState(0)

  // Guard contra callbacks duplicados do html5QrCode (o scanner pode disparar
  // onScanSuccess mais de uma vez antes do stop() assíncrono completar)
  const isProcessingRef = useRef(false)

  useEffect(() => {
    if (!pergunta || respondido) return
    tempoInicioRef.current = Date.now()
    setTempoDecorrido(0)
    const interval = setInterval(() => {
      setTempoDecorrido(Math.floor((Date.now() - tempoInicioRef.current) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [pergunta, respondido])

  useEffect(() => {
    let html5QrCode: Html5Qrcode | null = null
    let cancelado = false
    let espera = 0

    // A câmera só existe depois que a transição de entrada monta o #reader.
    const iniciar = () => {
      if (cancelado) return
      if (!document.getElementById("reader")) {
        if (++espera < 120) requestAnimationFrame(iniciar)
        return
      }
      html5QrCode = new Html5Qrcode("reader")
      const config = { fps: 10, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 }

      html5QrCode.start(
        { facingMode: "environment" },
        config,
        async (decodedText) => {
          // Ignora se já está processando um scan — evita chamadas duplicadas
          if (isProcessingRef.current) return
          isProcessingRef.current = true
          handleSuccessfulScan(decodedText, html5QrCode)
        },
        () => {}
      ).catch(() => setError("Câmera não encontrada ou permissão negada."))
    }

    if (isScanning && !scanResult && !friendResult && !error) iniciar()

    return () => {
      cancelado = true
      if (html5QrCode?.isScanning) {
        html5QrCode.stop().catch(() => {})
      }
    }
  }, [isScanning, scanResult, friendResult, error])

  const handleSuccessfulScan = async (decodedText: string, scanner: any) => {
    try {
      if (scanner) await scanner.stop()

      const codeHash = decodedText.startsWith("http")
        ? decodedText.split("/").pop() ?? decodedText
        : decodedText

      if (modoScan === "amigo") {
        await handleScanAmigo(codeHash)
        return
      }

      const user = getStoredUser()
      const userId = String(user?.id_user || user?.id || "")

      const formData = new URLSearchParams()
      formData.append("code_hash", codeHash)

      const response = await apiFetch(`/capturar`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      })

      const data = await response.json()

      // Sucesso normal OU a API indicou que a pergunta já foi respondida
      // (algumas APIs retornam status diferente nesse caso — tratamos ambos)
      const perguntaJaRespondidaPelaApi =
        !response.ok &&
        (data.status === "pergunta_ja_respondida" ||
          (data.msg && /pergunta.*(j[aá]).*respondid/i.test(data.msg)))

      if ((response.ok && data.status === "Sucesso") || perguntaJaRespondidaPelaApi) {
        const pontos = data.pontos_qr ?? 0

        // Verifica se a pergunta já foi respondida — seja via cache local
        // ou porque a API sinalizou isso explicitamente
        const perguntaRecebida: Pergunta | null = data.pergunta ?? null
        const perguntaJaRespondidaLocalmente =
          perguntaRecebida !== null &&
          isQuestionAlreadyAnswered(userId, perguntaRecebida.id_pergunta)

        const perguntaParaExibir =
          perguntaRecebida === null ||
          perguntaJaRespondidaPelaApi ||
          perguntaJaRespondidaLocalmente
            ? null
            : perguntaRecebida

        setScanResult({
          pontos_qr: pontos,
          nivel_atual: data.nivel_atual ?? 1,
          subiu_de_nivel: data.subiu_de_nivel ?? false,
          pergunta: perguntaParaExibir,
        })
        setIsScanning(false)
        haptic([18, 40, 18])
        if (data.subiu_de_nivel) notify.reward(`Nível ${data.nivel_atual}!`, "Você subiu de nível. Continue caçando.")

        if (perguntaParaExibir) {
          // Pergunta nova: exibe o modal após pequeno delay
          setTimeout(() => {
            setPergunta(perguntaParaExibir)
            setTempoDecorrido(0)
          }, 1800)
        } else {
          // Sem pergunta (captura simples ou pergunta já respondida): volta ao início após 3s
          setTimeout(() => {
            isProcessingRef.current = false
            setScanResult(null)
          }, 3000)
        }
      } else {
        throw new Error(data.detail || "Erro na validação.")
      }
    } catch (err: any) {
      setError(err.message)
      haptic([60, 40, 60])
      setTimeout(() => {
        isProcessingRef.current = false
        setError(null)
        setIsScanning(false)
      }, 5000)
    }
  }

  const handleScanAmigo = async (codeHash: string) => {
    try {
      const formData = new URLSearchParams()
      formData.append("code_hash", codeHash)

      const response = await apiFetch(`/amigos/escanear`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.detail || "Erro ao escanear amigo.")

      setFriendResult(data)
      if (data.subiu_de_nivel) notify.reward(`Nível ${data.nivel_atual}!`, "O networking te fez subir de nível.")
      haptic([18, 40, 18])
      setIsScanning(false)
      setTimeout(() => {
        isProcessingRef.current = false
        setFriendResult(null)
      }, 3500)
    } catch (err: any) {
      setError(err.message)
      haptic([60, 40, 60])
      setTimeout(() => {
        isProcessingRef.current = false
        setError(null)
        setIsScanning(false)
      }, 5000)
    }
  }

  const handleResponder = async () => {
    if (!respostaSelecionada || !pergunta || !scanResult) return
    const user = getStoredUser()
    const userId = String(user?.id_user || user?.id || "")
    const tempoSegundos = Math.floor((Date.now() - tempoInicioRef.current) / 1000)

    const fd = new URLSearchParams()
    fd.append("id_pergunta", pergunta.id_pergunta)
    fd.append("resposta", respostaSelecionada)
    fd.append("tempo_segundos", String(tempoSegundos))

    try {
      const res = await apiFetch(`/responder`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: fd.toString(),
      })
      const data = await res.json()

      // Persiste localmente que esta pergunta foi respondida
      markQuestionAnswered(userId, pergunta.id_pergunta)

      setRespondido(true)
      haptic(data.acertou ? [18, 40, 18] : 90)
      setFeedbackPergunta({ acertou: data.acertou, pontos_bonus: data.pontos_bonus, resposta_correta: data.resposta_correta })

      setTimeout(() => {
        isProcessingRef.current = false
        setPergunta(null)
        setScanResult(null)
        setRespostaSelecionada(null)
        setRespondido(false)
        setFeedbackPergunta(null)
      }, 4000)
    } catch (e) {
      console.error(e)
    }
  }

  const resetScanner = () => {
    isProcessingRef.current = false
    setScanResult(null)
    setFriendResult(null)
    setPergunta(null)
    setRespostaSelecionada(null)
    setRespondido(false)
    setFeedbackPergunta(null)
    setError(null)
    setIsScanning(false)
  }

  const cameraNegada = !!error && /c[aâ]mera|permiss/i.test(error)

  return (
    <div className="flex min-h-[calc(100dvh-var(--nav-h)-150px)] flex-col">
      <AnimatePresence mode="wait" initial={false}>
        {!isScanning && !scanResult && !friendResult && !error && (
          <motion.div key="idle" {...trocaDeEstado}>
            <IdleView modoScan={modoScan} setModoScan={setModoScan} onStart={() => setIsScanning(true)} />
          </motion.div>
        )}

        {isScanning && !scanResult && !friendResult && !error && (
          <motion.div key="camera" {...trocaDeEstado}>
            <CameraView modoScan={modoScan} onClose={() => setIsScanning(false)} />
          </motion.div>
        )}

        {scanResult && !pergunta && (
          <motion.div key="resultado" {...trocaDeEstado} className="flex flex-1">
            <ResultView
              icone={<Check className="h-12 w-12" strokeWidth={3} />}
              titulo="Capturado!"
              pontos={scanResult.pontos_qr}
              sufixo="pontos"
            >
              {scanResult.subiu_de_nivel && <Chip icon={<TrendingUp className="h-4 w-4" />}>Você subiu para o nível {scanResult.nivel_atual}</Chip>}
              <StatusLine>{scanResult.pergunta ? "Preparando a pergunta bônus" : "Atualizando o ranking"}</StatusLine>
            </ResultView>
          </motion.div>
        )}

        {friendResult && (
          <motion.div key="amigo" {...trocaDeEstado} className="flex flex-1">
            <ResultView
              icone={<Users className="h-11 w-11" strokeWidth={2.4} />}
              titulo="Conexão feita!"
              pontos={friendResult.pontos_ganho}
              sufixo="pontos para cada um"
            >
              <p className="text-center text-[15px] text-muted-foreground">
                Você e <span className="font-semibold text-ink">{friendResult.amigo}</span> fizeram networking.
              </p>
              {friendResult.subiu_de_nivel ? (
                <Chip icon={<TrendingUp className="h-4 w-4" />}>Você subiu para o nível {friendResult.nivel_atual}</Chip>
              ) : (
                <StatusLine>
                  Nível {friendResult.nivel_atual}, {friendResult.pontos_total.toLocaleString("pt-BR")} pts no total
                </StatusLine>
              )}
            </ResultView>
          </motion.div>
        )}

        {error && (
          <motion.div key="erro" {...trocaDeEstado} className="flex flex-1 items-center">
            <div className="w-full rounded-[18px] border border-line bg-white px-6 py-9 text-center shadow-soft">
              <motion.div
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0, x: [0, -8, 8, -5, 5, 0] }}
                transition={{ scale: springBouncy, rotate: springBouncy, x: { duration: 0.45, delay: 0.25 } }}
                className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-danger text-white"
              >
                <AlertTriangle className="h-8 w-8" />
              </motion.div>
              <h2 className="mt-5 font-display text-[24px] font-extrabold tracking-[-0.02em] text-ink">Não deu para capturar</h2>
              <p className="mx-auto mt-2 max-w-[30ch] text-[15px] leading-relaxed text-muted-foreground">{error}</p>
              {cameraNegada && (
                <p className="mx-auto mt-4 max-w-[32ch] rounded-[14px] bg-surface-2 px-4 py-3 text-left text-[13px] leading-relaxed text-muted-foreground">
                  Libere a câmera nas permissões do navegador (o cadeado ao lado do endereço) e tente de novo.
                </p>
              )}
              <div className="mt-7">
                <PrimaryButton tone="white" onClick={resetScanner}>
                  Tentar de novo
                </PrimaryButton>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {pergunta && !respondido && (
          <QuestionModal
            key="pergunta"
            pergunta={pergunta}
            tempoDecorrido={tempoDecorrido}
            respostaSelecionada={respostaSelecionada}
            onSelect={(k) => {
              haptic(8)
              setRespostaSelecionada(k)
            }}
            onConfirm={handleResponder}
          />
        )}

        {respondido && feedbackPergunta && (
          <motion.div
            key="feedback"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-navy-deep/60 backdrop-blur-[3px] p-5"
          >
            {feedbackPergunta.acertou && <Confetti />}
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              transition={springBouncy}
              className="flex w-full max-w-sm flex-col items-center gap-3 rounded-[18px] border border-line bg-white px-6 py-10 text-center shadow-soft"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ ...springBouncy, delay: 0.1 }}
                className={cn(
                  "flex h-20 w-20 items-center justify-center rounded-full text-white",
                  feedbackPergunta.acertou ? "bg-success" : "bg-danger",
                )}
              >
                {feedbackPergunta.acertou ? <Check className="h-10 w-10" strokeWidth={3} /> : <X className="h-10 w-10" strokeWidth={3} />}
              </motion.div>
              <h2 className="mt-2 font-display text-[32px] font-extrabold tracking-[-0.03em] text-ink">
                {feedbackPergunta.acertou ? "Acertou!" : "Não foi dessa vez"}
              </h2>
              {feedbackPergunta.acertou ? (
                <p className="font-display text-[22px] font-extrabold text-orange-ink">
                  <CountUp value={feedbackPergunta.pontos_bonus ?? 0} prefix="+" /> <span className="text-[15px] font-medium text-muted-foreground">pontos bônus</span>
                </p>
              ) : (
                <p className="text-[15px] text-muted-foreground">
                  A resposta certa era{" "}
                  <span className="inline-flex h-8 min-w-8 items-center justify-center rounded-full bg-ink px-2 font-display font-bold text-white">
                    {feedbackPergunta.resposta_correta}
                  </span>
                </p>
              )}
              <StatusLine>Voltando ao scanner</StatusLine>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <style jsx global>{`
        #reader { border: none !important; }
        #reader__status_span { display: none !important; }
        #reader__dashboard { display: none !important; }
        #reader video { width: 100% !important; height: 100% !important; object-fit: cover !important; }
        #qr-shaded-region { border-color: rgba(28, 32, 80, 0.55) !important; }
        #qr-shaded-region > div { display: none !important; }
      `}</style>
    </div>
  )
}

/* ───────────────────────────── subviews ───────────────────────────── */

const trocaDeEstado = {
  initial: { opacity: 0, y: 14, scale: 0.98 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -10, scale: 0.98 },
  transition: { duration: 0.28, ease: EASE_OUT },
}

/** Cantos do visor: arredondados como a marca, "respirando" enquanto espera. */
function Cantos({ cor, respira = true, tamanho = 30, espessura = 4 }: { cor: string; respira?: boolean; tamanho?: number; espessura?: number }) {
  const cantos = [
    { pos: "left-0 top-0", borda: "borderLeft borderTop", raio: "borderTopLeftRadius", dx: -1, dy: -1 },
    { pos: "right-0 top-0", borda: "borderRight borderTop", raio: "borderTopRightRadius", dx: 1, dy: -1 },
    { pos: "left-0 bottom-0", borda: "borderLeft borderBottom", raio: "borderBottomLeftRadius", dx: -1, dy: 1 },
    { pos: "right-0 bottom-0", borda: "borderRight borderBottom", raio: "borderBottomRightRadius", dx: 1, dy: 1 },
  ]
  return (
    <>
      {cantos.map((c) => {
        const estilo: React.CSSProperties = { width: tamanho, height: tamanho, [c.raio]: 18 }
        c.borda.split(" ").forEach((b) => ((estilo as any)[b] = `${espessura}px solid ${cor}`))
        return (
          <motion.span
            key={c.pos}
            aria-hidden
            className={cn("absolute", c.pos)}
            style={estilo}
            animate={respira ? { x: [0, c.dx * 5, 0], y: [0, c.dy * 5, 0] } : undefined}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          />
        )
      })}
    </>
  )
}

function IdleView({
  modoScan,
  setModoScan,
  onStart,
}: {
  modoScan: ModoScan
  setModoScan: (m: ModoScan) => void
  onStart: () => void
}) {
  const evento = modoScan === "evento"
  return (
    <div className="space-y-7">
      <div>
        <p className="kicker">{evento ? "Pontos de captura" : "Conexões"}</p>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={modoScan} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.18, ease: EASE_OUT }}>
            <TextForm
              as="h1"
              text={evento ? "Caçar QR" : "Networking"}
              className="block font-display text-[34px] font-extrabold leading-[1.05] tracking-[-0.035em] text-ink"
            />
          </motion.div>
        </AnimatePresence>
        <p className="mt-1.5 max-w-[34ch] text-[16px] leading-relaxed text-muted-foreground">
          {evento
            ? "Encontre os pontos de captura espalhados pelo SOEA. Cada código vale uma vez por pessoa."
            : "Escaneie o QR pessoal de alguém do evento. Vale uma vez por dupla e os dois pontuam."}
        </p>
      </div>

      {/* visor ilustrativo */}
      <div className="relative mx-auto aspect-square w-[64%] max-w-[250px]">
        <Cantos cor="var(--brand-orange)" tamanho={44} />
        <div className="absolute inset-[16%] flex items-center justify-center rounded-[18px] bg-surface shadow-[inset_0_0_0_1px_var(--line)]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={modoScan}
              initial={{ scale: 0.6, opacity: 0, rotate: -12 }}
              animate={{ scale: 1, opacity: 1, rotate: 0 }}
              exit={{ scale: 0.6, opacity: 0, rotate: 12 }}
              transition={springBouncy}
            >
              {evento ? <QrCode className="h-20 w-20 text-navy" strokeWidth={1.4} /> : <Users className="h-20 w-20 text-purple" strokeWidth={1.4} />}
            </motion.span>
          </AnimatePresence>
        </div>
        <motion.span
          aria-hidden
          className="absolute inset-x-[10%] h-[3px] rounded-full bg-orange"
          animate={{ top: ["14%", "84%", "14%"] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>

      {/* seletor de modo */}
      <div className="grid grid-cols-2 rounded-[12px] bg-surface p-1" role="tablist" aria-label="Tipo de QR">
        {(["evento", "amigo"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={modoScan === m}
            onClick={() => {
              haptic(8)
              setModoScan(m)
            }}
            className={cn(
              "focus-ring relative flex h-11 items-center justify-center gap-2 rounded-[10px] text-[15px] font-bold transition-colors duration-200",
              modoScan === m ? "text-ink" : "text-muted-foreground",
            )}
          >
            {modoScan === m && <motion.span layoutId="modo-scan" transition={spring} className="absolute inset-0 rounded-[10px] bg-white shadow-soft" />}
            <span className="relative flex items-center gap-2">
              {m === "evento" ? <QrCode className="h-4 w-4" /> : <Users className="h-4 w-4" />}
              {m === "evento" ? "QR do evento" : "QR de amigo"}
            </span>
          </button>
        ))}
      </div>

      <PrimaryButton onClick={onStart}>
        <Camera className="h-5 w-5" /> Abrir câmera
      </PrimaryButton>
    </div>
  )
}

function CameraView({ modoScan, onClose }: { modoScan: ModoScan; onClose: () => void }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-[14px] font-medium text-ink">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inset-0 animate-ping rounded-full bg-danger/70" />
            <span className="relative h-2.5 w-2.5 rounded-full bg-danger" />
          </span>
          Câmera ligada, {modoScan === "evento" ? "QR do evento" : "QR de amigo"}
        </p>
        <button
          onClick={onClose}
          aria-label="Fechar câmera"
          className="focus-ring flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 text-ink active:scale-90"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      <motion.div
        initial={{ scale: 0.94, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, ease: EASE_OUT }}
        className="relative aspect-square w-full"
      >
        <div id="reader" className="h-full w-full overflow-hidden rounded-[18px] bg-black" />
        <div className="pointer-events-none absolute inset-3 z-10">
          <Cantos cor="var(--brand-orange)" tamanho={52} espessura={5} />
          <motion.span
            className="absolute inset-x-4 h-[3px] rounded-full bg-orange"
            animate={{ top: ["10%", "88%", "10%"] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
          />
        </div>
      </motion.div>

      <p className="text-center text-[14px] text-muted-foreground">Centralize o QR Code dentro dos cantos.</p>
    </div>
  )
}

/* O momento do scanner: selo entra com mola, onda se espalha uma vez, confete, número conta. */
function ResultView({
  icone,
  titulo,
  pontos,
  sufixo,
  children,
}: {
  icone: React.ReactNode
  titulo: string
  pontos: number
  sufixo: string
  children?: React.ReactNode
}) {
  return (
    <div className="flex w-full flex-1 items-center">
      <Confetti />
      <div className="flex w-full flex-col items-center gap-4 rounded-[18px] border border-line bg-white px-6 py-10 text-center shadow-soft">
        <div className="relative flex h-24 w-24 items-center justify-center">
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-full border-4 border-orange"
            initial={{ scale: 0.6, opacity: 0.9 }}
            animate={{ scale: 2.1, opacity: 0 }}
            transition={{ duration: 0.9, ease: EASE_OUT, delay: 0.15 }}
          />
          <motion.div
            initial={{ scale: 0, rotate: -90 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={springBouncy}
            className="relative flex h-24 w-24 items-center justify-center rounded-full bg-orange-strong text-white"
          >
            {icone}
          </motion.div>
        </div>
        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE_OUT, delay: 0.2 }}
          className="font-display text-[28px] font-extrabold tracking-[-0.03em] text-ink"
        >
          {titulo}
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ ...springBouncy, delay: 0.3 }}
          className="font-display text-[64px] font-extrabold leading-none tracking-[-0.04em] text-orange-ink"
        >
          <CountUp value={pontos ?? 0} prefix="+" duration={1.2} />
        </motion.p>
        <p className="-mt-2 text-[14px] text-muted-foreground">{sufixo}</p>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="flex w-full flex-col items-center gap-3"
        >
          {children}
        </motion.div>
      </div>
    </div>
  )
}

function Chip({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={springBouncy}
      className="flex items-center gap-2 rounded-full bg-orange-strong px-4 py-2 text-[14px] font-semibold text-white"
    >
      {icon}
      {children}
    </motion.div>
  )
}

function StatusLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2.5 text-[13px] text-muted-foreground">
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-1.5 w-1.5 rounded-full bg-orange"
            animate={{ opacity: [0.25, 1, 0.25] }}
            transition={{ duration: 1, repeat: Infinity, delay: i * 0.18 }}
          />
        ))}
      </span>
      {children}
    </p>
  )
}

const LIMITE_RAPIDO = 10

function QuestionModal({
  pergunta,
  tempoDecorrido,
  respostaSelecionada,
  onSelect,
  onConfirm,
}: {
  pergunta: Pergunta
  tempoDecorrido: number
  respostaSelecionada: string | null
  onSelect: (k: string) => void
  onConfirm: () => void
}) {
  const rapido = tempoDecorrido <= LIMITE_RAPIDO
  const [enviando, setEnviando] = useState(false)

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      data-lenis-prevent
      className="fixed inset-0 z-[60] flex flex-col bg-white"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pergunta-titulo"
    >
      <motion.div
        initial={{ y: 40 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.45, ease: EASE_OUT }}
        className="mx-auto flex w-full max-w-md flex-1 flex-col overflow-y-auto px-5 pb-[max(20px,env(safe-area-inset-bottom))] pt-[max(20px,env(safe-area-inset-top))]"
      >
        <div className="flex items-center justify-between">
          <p className="font-display text-[17px] font-extrabold text-ink">Pergunta bônus</p>
          <span
            className={cn(
              "tabular flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[14px] font-semibold transition-colors",
              rapido ? "bg-orange-strong text-white" : "bg-surface-2 text-muted-foreground",
            )}
          >
            <Timer className="h-4 w-4" />
            {tempoDecorrido}s
          </span>
        </div>

        {/* tempo da resposta rápida: a pílula esvazia em 10 s */}
        <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
          <motion.div
            className={cn("h-full rounded-full", rapido ? "bg-orange" : "bg-danger")}
            initial={{ width: "100%" }}
            animate={{ width: "0%" }}
            transition={{ duration: LIMITE_RAPIDO, ease: "linear" }}
          />
        </div>
        <p className={cn("mt-2 text-[13px]", rapido ? "text-orange-ink" : "text-muted-foreground")}>
          {rapido ? "Responda em até 10 s para ganhar o bônus máximo." : "Ainda vale bônus, só que menor."}
        </p>

        <h2 id="pergunta-titulo" className="mt-7 text-[22px] font-bold leading-snug tracking-[-0.015em] text-ink">
          {pergunta.enunciado}
        </h2>

        <motion.div
          variants={staggerList}
          initial="hidden"
          animate="show"
          className={cn("mt-6 grid gap-2.5", pergunta.tipo === "multipla_escolha" ? "grid-cols-1" : "grid-cols-2")}
        >
          {Object.entries(pergunta.alternativas).map(([key, val]) => {
            const sel = respostaSelecionada === key
            return (
              <motion.button
                key={key}
                variants={riseItem}
                whileTap={{ scale: 0.97 }}
                onClick={() => onSelect(key)}
                aria-pressed={sel}
                className={cn(
                  "focus-ring relative flex min-h-16 items-center gap-3 rounded-[14px] p-3 text-left text-[16px] font-medium transition-colors duration-200",
                  sel ? "text-ink" : "bg-surface text-ink-soft",
                )}
              >
                {sel && <motion.span layoutId="resposta" transition={spring} className="absolute inset-0 rounded-[14px] bg-orange-tint ring-2 ring-orange" />}
                <span
                  className={cn(
                    "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-display text-[15px] font-extrabold transition-colors",
                    sel ? "bg-orange-strong text-white" : "bg-surface-2 text-muted-foreground",
                  )}
                >
                  {key}
                </span>
                <span className="relative">{val}</span>
              </motion.button>
            )
          })}
        </motion.div>

        <div className="mt-auto pt-8">
          <PrimaryButton
            loading={enviando}
            onClick={async () => {
              setEnviando(true)
              try {
                await onConfirm()
              } finally {
                setEnviando(false)
              }
            }}
            disabled={!respostaSelecionada}
          >
            Confirmar resposta
          </PrimaryButton>
        </div>
      </motion.div>
    </motion.div>
  )
}
