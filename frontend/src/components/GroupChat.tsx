import { useState, useEffect, useRef } from 'react'
import {
  getGroupMessages, postGroupMessage, getOnlineNodes,
  type GroupMessage, type OnlineNode, type Group,
} from '../api/cloud'
import { getStoredUser } from '../api/cloud'
import './GroupChat.css'

interface Props {
  group: Group
  model: string   // current user's selected local model
}

// ── Color palette ─────────────────────────────────────────────────────────────
const PALETTE = [
  '#e05c7a', '#f0a04b', '#4bc8f0', '#3dba6c',
  '#c06af7', '#f0e04b', '#f07c4b', '#4b9cf0',
]
function userColor(userId: string): string {
  let h = 0
  for (let i = 0; i < userId.length; i++) h = (h * 31 + userId.charCodeAt(i)) & 0xffffffff
  return PALETTE[Math.abs(h) % PALETTE.length]
}

// ── OpenClaw group-reply ───────────────────────────────────────────────────────
async function askLocalModel(
  myUserId: string,
  myUsername: string,
  model: string,
  messages: GroupMessage[],
): Promise<{ content: string; skipped: boolean }> {
  const res = await fetch('/api/group-reply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      myUserId,
      myUsername,
      model,
      messages: messages.map(m => ({
        userId: m.userId,
        username: m.username,
        content: m.content,
        isAi: m.isAi,
        modelName: m.modelName,
      })),
    }),
  })
  if (!res.ok) return { content: '', skipped: true }
  return res.json()
}

export default function GroupChat({ group, model }: Props) {
  const [messages, setMessages] = useState<GroupMessage[]>([])
  const [onlineNodes, setOnlineNodes] = useState<OnlineNode[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [aiThinking, setAiThinking] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // Track which message IDs we've already processed for AI reply
  const seenIds = useRef<Set<string>>(new Set())
  const me = getStoredUser()

  // ── Load + poll ──────────────────────────────────────────────────────────────
  const load = async () => {
    try {
      const [msgs, nodes] = await Promise.all([
        getGroupMessages(group.id),
        getOnlineNodes(group.id),
      ])
      setMessages(msgs)
      setOnlineNodes(nodes)
      return msgs
    } catch {
      return null
    }
  }

  useEffect(() => {
    // Reset seen IDs when switching groups
    seenIds.current = new Set()
    load().then(msgs => {
      // Seed seenIds with all current messages so we don't auto-reply to history
      if (msgs) msgs.forEach(m => seenIds.current.add(m.id))
    })
    pollRef.current = setInterval(load, 4000)
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [group.id])

  // ── AI auto-response trigger ─────────────────────────────────────────────────
  useEffect(() => {
    if (!me || !model || messages.length === 0) return

    // Find messages we haven't processed yet
    const unseen = messages.filter(m => !seenIds.current.has(m.id))
    unseen.forEach(m => seenIds.current.add(m.id))

    // Trigger if there's at least one new human message from someone else
    const hasNewHuman = unseen.some(m => !m.isAi && m.userId !== me.id)
    if (!hasNewHuman || aiThinking) return

    setAiThinking(true)
    askLocalModel(me.id, me.username, model, messages)
      .then(async result => {
        if (result.skipped || !result.content.trim()) return
        const aiMsg = await postGroupMessage(group.id, result.content, true, model)
        setMessages(prev => [...prev, aiMsg])
        seenIds.current.add(aiMsg.id)
      })
      .catch(() => {})
      .finally(() => setAiThinking(false))
  }, [messages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, aiThinking])

  // ── Send human message ────────────────────────────────────────────────────────
  const send = async () => {
    const text = input.trim()
    if (!text || sending) return
    setSending(true)
    setInput('')
    try {
      const msg = await postGroupMessage(group.id, text)
      setMessages(prev => [...prev, msg])
      seenIds.current.add(msg.id)
    } catch { /* ignore */ } finally {
      setSending(false)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const fmt = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  const nodeByUser: Record<string, OnlineNode> = {}
  onlineNodes.forEach(n => { nodeByUser[n.userId] = n })

  return (
    <div className="gchat">
      {/* ── Header ── */}
      <div className="gchat-header">
        <div className="gchat-title">
          <span className="gchat-hash">#</span>
          <span>{group.name}</span>
          {aiThinking && <span className="gchat-ai-badge">AI thinking…</span>}
        </div>
        <div className="gchat-members">
          {onlineNodes.map(n => (
            <div
              key={n.id}
              className="gchat-member"
              style={{ '--user-color': userColor(n.userId) } as React.CSSProperties}
            >
              <span className="gchat-dot" />
              <span className="gchat-member-name">{n.username}</span>
              {n.modelList?.[0] && (
                <span className="gchat-member-model">{n.modelList[0]}</span>
              )}
            </div>
          ))}
          {onlineNodes.length === 0 && <span className="gchat-no-online">No peers online</span>}
        </div>
      </div>

      {/* ── Messages ── */}
      <div className="gchat-messages">
        {messages.length === 0 && (
          <div className="gchat-empty">No messages yet. Say something to your group!</div>
        )}
        {messages.map((m, i) => {
          const isMe = m.userId === me?.id
          const color = userColor(m.userId)
          const showName = i === 0
            || messages[i - 1].userId !== m.userId
            || messages[i - 1].isAi !== m.isAi

          return (
            <div
              key={m.id}
              className={`gchat-msg ${isMe ? 'mine' : ''} ${m.isAi ? 'ai-msg' : ''}`}
              style={{ '--user-color': color } as React.CSSProperties}
            >
              {showName && (
                <div className="gchat-msg-name">
                  <span className="gchat-msg-user">
                    {isMe ? 'You' : m.username}
                  </span>
                  {m.isAi && m.modelName && (
                    <span className="gchat-model-badge">{m.modelName}</span>
                  )}
                  {!m.isAi && nodeByUser[m.userId]?.modelList?.[0] && (
                    <span className="gchat-msg-model">
                      {nodeByUser[m.userId].modelList[0]}
                    </span>
                  )}
                </div>
              )}
              <div className="gchat-bubble">
                <span className="gchat-content">{m.content}</span>
                <span className="gchat-time">{fmt(m.createdAt)}</span>
              </div>
            </div>
          )
        })}

        {aiThinking && (
          <div className="gchat-msg mine ai-msg" style={{ '--user-color': me ? userColor(me.id) : '#7c6af7' } as React.CSSProperties}>
            <div className="gchat-msg-name">
              <span className="gchat-msg-user">You</span>
              <span className="gchat-model-badge">{model}</span>
            </div>
            <div className="gchat-bubble">
              <span className="gchat-content thinking">
                <span className="dot" /><span className="dot" /><span className="dot" />
              </span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input ── */}
      <div className="gchat-input-area">
        <textarea
          className="gchat-input"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={`Message #${group.name}… (Enter to send)`}
          rows={1}
          disabled={sending}
        />
        <button className="gchat-send" onClick={send} disabled={sending || !input.trim()}>↑</button>
      </div>
    </div>
  )
}
