"use client"

import {
  QrCode, Plus, Trash2, Download, LogOut, FileDown, FileText,
  HelpCircle, Edit2, Search, X
} from "lucide-react"
import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { HexagonLogo } from "@/components/hexagon-logo"
import { useRouter } from "next/navigation"
import { apiFetch, getStoredUser, sair, baixarArquivoAutenticado, API_BASE } from "@/lib/api"
import { EVENT } from "@/lib/event"

interface QRCode {
  code_hash: string
  local: string
  pontos: number
  ativo: boolean
  id_pergunta?: string | null
}

interface Pergunta {
  id_pergunta: string
  enunciado: string
  tipo: "multipla_escolha" | "verdadeiro_falso"
  alternativas: Record<string, string>
  resposta_correta: string
  pontos_rapido: number
  pontos_lento: number
}

const API_URL = API_BASE
type Tab = "qrcodes" | "perguntas"

const PERGUNTA_FORM_DEFAULT = {
  enunciado: "",
  tipo: "multipla_escolha" as "multipla_escolha" | "verdadeiro_falso",
  resposta_correta: "A",
  pontos_rapido: 50,
  pontos_lento: 20,
  alternativa_a: "",
  alternativa_b: "",
  alternativa_c: "",
  alternativa_d: "",
}

function VinculoSelect({
    qr, tipo, opcoes, onSalvar
  }: {
    qr: QRCode
    tipo: "id_pergunta"
    opcoes: { value: string; label: string }[]
    onSalvar: (field: "id_pergunta", value: string) => void
  }) {
    const valorAtual = qr[tipo] || ""
    const [valor, setValor] = useState(valorAtual)
    const mudou = valor !== valorAtual
    useEffect(() => { setValor(qr[tipo] || "") }, [qr, tipo])

    return (
      <div className="flex items-center gap-1">
        <select
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          className="text-xs bg-muted/50 border border-border rounded px-2 py-1 text-foreground max-w-[140px]"
        >
          <option value="">Sem pergunta</option>
          {opcoes.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {mudou && (
          <button
            onClick={() => onSalvar(tipo, valor)}
            className="text-[10px] px-2 py-1 rounded bg-primary text-white font-bold hover:bg-primary/80 transition-all"
          >
            ✓
          </button>
        )}
      </div>
    )
  }

const PerguntaFormFields = ({
    form,
    setForm,
  }: {
    form: typeof PERGUNTA_FORM_DEFAULT
    setForm: (f: typeof PERGUNTA_FORM_DEFAULT) => void
  }) => (
    <>
      <div className="space-y-2">
        <Label>Tipo</Label>
        <div className="flex gap-2">
          {(["multipla_escolha", "verdadeiro_falso"] as const).map(t => (
            <button key={t}
              onClick={() => setForm({ ...form, tipo: t, resposta_correta: t === "multipla_escolha" ? "A" : "V" })}
              className={`flex-1 py-2 rounded-lg border text-xs font-semibold transition-all ${form.tipo === t ? "bg-primary text-white border-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}>
              {t === "multipla_escolha" ? "A/B/C/D" : "Verdadeiro/Falso"}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Enunciado</Label>
        <Input placeholder="Digite a pergunta..." value={form.enunciado}
          onChange={(e) => setForm({ ...form, enunciado: e.target.value })} />
      </div>

      {form.tipo === "multipla_escolha" && (
        <div className="space-y-2">
          <Label>Alternativas</Label>
          {(["a", "b", "c", "d"] as const).map(l => (
            <div key={l} className="flex items-center gap-2">
              <span className={`w-6 h-6 rounded flex items-center justify-center text-xs font-black shrink-0 ${form.resposta_correta === l.toUpperCase() ? "bg-success text-white" : "bg-muted text-muted-foreground"}`}>
                {l.toUpperCase()}
              </span>
              <Input placeholder={`Alternativa ${l.toUpperCase()}`}
                value={form[`alternativa_${l}` as keyof typeof form] as string}
                onChange={(e) => setForm({ ...form, [`alternativa_${l}`]: e.target.value })} />
              <button onClick={() => setForm({ ...form, resposta_correta: l.toUpperCase() })}
                className={`shrink-0 text-xs px-2 py-1 rounded border transition-all ${form.resposta_correta === l.toUpperCase() ? "border-success text-success bg-success-tint" : "border-border text-muted-foreground hover:border-success/50"}`}>
                ✓
              </button>
            </div>
          ))}
        </div>
      )}

      {form.tipo === "verdadeiro_falso" && (
        <div className="space-y-2">
          <Label>Resposta Correta</Label>
          <div className="flex gap-2">
            {[{ label: "Verdadeiro", val: "V" }, { label: "Falso", val: "F" }].map(opt => (
              <button key={opt.val} onClick={() => setForm({ ...form, resposta_correta: opt.val })}
                className={`flex-1 py-2 rounded-lg border text-sm font-semibold transition-all ${form.resposta_correta === opt.val ? "bg-success text-white border-success" : "border-border text-muted-foreground hover:border-success/50"}`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Pts Rápido (≤10s)</Label>
          <Input type="number" value={form.pontos_rapido}
            onChange={(e) => setForm({ ...form, pontos_rapido: parseInt(e.target.value) || 0})} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Pts Lento (&gt;10s)</Label>
          <Input type="number" value={form.pontos_lento}
            onChange={(e) => setForm({ ...form, pontos_lento: parseInt(e.target.value) || 0})} />
        </div>
      </div>
    </>
  )

export default function AdminQRManager() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>("qrcodes")

  // ── QR states ──
  const [qrCodes, setQrCodes] = useState<QRCode[]>([])
  const [isCreatingQR, setIsCreatingQR] = useState(false)
  const [qrForm, setQrForm] = useState({ name: "", points: 50, id_pergunta: "" })

  // QR filters
  const [qrSearch, setQrSearch] = useState("")
  const [qrFiltroPerguntaId, setQrFiltroPerguntaId] = useState("")
  const [filtros, setFiltros] = useState({
    ativo:  { ativo: false, desc: true },
    pontos: { ativo: false, desc: true },
    nome:   { ativo: false, desc: false },
  })

  // ── Pergunta states ──
  const [perguntas, setPerguntas] = useState<Pergunta[]>([])
  const [isCreatingPergunta, setIsCreatingPergunta] = useState(false)
  const [perguntaForm, setPerguntaForm] = useState(PERGUNTA_FORM_DEFAULT)

  // Edit question
  const [editingPergunta, setEditingPergunta] = useState<Pergunta | null>(null)
  const [editPerguntaForm, setEditPerguntaForm] = useState(PERGUNTA_FORM_DEFAULT)

  // "criar inline" context: indica que o modal de criar pergunta foi aberto
  // a partir do modal de criar QR, para auto-selecionar após criação
  const [criarFromQR, setCriarFromQR] = useState<"pergunta" | null>(null)

  // Export
  const [isExporting, setIsExporting] = useState(false)
  const [exportData, setExportData] = useState({
    data: new Date().toISOString().split("T")[0],
    formato: "xlsx",
    pontos_min: "",
    pontos_max: "",
  })

  const handleLogout = async () => {
    await sair()
    router.push("/")
  }

  // ── FETCH ──
  async function fetchQRCodes() {
    try {
      const res = await apiFetch(`/qrcodes/listar`)
      const data = await res.json()
      setQrCodes(data || [])
    } catch (e) { console.error(e) }
  }

  async function fetchPerguntas() {
    try {
      const res = await apiFetch(`/perguntas/listar`)
      const data = await res.json()
      setPerguntas(data || [])
    } catch (e) { console.error(e) }
  }


  useEffect(() => {
    async function checkAdmin() {
      const storedUser = getStoredUser()
      if (!storedUser) return router.push("/")
      try {
        const res = await apiFetch(`/auth/me`)
        const data = await res.json()
        if (!res.ok || !data.is_admin) {
          router.push("/")
        } else {
          await Promise.all([fetchQRCodes(), fetchPerguntas()])
          setLoading(false)
        }
      } catch { router.push("/") }
    }
    checkAdmin()
  }, [])

  // ── QR: filtro + busca + ordenação ──
  const qrCodesVisiveis = [...qrCodes]
    .filter(qr => {
      if (qrSearch && !qr.local.toLowerCase().includes(qrSearch.toLowerCase())) return false
      if (qrFiltroPerguntaId === "__none__" && qr.id_pergunta) return false
      if (qrFiltroPerguntaId && qrFiltroPerguntaId !== "__none__" && qr.id_pergunta !== qrFiltroPerguntaId) return false
      return true
    })
    .sort((a, b) => {
      if (filtros.ativo.ativo) {
        const diff = Number(b.ativo) - Number(a.ativo)
        if (diff !== 0) return filtros.ativo.desc ? diff : -diff
      }
      if (filtros.pontos.ativo) {
        const diff = b.pontos - a.pontos
        if (diff !== 0) return filtros.pontos.desc ? diff : -diff
      }
      if (filtros.nome.ativo) {
        const diff = a.local.localeCompare(b.local, "pt-BR")
        if (diff !== 0) return filtros.nome.desc ? -diff : diff
      }
      return 0
    })

  const toggleFiltro = (chave: keyof typeof filtros) =>
    setFiltros(f => ({ ...f, [chave]: { ...f[chave], ativo: !f[chave].ativo } }))

  const toggleDirecao = (chave: keyof typeof filtros, e: React.MouseEvent) => {
    e.stopPropagation()
    setFiltros(f => ({ ...f, [chave]: { ...f[chave], desc: !f[chave].desc } }))
  }

  const limparFiltros = () => {
    setFiltros({ ativo: { ativo: false, desc: true }, pontos: { ativo: false, desc: true }, nome: { ativo: false, desc: false } })
    setQrSearch("")
    setQrFiltroPerguntaId("")
  }

  const temFiltroAtivo = Object.values(filtros).some(f => f.ativo) || qrSearch || qrFiltroPerguntaId

  const handleToggleStatus = async (code_hash: string, currentStatus: boolean) => {
    if (!confirm(`Deseja ${currentStatus ? "desativar" : "ativar"} este QR Code?`)) return
    try {
      const res = await apiFetch(`/qrcodes/status/${code_hash}`, {
        method: "PATCH",
        body: JSON.stringify({ ativo: !currentStatus }),
        headers: { "Content-Type": "application/json" },
      })
      if (res.ok) setQrCodes(qrCodes.map(qr => qr.code_hash === code_hash ? { ...qr, ativo: !currentStatus } : qr))
    } catch (e) { console.error(e) }
  }

  const handleGenerateQR = async () => {
    if (!qrForm.name) return
    try {
      const params = new URLSearchParams({
        nome_local: qrForm.name,
        pontos: String(qrForm.points),
      })
      if (qrForm.id_pergunta) params.append("id_pergunta", qrForm.id_pergunta)

      const res = await apiFetch(`/qrcodes/gerar?${params}`, { method: "POST" })
      if (!res.ok) throw new Error("Erro ao gerar QR")
      const data = await res.json()

      // Baixa a imagem do QR com o hash exato retornado pelo back (rota pública, não precisa de auth)
      window.open(`${API_URL}/qrcodes/download/${data.code_hash}`, "_blank")

      await fetchQRCodes()
    } catch (e) {
      alert("Erro ao gerar o QR Code. Tente novamente.")
      console.error(e)
    }
    setIsCreatingQR(false)
    setQrForm({ name: "", points: 50, id_pergunta: "" })
  }

  const handleVincular = async (code_hash: string, field: "id_pergunta", value: string) => {
    const params = new URLSearchParams({ [field]: value || "null" })
    await apiFetch(`/qrcodes/${code_hash}/vincular?${params}`, { method: "PATCH" })
    await fetchQRCodes()
  }

  const handleBaixarPdf = async (code_hash: string, local: string) => {
    try {
      await baixarArquivoAutenticado(`/qrcodes/${code_hash}/pdf`, `qrcode_${local}.pdf`)
    } catch (e: any) {
      alert(e.message || "Erro ao gerar o PDF.")
    }
  }

  // ── PERGUNTA: criar ──
  const handleCriarPergunta = async () => {
    const fd = new FormData()
    fd.append("enunciado", perguntaForm.enunciado)
    fd.append("tipo", perguntaForm.tipo)
    fd.append("resposta_correta", perguntaForm.resposta_correta)
    fd.append("pontos_rapido", String(perguntaForm.pontos_rapido))
    fd.append("pontos_lento", String(perguntaForm.pontos_lento))
    if (perguntaForm.tipo === "multipla_escolha") {
      fd.append("alternativa_a", perguntaForm.alternativa_a)
      fd.append("alternativa_b", perguntaForm.alternativa_b)
      fd.append("alternativa_c", perguntaForm.alternativa_c)
      fd.append("alternativa_d", perguntaForm.alternativa_d)
    }
    try {
      const res = await apiFetch(`/perguntas/nova`, { method: "POST", body: fd })
      if (res.ok) {
        const { pergunta } = await res.json()
        await fetchPerguntas()
        // Auto-seleciona se veio do modal de QR
        if (criarFromQR === "pergunta" && pergunta?.id_pergunta) {
          setQrForm(f => ({ ...f, id_pergunta: pergunta.id_pergunta }))
        }
        setIsCreatingPergunta(false)
        setCriarFromQR(null)
        setPerguntaForm(PERGUNTA_FORM_DEFAULT)
      }
      else { alert("Erro ao criar. Tente novamente."); return }
    } catch (e) { alert("Erro ao criar pergunta") }
  }

  // ── PERGUNTA: editar ──
  const openEditPergunta = (p: Pergunta) => {
    setEditingPergunta(p)
    setEditPerguntaForm({
      enunciado: p.enunciado,
      tipo: p.tipo,
      resposta_correta: p.resposta_correta,
      pontos_rapido: p.pontos_rapido,
      pontos_lento: p.pontos_lento,
      alternativa_a: p.alternativas?.A || "",
      alternativa_b: p.alternativas?.B || "",
      alternativa_c: p.alternativas?.C || "",
      alternativa_d: p.alternativas?.D || "",
    })
  }

  const handleSalvarPergunta = async () => {
    if (!editingPergunta || !editPerguntaForm.enunciado) return
    const fd = new FormData()
    fd.append("enunciado", editPerguntaForm.enunciado)
    fd.append("tipo", editPerguntaForm.tipo)
    fd.append("resposta_correta", editPerguntaForm.resposta_correta)
    fd.append("pontos_rapido", String(editPerguntaForm.pontos_rapido))
    fd.append("pontos_lento", String(editPerguntaForm.pontos_lento))
    if (editPerguntaForm.tipo === "multipla_escolha") {
      fd.append("alternativa_a", editPerguntaForm.alternativa_a)
      fd.append("alternativa_b", editPerguntaForm.alternativa_b)
      fd.append("alternativa_c", editPerguntaForm.alternativa_c)
      fd.append("alternativa_d", editPerguntaForm.alternativa_d)
    }
    try {
      const res = await apiFetch(`/perguntas/${editingPergunta.id_pergunta}`, { method: "PATCH", body: fd })
      if (res.ok) {
        await fetchPerguntas()
        setEditingPergunta(null)
      } else {
        alert("Erro ao salvar pergunta.")
      }
    } catch (e) { alert("Erro ao salvar pergunta.") }
  }

  const handleDeletarPergunta = async (id: string) => {
    if (!confirm("Deletar esta pergunta? Será desvinculada de todos os QRs.")) return
    const res = await apiFetch(`/perguntas/${id}`, { method: "DELETE" })
    if (!res.ok) { alert("Erro ao deletar pergunta."); return }
    await fetchPerguntas()
    await fetchQRCodes()
  }

  const handleExport = async () => {
    const params = new URLSearchParams({ data: exportData.data, formato: exportData.formato })
    if (exportData.pontos_min) params.append("pontos_min", exportData.pontos_min)
    if (exportData.pontos_max) params.append("pontos_max", exportData.pontos_max)
    try {
      await baixarArquivoAutenticado(`/usuarios/dados/exportar?${params}`, `relatorio_${exportData.data}.${exportData.formato}`)
    } catch (e: any) {
      alert(e.message || "Erro ao exportar dados.")
    }
    setIsExporting(false)
  }

  if (loading) return (
    <div className="min-h-screen bg-background flex items-center justify-center text-foreground font-bold">
      Verificando permissões...
    </div>
  )

  const tabs = [
    { id: "qrcodes" as Tab, label: "QR Codes", icon: <QrCode className="w-4 h-4" />, count: qrCodes.length },
    { id: "perguntas" as Tab, label: "Perguntas", icon: <HelpCircle className="w-4 h-4" />, count: perguntas.length },
  ]

  // Componente auxiliar para o formulário de pergunta (reutilizado em criar e editar)
  

  return (
    <div className="min-h-screen bg-background text-foreground p-6">
      <header className="max-w-5xl mx-auto flex justify-between items-center mb-8 border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <HexagonLogo size="sm" />
          <h1 className="text-xl font-bold uppercase tracking-wider">Painel Admin <span className="text-primary">{EVENT.name}</span></h1>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setIsExporting(true)}>
            <FileDown className="w-4 h-4 mr-2" /> Exportar
          </Button>
          <Button variant="ghost" size="icon" onClick={handleLogout} className="text-muted-foreground hover:text-danger">
            <LogOut className="w-5 h-5" />
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto space-y-6">
        {/* Tabs */}
        <div className="flex gap-2 bg-card border border-border rounded-xl p-1">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${
                activeTab === tab.id ? "bg-primary text-white shadow" : "text-muted-foreground hover:text-foreground"
              }`}>
              {tab.icon}
              <span className="hidden sm:inline">{tab.label}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${activeTab === tab.id ? "bg-white/20" : "bg-muted"}`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* ===== TAB: QR CODES ===== */}
        {activeTab === "qrcodes" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-black uppercase tracking-wider">Gerenciamento de QRs</h2>
              <Button onClick={() => setIsCreatingQR(true)} className="bg-primary text-foreground font-bold">
                <Plus className="w-4 h-4 mr-2" /> Novo QR
              </Button>
            </div>

            {/* ── Busca por nome ── */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome do local..."
                value={qrSearch}
                onChange={(e) => setQrSearch(e.target.value)}
                className="pl-9 pr-9"
              />
              {qrSearch && (
                <button onClick={() => setQrSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* ── Filtro por pergunta ── */}
            <div className="flex flex-wrap gap-2 items-center">
              {/* Filtro por pergunta */}
              <div className="flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-purple shrink-0" />
                <select
                  value={qrFiltroPerguntaId}
                  onChange={(e) => setQrFiltroPerguntaId(e.target.value)}
                  className="text-xs bg-muted/50 border border-border rounded-full px-3 py-1.5 text-foreground font-semibold focus:border-primary outline-none max-w-[180px]"
                >
                  <option value="">Todas as perguntas</option>
                  <option value="__none__">Sem pergunta</option>
                  {perguntas.map(p => <option key={p.id_pergunta} value={p.id_pergunta}>{p.enunciado.slice(0, 35)}…</option>)}
                </select>
              </div>

              {/* Ordenação */}
              {(Object.entries(filtros) as [keyof typeof filtros, typeof filtros[keyof typeof filtros]][]).map(([chave, f]) => (
                <button key={chave} onClick={() => toggleFiltro(chave)}
                  className={`px-3 py-1.5 rounded-full text-xs border font-semibold transition-all flex items-center gap-1 ${
                    f.ativo ? "bg-primary/20 border-primary text-primary" : "border-border text-muted-foreground hover:border-primary/50"
                  }`}>
                  {chave === "ativo" ? "Status" : chave === "pontos" ? "Pontos" : "Nome"}
                  {f.ativo && (
                    <span onClick={(e) => toggleDirecao(chave, e)} className="ml-1 hover:scale-125 transition-transform">
                      {f.desc ? "↓" : "↑"}
                    </span>
                  )}
                </button>
              ))}

              {temFiltroAtivo && (
                <button onClick={limparFiltros}
                  className="px-3 py-1 rounded-full text-xs border border-destructive/50 text-destructive hover:bg-destructive/10 transition-all flex items-center gap-1">
                  <X className="w-3 h-3" /> Limpar
                </button>
              )}

              <span className="text-xs text-muted-foreground ml-auto">
                {qrCodesVisiveis.length} de {qrCodes.length}
              </span>
            </div>

            {qrCodesVisiveis.length === 0 ? (
              <p className="text-muted-foreground text-center py-10 border border-dashed rounded-xl">
                {qrCodes.length === 0 ? "Nenhum QR Code gerado ainda." : "Nenhum QR corresponde aos filtros."}
              </p>
            ) : (
              <div className="space-y-2">
                {qrCodesVisiveis.map((qr) => (
                  <div key={qr.code_hash}
                    className={`bg-card border p-4 rounded-xl transition-all ${!qr.ativo ? "opacity-60 grayscale border-dashed" : "border-border hover:border-primary/50"}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-4 min-w-0">
                        <div className={`${qr.ativo ? "bg-primary/10" : "bg-muted"} p-3 rounded-lg shrink-0`}>
                          <QrCode className={`${qr.ativo ? "text-primary" : "text-muted-foreground"} w-5 h-5`} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold">{qr.local}</h3>
                            {!qr.ativo && <span className="text-[10px] bg-muted px-2 py-0.5 rounded text-muted-foreground font-bold">DESATIVADO</span>}
                            <span className={`${qr.ativo ? "text-primary" : "text-muted-foreground"} font-bold text-sm`}>+{qr.pontos} pts</span>
                          </div>
                          <p className="text-xs text-muted-foreground font-mono truncate">{qr.code_hash}</p>

                          {/* Vínculos inline com confirmação */}
                          <div className="flex flex-wrap gap-2 mt-2">
                            <div className="flex items-center gap-1">
                              <HelpCircle className="w-3 h-3 text-purple" />
                              <VinculoSelect
                                qr={qr}
                                tipo="id_pergunta"
                                opcoes={perguntas.map(p => ({ value: p.id_pergunta, label: p.enunciado.slice(0, 40) }))}
                                onSalvar={(field, value) => handleVincular(qr.code_hash, field, value)}
                              />
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 border-l border-border pl-4">
                        <Button variant="ghost" size="sm" onClick={() => handleToggleStatus(qr.code_hash, qr.ativo)}
                          className={qr.ativo ? "hover:text-destructive" : "hover:text-primary"}>
                          {qr.ativo ? <Trash2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                        </Button>
                        {qr.ativo && (
                          <>
                            <Button variant="outline" size="sm" onClick={() => window.open(`${API_URL}/qrcodes/download/${qr.code_hash}`, "_blank")} title="Baixar PNG">
                              <Download className="w-4 h-4" />
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => handleBaixarPdf(qr.code_hash, qr.local)} title="Baixar PDF pra imprimir">
                              <FileText className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ===== TAB: PERGUNTAS ===== */}
        {activeTab === "perguntas" && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-black uppercase tracking-wider">Gerenciamento de Perguntas</h2>
              <Button onClick={() => { setCriarFromQR(null); setIsCreatingPergunta(true) }} className="bg-primary text-foreground font-bold">
                <Plus className="w-4 h-4 mr-2" /> Nova Pergunta
              </Button>
            </div>

            {perguntas.length === 0 ? (
              <p className="text-muted-foreground text-center py-10 border border-dashed rounded-xl">Nenhuma pergunta criada ainda.</p>
            ) : (
              <div className="space-y-3">
                {perguntas.map(p => (
                  <div key={p.id_pergunta} className="bg-card border border-border rounded-xl p-4 hover:border-primary/50 transition-all group">
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${p.tipo === "multipla_escolha" ? "bg-purple-tint text-purple" : "bg-secondary/20 text-secondary"}`}>
                            {p.tipo === "multipla_escolha" ? "A/B/C/D" : "V/F"}
                          </span>
                          <span className="text-[10px] text-muted-foreground">⚡ {p.pontos_rapido}pts rápido · {p.pontos_lento}pts lento</span>
                        </div>
                        <p className="font-semibold text-sm">{p.enunciado}</p>
                        {p.tipo === "multipla_escolha" && (
                          <div className="grid grid-cols-2 gap-1 mt-2">
                            {Object.entries(p.alternativas).map(([key, val]) => (
                              <div key={key} className={`text-xs px-2 py-1 rounded border ${key === p.resposta_correta ? "border-success/40 bg-success-tint text-success font-bold" : "border-border text-muted-foreground"}`}>
                                <span className="font-mono mr-1">{key}.</span>{val}
                              </div>
                            ))}
                          </div>
                        )}
                        {p.tipo === "verdadeiro_falso" && (
                          <p className="text-xs mt-1 text-success font-bold">✓ Resposta: {p.resposta_correta === "V" ? "Verdadeiro" : "Falso"}</p>
                        )}
                      </div>
                      <div className="flex gap-2 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button variant="outline" size="sm" onClick={() => openEditPergunta(p)}>
                          <Edit2 className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => handleDeletarPergunta(p.id_pergunta)}
                          className="text-destructive hover:text-destructive">
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ===== MODAL: CRIAR QR ===== */}
      {isCreatingQR && (
        <div className="fixed inset-0 bg-navy-deep/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-card border border-border p-6 rounded-2xl w-full max-w-md shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold">Gerar Novo QR Code</h2>
            <div className="space-y-2">
              <Label>Nome do Local</Label>
              <Input placeholder="Ex: Auditório Principal" value={qrForm.name}
                onChange={(e) => setQrForm({ ...qrForm, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Valor em Pontos</Label>
              <Input type="number" value={qrForm.points}
                onChange={(e) => setQrForm({ ...qrForm, points: parseInt(e.target.value) || 0})} />
            </div>

            <div className="border-t border-border pt-4 space-y-3">
              <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Vínculos opcionais</p>

              {/* Pergunta com botão de criar */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1"><HelpCircle className="w-3.5 h-3.5 text-purple" /> Pergunta</Label>
                <div className="flex gap-2">
                  <select value={qrForm.id_pergunta} onChange={(e) => setQrForm({ ...qrForm, id_pergunta: e.target.value })}
                    className="flex-1 h-10 rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="">Sem pergunta</option>
                    {perguntas.map(p => <option key={p.id_pergunta} value={p.id_pergunta}>{p.enunciado.slice(0, 50)}...</option>)}
                  </select>
                  <Button variant="outline" size="icon" title="Criar nova pergunta"
                    onClick={() => { setCriarFromQR("pergunta"); setIsCreatingPergunta(true) }}>
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button variant="ghost" className="flex-1" onClick={() => { setIsCreatingQR(false); setQrForm({ name: "", points: 50, id_pergunta: "" }) }}>
                Cancelar
              </Button>
              <Button className="flex-1 bg-primary text-white font-bold" onClick={handleGenerateQR} disabled={!qrForm.name}>
                Gerar QR
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL: CRIAR PERGUNTA ===== */}
      {isCreatingPergunta && (
        <div className="fixed inset-0 bg-navy-deep/50 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
          <div className="bg-card border border-border p-6 rounded-2xl w-full max-w-md shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold">
              Nova Pergunta
              {criarFromQR === "pergunta" && <span className="text-xs font-normal text-muted-foreground ml-2">· será vinculada ao QR</span>}
            </h2>

            <PerguntaFormFields form={perguntaForm} setForm={setPerguntaForm} />

            <div className="flex gap-2 pt-2">
              <Button variant="ghost" className="flex-1" onClick={() => { setIsCreatingPergunta(false); setCriarFromQR(null) }}>
                Cancelar
              </Button>
              <Button className="flex-1 bg-primary text-white font-bold" onClick={handleCriarPergunta} disabled={!perguntaForm.enunciado}>
                Criar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL: EDITAR PERGUNTA ===== */}
      {editingPergunta && (
        <div className="fixed inset-0 bg-navy-deep/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-card border border-border p-6 rounded-2xl w-full max-w-md shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold">Editar Pergunta</h2>

            <PerguntaFormFields form={editPerguntaForm} setForm={setEditPerguntaForm} />

            <div className="flex gap-2 pt-2">
              <Button variant="ghost" className="flex-1" onClick={() => setEditingPergunta(null)}>Cancelar</Button>
              <Button className="flex-1 bg-primary text-white font-bold" onClick={handleSalvarPergunta} disabled={!editPerguntaForm.enunciado}>
                Salvar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL: EXPORTAR ===== */}
      {isExporting && (
        <div className="fixed inset-0 bg-navy-deep/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-card border border-border p-6 rounded-2xl w-full max-w-sm shadow-2xl space-y-4">
            <h2 className="text-xl font-bold">Exportar Relatório</h2>
            <p className="text-sm text-muted-foreground">Filtra alunos pelo dia de registro.</p>
            <div className="space-y-2">
              <Label>Data do Relatório</Label>
              <Input type="date" value={exportData.data} onChange={(e) => setExportData({ ...exportData, data: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Faixa de Pontos (opcional)</Label>
              <div className="flex gap-2 items-center">
                <Input type="number" placeholder="Mín" value={exportData.pontos_min}
                  onChange={(e) => setExportData({ ...exportData, pontos_min: e.target.value })} />
                <span className="text-muted-foreground">–</span>
                <Input type="number" placeholder="Máx" value={exportData.pontos_max}
                  onChange={(e) => setExportData({ ...exportData, pontos_max: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Formato</Label>
              <div className="flex gap-2">
                {["xlsx", "json"].map(fmt => (
                  <button key={fmt} onClick={() => setExportData({ ...exportData, formato: fmt })}
                    className={`flex-1 py-2 rounded-lg border text-sm font-semibold transition-all ${exportData.formato === fmt ? "bg-primary text-white border-primary" : "border-border text-muted-foreground hover:border-primary/50"}`}>
                    .{fmt}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="ghost" className="flex-1" onClick={() => setIsExporting(false)}>Cancelar</Button>
              <Button className="flex-1 bg-primary text-white font-bold" onClick={handleExport}>
                <FileDown className="w-4 h-4 mr-2" /> Baixar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
