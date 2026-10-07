/*
 * Cliente da API do SOEA.
 *
 * - Tudo passa por /api/* (rewrite do Next para o FastAPI): o cookie do refresh token
 *   fica first-party e o navegador não o bloqueia como cookie de terceiro.
 * - O access token (15 min) vive SÓ em memória. Nada de token no localStorage:
 *   um script injetado na página não consegue roubar uma sessão longa.
 * - O refresh token mora num cookie HttpOnly que o JavaScript nem enxerga.
 * - O localStorage guarda apenas o perfil público (nome, pontos) para a UI abrir rápido.
 */

import "./demo-api"

export const API_BASE = "/api"

const USER_KEY = "user_nexp"
const LEGADO_TOKEN_KEY = "auth_token"
const CSRF = { "x-soea-csrf": "1" }

let accessToken: string | null = null
let renovando: Promise<boolean> | null = null

// Remove o token de longa duração que a versão anterior deixava no localStorage.
if (typeof window !== "undefined") {
  try {
    localStorage.removeItem(LEGADO_TOKEN_KEY)
  } catch {}
}

export type Usuario = {
  id_user: string
  nome: string
  email: string
  pontos: number
  nivel: number
  is_admin: boolean
}

export type Sessao = { etapa: "ok"; user: Usuario; token: string; expira_em: number }

/** Mantido por compatibilidade: devolve o access token em memória. */
export function getToken(): string | null {
  return accessToken
}

export function getStoredUser(): any | null {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function salvarSessao(user: Usuario, token: string) {
  accessToken = token
  atualizarUsuario(user)
}

/** Atualiza só o perfil salvo (ex.: depois de editar o nome). */
export function atualizarUsuario(user: Partial<Usuario>) {
  try {
    const atual = getStoredUser() ?? {}
    localStorage.setItem(USER_KEY, JSON.stringify({ ...atual, ...user }))
  } catch {}
}

export function limparSessao() {
  accessToken = null
  try {
    localStorage.removeItem(USER_KEY)
    localStorage.removeItem(LEGADO_TOKEN_KEY)
  } catch {}
}

/** Encerra a sessão no servidor (revoga o refresh token) e limpa o aparelho. */
export async function sair(opcoes: { todosOsAparelhos?: boolean } = {}) {
  const headers: Record<string, string> = { ...CSRF }
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`
  try {
    await fetch(`${API_BASE}/auth/${opcoes.todosOsAparelhos ? "logout-todos" : "logout"}`, {
      method: "POST",
      headers,
      credentials: "same-origin",
    })
  } catch {}
  limparSessao()
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Troca o refresh token (cookie) por um access token novo. Chamadas simultâneas
 * compartilham a mesma promessa; um 409 (outra aba renovou ao mesmo tempo) é
 * repetido uma vez, já com o cookie novo.
 */
export function renovarSessao(): Promise<boolean> {
  if (!renovando) {
    renovando = (async () => {
      for (let tentativa = 0; tentativa < 2; tentativa++) {
        let res: Response
        try {
          res = await fetch(`${API_BASE}/auth/refresh`, { method: "POST", headers: CSRF, credentials: "same-origin" })
        } catch {
          return false
        }
        if (res.ok) {
          const dados: Sessao = await res.json()
          salvarSessao(dados.user, dados.token)
          return true
        }
        if (res.status === 409) {
          await esperar(350)
          continue
        }
        return false
      }
      return false
    })().finally(() => {
      renovando = null
    })
  }
  return renovando
}

function expulsar() {
  limparSessao()
  if (typeof window !== "undefined") window.location.href = "/"
}

/**
 * fetch autenticado: injeta o Bearer, renova a sessão quando o access token expira
 * e repete a chamada uma vez. Se não der para renovar, derruba a sessão local.
 */
export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const rotaDeAuth = path.startsWith("/auth/")
  const logado = !!getStoredUser()

  if (!accessToken && logado && !rotaDeAuth) {
    const ok = await renovarSessao()
    if (!ok) {
      expulsar()
      return new Response(JSON.stringify({ detail: "Sessão expirada. Faça login novamente." }), { status: 401 })
    }
  }

  const executar = () => {
    const headers = new Headers(options.headers)
    if (accessToken && !rotaDeAuth) headers.set("Authorization", `Bearer ${accessToken}`)
    return fetch(`${API_BASE}${path}`, { ...options, headers, credentials: "same-origin" })
  }

  let res = await executar()

  if (res.status === 401 && logado && !rotaDeAuth) {
    if (await renovarSessao()) {
      res = await executar()
      if (res.status === 401) expulsar()
    } else {
      expulsar()
    }
  }

  return res
}

/** POST JSON numa rota de autenticação. */
export function authPost(path: string, body: unknown) {
  return fetch(`${API_BASE}/auth${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...CSRF },
    body: JSON.stringify(body),
    credentials: "same-origin",
  })
}

/** Extrai uma mensagem legível de qualquer erro do FastAPI (incluindo 422 do Pydantic). */
export function mensagemDeErro(dados: any, padrao = "Algo deu errado. Tente novamente."): string {
  const detail = dados?.detail
  if (typeof detail === "string") return detail
  if (Array.isArray(detail) && detail.length) {
    const msg = String(detail[0]?.msg ?? "")
    return msg.replace(/^Value error, /, "") || padrao
  }
  return padrao
}

/**
 * Baixa um arquivo de uma rota autenticada (ex: exportação de dados) — não dá
 * pra usar window.open aqui porque uma navegação de browser não carrega o
 * header Authorization.
 */
export async function baixarArquivoAutenticado(path: string, nomeArquivoFallback: string) {
  const res = await apiFetch(path)
  if (!res.ok) {
    const erro = await res.json().catch(() => null)
    throw new Error(erro?.detail || "Erro ao baixar arquivo.")
  }

  const blob = await res.blob()
  const disposition = res.headers.get("Content-Disposition") || ""
  const match = disposition.match(/filename=([^;]+)/)
  const nomeArquivo = match ? match[1].trim() : nomeArquivoFallback

  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = nomeArquivo
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
