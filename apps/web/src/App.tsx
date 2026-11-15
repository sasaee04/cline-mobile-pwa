import { FormEvent, useEffect, useMemo, useState } from "react"
import { io, Socket } from "socket.io-client"

type ChatMessage = { id: string; role: "user" | "assistant"; content: string; createdAt: string }
type Session = { sessionId: string; createdAt: string }
type Approval = { requestId: string; sessionId: string; toolName: string; input: unknown }

const API_BASE = import.meta.env.VITE_API_BASE_URL || window.location.origin
const TOKEN_KEY = "cline-mobile-token"

async function api<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error || `Request failed (${response.status})`)
  }
  return response.json() as Promise<T>
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || "")
  const [tokenInput, setTokenInput] = useState(token)
  const [socket, setSocket] = useState<Socket | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeSessionId, setActiveSessionId] = useState("")
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [approvals, setApprovals] = useState<Approval[]>([])
  const [input, setInput] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const activeSession = useMemo(() => sessions.find((session) => session.sessionId === activeSessionId), [sessions, activeSessionId])

  useEffect(() => {
    if (!token) return
    const connection = io(API_BASE, { auth: { token }, reconnection: true })
    setSocket(connection)
    connection.on("connect_error", (reason) => setError(reason.message === "Unauthorized" ? "Token rejected. Check your access token." : "Cannot connect to the host."))
    connection.on("session:message", ({ sessionId, message }: { sessionId: string; message: ChatMessage }) => {
      if (sessionId === activeSessionId) setMessages((current) => current.some((item) => item.id === message.id) ? current : [...current, message])
    })
    connection.on("approval:requested", (approval: Approval) => {
      setApprovals((current) => current.some((item) => item.requestId === approval.requestId) ? current : [...current, approval])
    })
    return () => { connection.disconnect(); setSocket(null) }
  }, [token, activeSessionId])

  useEffect(() => {
    if (!token) return
    api<Session[]>("/api/sessions", token)
      .then(async (items) => {
        setSessions(items)
        if (items[0]) await selectSession(items[0].sessionId, token)
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : "Could not load sessions"))
  }, [token])

  async function selectSession(sessionId: string, accessToken = token) {
    setActiveSessionId(sessionId)
    socket?.emit("session:join", sessionId)
    try {
      const history = await api<ChatMessage[]>(`/api/sessions/${sessionId}/messages`, accessToken)
      setMessages(history)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load conversation")
    }
  }

  function saveToken(event: FormEvent) {
    event.preventDefault()
    const value = tokenInput.trim()
    if (!value) return
    localStorage.setItem(TOKEN_KEY, value)
    setError("")
    setToken(value)
  }

  async function sendMessage(event?: FormEvent) {
    event?.preventDefault()
    const content = input.trim()
    if (!content || busy || !token) return
    setBusy(true)
    setError("")
    setInput("")
    try {
      let sessionId = activeSessionId
      if (!sessionId) {
        const created = await api<Session>("/api/sessions", token, { method: "POST", body: "{}" })
        sessionId = created.sessionId
        setSessions((current) => [created, ...current])
        setActiveSessionId(sessionId)
        socket?.emit("session:join", sessionId)
      }
      await api(`/api/sessions/${sessionId}/messages`, token, { method: "POST", body: JSON.stringify({ content }) })
      const history = await api<ChatMessage[]>(`/api/sessions/${sessionId}/messages`, token)
      setMessages(history)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Message failed")
    } finally {
      setBusy(false)
    }
  }

  async function resolveApproval(approval: Approval, approved: boolean) {
    try {
      await api(`/api/approvals/${approval.requestId}`, token, { method: "POST", body: JSON.stringify({ approved }) })
      setApprovals((current) => current.filter((item) => item.requestId !== approval.requestId))
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not submit approval")
    }
  }

  if (!token) {
    return <main className="setup-screen"><form className="setup-card" onSubmit={saveToken}>
      <div className="brand"><span className="logo">C</span><span>Cline Mobile</span></div>
      <h1>Connect to your computer</h1>
      <p>Enter the access token printed by the Cline Mobile server terminal.</p>
      <label htmlFor="access-token">Access token</label>
      <input id="access-token" autoComplete="off" value={tokenInput} onChange={(event) => setTokenInput(event.target.value)} required />
      <button type="submit">Connect securely</button>
      {error && <p className="error">{error}</p>}
    </form></main>
  }

  return <div className="app-shell">
    <header className="topbar">
      <div className="brand"><span className="logo">C</span><span>Cline Mobile</span></div>
      <div className="header-actions">
        <select aria-label="Conversation" value={activeSessionId} onChange={(event) => void selectSession(event.target.value)}>
          <option value="">New conversation</option>
          {sessions.map((session) => <option key={session.sessionId} value={session.sessionId}>{new Date(session.createdAt).toLocaleString()}</option>)}
        </select>
        <button className="secondary" onClick={() => { localStorage.removeItem(TOKEN_KEY); setToken(""); setTokenInput("") }}>Disconnect</button>
      </div>
    </header>
    <main className="chat-panel" aria-live="polite">
      {!activeSession && messages.length === 0 && <div className="empty-state"><h1>Code from your phone</h1><p>Your computer runs Cline and keeps your workspace local. Send a task to get started.</p></div>}
      {activeSession && <p className="workspace-note">Connected to your computer · session {activeSession.sessionId.slice(0, 8)}</p>}
      {messages.map((message) => <article key={message.id} className={`bubble ${message.role}`}><span className="role-label">{message.role === "user" ? "You" : "Cline"}</span><div>{message.content}</div></article>)}
      {busy && <div className="status">Cline is working…</div>}
      {approvals.filter((approval) => approval.sessionId === activeSessionId).map((approval) => <section key={approval.requestId} className="approval-card"><strong>Approval required: {approval.toolName}</strong><pre>{JSON.stringify(approval.input, null, 2)}</pre><div><button onClick={() => void resolveApproval(approval, false)} className="secondary">Deny</button><button onClick={() => void resolveApproval(approval, true)}>Approve</button></div></section>)}
      {error && <div className="error-banner" role="alert">{error}</div>}
    </main>
    <form className="composer" onSubmit={(event) => void sendMessage(event)}>
      <textarea value={input} onChange={(event) => setInput(event.target.value)} placeholder="Describe a coding task…" rows={2} disabled={busy} />
      <button type="submit" disabled={busy || !input.trim()}>{busy ? "Working…" : "Send"}</button>
    </form>
  </div>
}
