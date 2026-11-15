import express from "express"
import http from "http"
import cors from "cors"
import { Server as SocketIOServer } from "socket.io"
import { RuntimeAdapter } from "./runtime-adapter.js"

type Message = {
  id: string
  role: "user" | "assistant"
  content: string
}

const app = express()
const server = http.createServer(app)
const io = new SocketIOServer(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
})

const runtime = new RuntimeAdapter()

app.use(cors())
app.use(express.json())

const messages: Message[] = []

app.get("/health", (_req, res) => {
  res.json({ ok: true, mode: process.env.CLINE_RUNTIME_MODE || "mock" })
})

app.get("/messages", (_req, res) => {
  res.json(messages)
})

app.post("/message", async (req, res) => {
  const { content } = req.body as { content?: string }

  if (!content || !content.trim()) {
    return res.status(400).json({ error: "Message cannot be empty" })
  }

  const prompt = content.trim()

  const userMessage: Message = {
    id: crypto.randomUUID(),
    role: "user",
    content: prompt,
  }

  messages.push(userMessage)
  io.emit("message", userMessage)

  try {
    const responseText = await runtime.sendPrompt(prompt)

    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: responseText,
    }

    messages.push(assistantMessage)
    io.emit("message", assistantMessage)

    res.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown runtime error"

    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: `Runtime error: ${message}`,
    }

    messages.push(assistantMessage)
    io.emit("message", assistantMessage)

    res.status(503).json({ ok: false, error: message })
  }
})

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id)
  socket.emit("history", messages)
})

const PORT = Number(process.env.PORT || 3001)
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`)
  console.log(`Runtime mode: ${process.env.CLINE_RUNTIME_MODE || "mock"}`)
})
