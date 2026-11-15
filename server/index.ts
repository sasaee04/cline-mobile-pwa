import express from "express"
import http from "http"
import cors from "cors"
import { Server as SocketIOServer } from "socket.io"

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

app.use(cors())
app.use(express.json())

const messages: Message[] = []

app.get("/health", (_req, res) => {
  res.json({ ok: true })
})

app.get("/messages", (_req, res) => {
  res.json(messages)
})

app.post("/message", (req, res) => {
  const { content } = req.body as { content?: string }

  if (!content || !content.trim()) {
    return res.status(400).json({ error: "Message cannot be empty" })
  }

  const userMessage: Message = {
    id: crypto.randomUUID(),
    role: "user",
    content: content.trim(),
  }

  messages.push(userMessage)
  io.emit("message", userMessage)

  const responseText = `Cline mobile server received: "${content.trim()}"`

  setTimeout(() => {
    const assistantMessage: Message = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: responseText,
    }

    messages.push(assistantMessage)
    io.emit("message", assistantMessage)
  }, 600)

  res.json({ ok: true })
})

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id)
  socket.emit("history", messages)
})

const PORT = 3001
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`)
})
