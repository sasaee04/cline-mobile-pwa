import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto"
import express, { type NextFunction, type Request, type Response } from "express"
import http from "node:http"
import cors from "cors"
import { Server as SocketIOServer } from "socket.io"
import { RuntimeAdapter } from "./runtime-adapter.js"

const app = express()
const server = http.createServer(app)
const allowedOrigins = (process.env.WEB_ORIGINS || "http://localhost:5173,http://127.0.0.1:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean)

const io = new SocketIOServer(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
  },
})

const token = process.env.CLINE_MOBILE_TOKEN || randomBytes(32).toString("base64url")
const tokenBuffer = Buffer.from(token)
const sessions = new Map<string, { id: string; role: "user" | "assistant"; content: string; createdAt: string }[]>()
const pendingApprovals = new Map<string, {
  sessionId: string
  resolve: (result: { approved: boolean; reason?: string }) => void
  timer: ReturnType<typeof setTimeout>
}>()

function safeTokenEqual(candidate: string): boolean {
  const candidateBuffer = Buffer.from(candidate)
  return candidateBuffer.length === tokenBuffer.length && timingSafeEqual(candidateBuffer, tokenBuffer)
}

function authenticate(req: Request, res: Response, next: NextFunction) {
  const authorization = req.header("authorization") || ""
  const candidate = authorization.startsWith("Bearer ") ? authorization.slice(7) : ""
  if (!safeTokenEqual(candidate)) return res.status(401).json({ error: "Unauthorized" })
  next()
}

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true)
    callback(new Error("Origin is not allowed"))
  },
}))
app.use(express.json({ limit: "1mb" }))
app.get("/health", (_req, res) => res.json({ ok: true }))
app.use("/api", authenticate)

function emitMessage(sessionId: string, role: "user" | "assistant", content: string) {
  const message = { id: randomUUID(), role, content, createdAt: new Date().toISOString() }
  const history = sessions.get(sessionId) || []
  history.push(message)
  sessions.set(sessionId, history)
  io.to(`session:${sessionId}`).emit("session:message", { sessionId, message })
  return message
}

const runtime = new RuntimeAdapter(
  (request) => new Promise((resolve) => {
    const requestId = randomUUID()
    const timeoutMs = Number(process.env.CLINE_APPROVAL_TIMEOUT_MS || 120_000)
    const timer = setTimeout(() => {
      pendingApprovals.delete(requestId)
      resolve({ approved: false, reason: "Approval timed out; tool execution denied." })
    }, timeoutMs)
    pendingApprovals.set(requestId, { sessionId: request.sessionId, resolve, timer })
    io.to(`session:${request.sessionId}`).emit("approval:requested", {
      requestId,
      sessionId: request.sessionId,
      toolName: request.toolName,
      input: request.input,
    })
  }),
  (sessionId, event) => io.to(`session:${sessionId}`).emit("session:event", event),
)

app.get("/api/sessions", (_req, res) => {
  res.json(runtime.listSessions())
})

app.post("/api/sessions", async (_req, res) => {
  try {
    const session = await runtime.createSession()
    sessions.set(session.sessionId, [])
    res.status(201).json(session)
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create session"
    res.status(503).json({ error: message })
  }
})

app.get("/api/sessions/:sessionId/messages", (req, res) => {
  const history = sessions.get(req.params.sessionId)
  if (!history) return res.status(404).json({ error: "Session not found" })
  res.json(history)
})

app.post("/api/sessions/:sessionId/messages", async (req, res) => {
  const prompt = typeof req.body?.content === "string" ? req.body.content.trim() : ""
  if (!prompt) return res.status(400).json({ error: "Message cannot be empty" })
  if (prompt.length > 20_000) return res.status(413).json({ error: "Message is too long" })

  const sessionId = req.params.sessionId
  if (!sessions.has(sessionId)) return res.status(404).json({ error: "Session not found" })
  emitMessage(sessionId, "user", prompt)

  try {
    const response = await runtime.sendMessage(sessionId, prompt)
    const message = emitMessage(sessionId, "assistant", response)
    res.json({ ok: true, message })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Runtime failed"
    res.status(503).json({ error: message })
  }
})

app.post("/api/approvals/:requestId", (req, res) => {
  const pending = pendingApprovals.get(req.params.requestId)
  if (!pending) return res.status(404).json({ error: "Approval is no longer pending" })
  const approved = req.body?.approved === true
  clearTimeout(pending.timer)
  pendingApprovals.delete(req.params.requestId)
  pending.resolve(approved ? { approved: true } : { approved: false, reason: "Rejected from Cline Mobile." })
  res.json({ ok: true })
})

io.use((socket, next) => {
  const candidate = typeof socket.handshake.auth?.token === "string" ? socket.handshake.auth.token : ""
  if (!safeTokenEqual(candidate)) return next(new Error("Unauthorized"))
  next()
})
io.on("connection", (socket) => {
  socket.on("session:join", (sessionId: unknown) => {
    if (typeof sessionId === "string" && sessions.has(sessionId)) socket.join(`session:${sessionId}`)
  })
})

const host = process.env.CLINE_HOST || "127.0.0.1"
const port = Number(process.env.PORT || 3001)
server.listen(port, host, () => {
  console.log(`Cline Mobile API listening on http://${host}:${port}`)
  console.log(`Mobile access token: ${token}`)
  console.log(`Workspace: ${runtime.workspaceRoot}`)
  if (host === "0.0.0.0") {
    console.warn("Network binding enabled. Use a private network and HTTPS/reverse proxy; do not expose this port directly to the internet.")
  }
})

async function shutdown() {
  for (const approval of pendingApprovals.values()) {
    clearTimeout(approval.timer)
    approval.resolve({ approved: false, reason: "Server is shutting down." })
  }
  pendingApprovals.clear()
  await runtime.dispose()
  io.close()
  server.close()
}

process.once("SIGINT", () => void shutdown())
process.once("SIGTERM", () => void shutdown())
