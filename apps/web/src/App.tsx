import { useEffect, useState } from "react"
import { io } from "socket.io-client"

type Message = {
  id: string
  role: "user" | "assistant"
  content: string
}

const socket = io("http://localhost:3001")

export default function App() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isSending, setIsSending] = useState(false)

  useEffect(() => {
    socket.on("history", (history: Message[]) => {
      setMessages(history)
    })

    socket.on("message", (message: Message) => {
      setMessages((prev) => [...prev, message])
      setIsSending(false)
    })

    return () => {
      socket.off("history")
      socket.off("message")
    }
  }, [])

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="logo">C</span>
          <span>Cline Mobile</span>
        </div>
      </header>

      <main className="chat-panel">
        {messages.length === 0 ? (
          <div className="empty-state">
            Start a chat with your remote Cline runtime.
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`bubble ${message.role === "user" ? "user" : "assistant"}`}
            >
              {message.content}
            </div>
          ))
        )}
      </main>

      <div className="composer">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Cline..."
          disabled={isSending}
          onKeyDown={(e) => {
            if (e.key === "Enter") sendMessage()
          }}
        />
        <button onClick={sendMessage} disabled={isSending}>
          {isSending ? "Sending..." : "Send"}
        </button>
      </div>
    </div>
  )

  async function sendMessage() {
    const content = input.trim()
    if (!content || isSending) return

    setIsSending(true)
    setInput("")

    await fetch("http://localhost:3001/message", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content }),
    })
  }
}
