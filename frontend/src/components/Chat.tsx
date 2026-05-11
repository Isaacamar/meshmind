import { useState, useEffect, useRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism'
import type { LocalMessage, LocalSession } from '../App'
import { groqChat, publishMarketEntry, searchMarketByText, type GroqChatMessage } from '../api/cloud'
import { apiUrl } from '../api/local'
import { modelColor, contextWindowSize, ctxFillColor, ctxWarning } from '../utils/models'
import './Chat.css'

interface Props {
  session: LocalSession
  onUpdate: (updated: LocalSession) => void
  onCreditsEarned: (n: number) => void
  temperature: number
  localOnly: boolean
  readOnly?: boolean
  chatMode?: 'local' | 'groq' | 'readonly'
  groqApiKey?: string
  groqModel?: string
}

interface Attachment {
  type: 'image' | 'pdf'
  name: string
  previewUrl?: string   // image thumbnail (object URL, not persisted)
  b64?: string          // image base64 for sending
  text?: string         // PDF extracted text
}

const MODE_LABEL: Record<string, string> = {
  verbatim: '✓ Cached answer',
  repackage: '↻ Repackaged',
  miss: '✗ Fresh inference',
  local: '⬡ Local only',
  groq: '⚡ Groq fallback',
}

function normalizeLatex(content: string): string {
  return content
    // \[...\] → block $$
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, inner) => `\n\n$$\n${inner.trim()}\n$$\n\n`)
    // \(...\) → inline $
    .replace(/\\\(([\s\S]*?)\\\)/g, (_, inner) => `$${inner.trim()}$`)
    // \begin{env}...\end{env} not already inside $$ → wrap as block
    .replace(/\\begin\{(align\*?|aligned|equation\*?|gather\*?|multline\*?)\}([\s\S]*?)\\end\{\1\}/g,
      (match) => `\n\n$$\n${match}\n$$\n\n`)
    // $$ that appears mid-line (not already preceded by a newline) → force onto its own line
    .replace(/([^\n])\$\$([\s\S]*?)\$\$/g, (_, pre, inner) => `${pre}\n\n$$${inner}$$`)
    .replace(/\$\$([\s\S]*?)\$\$([^\n])/g, (_, inner, post) => `$$${inner}$$\n\n${post}`)
}

function Markdown({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        code({ className, children, ...rest }) {
          const match = /language-(\w+)/.exec(className ?? '')
          if (match) {
            return (
              <SyntaxHighlighter
                style={oneDark}
                language={match[1]}
                PreTag="div"
                customStyle={{ borderRadius: '8px', fontSize: '0.875rem', margin: '8px 0' }}
              >
                {String(children).replace(/\n$/, '')}
              </SyntaxHighlighter>
            )
          }
          return <code className={className} {...rest}>{children}</code>
        },
      }}
    >
      {normalizeLatex(content)}
    </ReactMarkdown>
  )
}

export default function Chat({
  session,
  onUpdate,
  onCreditsEarned,
  temperature,
  localOnly,
  readOnly = false,
  chatMode = 'local',
  groqApiKey = '',
  groqModel = 'llama-3.1-8b-instant',
}: Props) {
  // Local message state — updated per-token during streaming, synced to parent on completion
  const [msgs, setMsgs] = useState<LocalMessage[]>(session.messages)
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [attachment, setAttachment] = useState<Attachment | null>(null)
  const [attachLoading, setAttachLoading] = useState(false)
  const [publishingIdx, setPublishingIdx] = useState<number | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const bottomRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const isGroq = chatMode === 'groq'
  const canAttach = chatMode === 'local'

  // Sync messages when switching to a different session
  useEffect(() => { setMsgs(session.messages) }, [session.id])

  useEffect(() => {
    const el = messagesRef.current
    if (!el) return
    // During streaming use instant scroll so smooth animation doesn't fight itself
    el.scrollTo({ top: el.scrollHeight, behavior: streaming ? 'instant' : 'smooth' })
  }, [msgs, streaming])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  // Clean up image object URLs on unmount to avoid memory leaks
  useEffect(() => {
    return () => {
      if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl)
    }
  }, [attachment])

  // ── File attachment ────────────────────────────────────────────────────────

  const openFilePicker = () => fileInputRef.current?.click()

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (readOnly || !canAttach) return
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    if (file.type.startsWith('image/')) {
      setAttachLoading(true)
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        const b64 = dataUrl.split(',')[1]
        setAttachment({
          type: 'image',
          name: file.name,
          previewUrl: URL.createObjectURL(file),
          b64,
        })
        setAttachLoading(false)
      }
      reader.readAsDataURL(file)
    } else if (file.type === 'application/pdf') {
      setAttachLoading(true)
      try {
        const form = new FormData()
        form.append('file', file)
        const r = await fetch(apiUrl('/api/parse/pdf'), { method: 'POST', body: form })
        if (!r.ok) throw new Error(await r.text())
        const data = await r.json()
        setAttachment({ type: 'pdf', name: file.name, text: data.text })
      } catch (err) {
        setToast(`PDF error: ${err instanceof Error ? err.message : 'failed'}`)
      } finally {
        setAttachLoading(false)
      }
    } else {
      setToast('Only PNG, JPEG, and PDF files are supported.')
    }
  }

  const removeAttachment = () => {
    if (attachment?.previewUrl) URL.revokeObjectURL(attachment.previewUrl)
    setAttachment(null)
  }

  // ── Send ──────────────────────────────────────────────────────────────────

  const send = async () => {
    if (readOnly) return
    const text = input.trim()
    if ((!text && !attachment) || streaming) return
    setInput('')
    resetTextareaHeight()

    // Build the prompt and user message
    let prompt = text
    let imageB64: string | undefined
    const att = attachment
    setAttachment(null)

    const userMsg: LocalMessage = {
      role: 'user',
      content: text || `[${att?.name}]`,
      attachmentType: att?.type,
      attachmentName: att?.name,
    }

    if (att?.type === 'image' && att.b64) {
      imageB64 = att.b64
      prompt = text || 'Describe this image.'
    } else if (att?.type === 'pdf' && att.text) {
      prompt = `[PDF: ${att.name}]\n\n${att.text}\n\n---\n\n${text || 'Please summarize this document.'}`
    }

    // Build conversation history from prior messages (exclude system separators)
    // First message → no history → marketplace lookup eligible
    // Subsequent messages → pass history → model gets full context
    const history = msgs
      .filter(m => m.role === 'user' || m.role === 'assistant')
      .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }))

    const isFirst = history.length === 0
    const newTitle = isFirst
      ? (text || att?.name || 'New chat').slice(0, 40)
      : session.title

    // Optimistically add user + empty assistant placeholder
    const placeholder: LocalMessage = { role: 'assistant', content: '', model: session.model }
    const withUser = [...msgs, userMsg, placeholder]
    setMsgs(withUser)
    setStreaming(true)

    // Sync title change to parent immediately
    if (isFirst) onUpdate({ ...session, title: newTitle, messages: [...msgs, userMsg] })

    try {
      if (isGroq) {
        if (!groqApiKey) throw new Error('Groq API key required')

        const groqSessionModel = session.model.startsWith('groq:') ? session.model : `groq:${groqModel}`

        // Try marketplace cache on first message with no attachment
        if (isFirst && !att) {
          try {
            const market = await searchMarketByText(prompt)
            const top = market.results[0]
            if (top && top.mode === 'verbatim') {
              const assistantMsg: LocalMessage = {
                role: 'assistant',
                content: top.response,
                model: groqSessionModel,
                mode: 'verbatim',
                source_author: top.author,
                similarity: top.similarity,
                source_entry_id: top.id,
                published: false,
              }
              const finalMsgs = [...msgs, userMsg, assistantMsg]
              setMsgs(finalMsgs)
              onUpdate({ ...session, model: groqSessionModel, title: newTitle, messages: finalMsgs })
              return
            }
            if (top && top.mode === 'repackage') {
              const data = await groqChat({
                apiKey: groqApiKey,
                model: groqModel,
                messages: [
                  { role: 'system', content: "You are a helpful assistant. Adapt the provided answer to directly address the user's question. Keep it concise and accurate." },
                  { role: 'user', content: `User asked: "${prompt}"\n\nAdapt this similar answer:\n\n${top.response}` },
                ],
                temperature,
              })
              const assistantMsg: LocalMessage = {
                role: 'assistant',
                content: data.content,
                model: groqSessionModel,
                mode: 'repackage',
                source_author: top.author,
                similarity: top.similarity,
                source_entry_id: top.id,
                tokensIn: data.usage?.prompt_tokens,
                tokensOut: data.usage?.completion_tokens,
                toksPerSec: null,
                published: false,
              }
              const finalMsgs = [...msgs, userMsg, assistantMsg]
              setMsgs(finalMsgs)
              onUpdate({ ...session, model: groqSessionModel, title: newTitle, messages: finalMsgs })
              return
            }
          } catch {
            // marketplace unavailable — fall through to full Groq inference
          }
        }

        const groqMessages: GroqChatMessage[] = [
          {
            role: 'system',
            content: [
              'You are a helpful assistant.',
              'Use clear markdown.',
              'For math, use $...$ for inline math and $$ blocks for display math.',
              'Use fenced code blocks with language tags when writing code.',
            ].join(' '),
          },
          ...history.map(m => ({ role: m.role, content: m.content })),
          { role: 'user', content: prompt },
        ]
        const data = await groqChat({
          apiKey: groqApiKey,
          model: groqModel,
          messages: groqMessages,
          temperature,
        })
        const assistantMsg: LocalMessage = {
          role: 'assistant',
          content: data.content,
          model: groqSessionModel,
          mode: 'groq',
          tokensIn: data.usage?.prompt_tokens,
          tokensOut: data.usage?.completion_tokens,
          toksPerSec: null,
          published: false,
        }
        const finalMsgs = [...msgs, userMsg, assistantMsg]
        setMsgs(finalMsgs)
        onUpdate({ ...session, model: groqSessionModel, title: newTitle, messages: finalMsgs })
        return
      }

      const jwt = localStorage.getItem('jwt')
      const r = await fetch(apiUrl('/api/ask/stream'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
        },
        body: JSON.stringify({
          prompt,
          model: session.model,
          image_b64: imageB64,
          history: history.length > 0 ? history : undefined,
          temperature,
          local_only: localOnly,
        }),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({ detail: r.statusText }))
        throw new Error(err.detail || r.statusText)
      }

      const reader = r.body!.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      let accumulated = ''
      let finalMeta: Partial<LocalMessage> = { mode: 'miss' }

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })

        const lines = buf.split('\n')
        buf = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const payload = JSON.parse(line.slice(6))
            if (payload.chunk) {
              accumulated += payload.chunk
              // Update the last message (the placeholder) in real-time
              setMsgs(prev => {
                const updated = [...prev]
                updated[updated.length - 1] = { ...updated[updated.length - 1], content: accumulated }
                return updated
              })
            }
            if (payload.done) {
              finalMeta = {
                mode: payload.mode,
                source_author: payload.source_author,
                similarity: payload.similarity,
                source_entry_id: payload.source_entry_id,
                embedding: payload.embedding,
                tokensIn: payload.tokens_in,
                tokensOut: payload.tokens_out,
                toksPerSec: payload.toks_per_sec ?? null,
              }
            }
          } catch { /* malformed SSE line — skip */ }
        }
      }

      // Finalise the assistant message with metadata + which model generated it
      const assistantMsg: LocalMessage = {
        role: 'assistant',
        content: accumulated,
        model: session.model,
        published: false,
        ...finalMeta,
      }
      const finalMsgs = [...msgs, userMsg, assistantMsg]
      setMsgs(finalMsgs)
      onUpdate({ ...session, title: newTitle, messages: finalMsgs })

    } catch (e) {
      const errMsg: LocalMessage = { role: 'assistant', content: `⚠ ${e instanceof Error ? e.message : 'Connection error'}`, mode: 'miss' }
      const finalMsgs = [...msgs, userMsg, errMsg]
      setMsgs(finalMsgs)
      onUpdate({ ...session, title: newTitle, messages: finalMsgs })
    } finally {
      setStreaming(false)
      textareaRef.current?.focus()
    }
  }

  // ── Publish ───────────────────────────────────────────────────────────────

  const publish = async (msgIdx: number) => {
    const msg = msgs[msgIdx]
    const userMsg = msgs[msgIdx - 1]
    if (!msg || msg.published || !userMsg || userMsg.role !== 'user') return

    setPublishingIdx(msgIdx)
    try {
      const data = await publishMarketEntry({
        prompt: userMsg.content,
        response: msg.content,
        modelUsed: msg.model ?? session.model,
        embedding: msg.embedding ?? [],
        tags: [],
      })
      const earned: number = data.creditsEarned ?? 5
      const updated = msgs.map((m, i) => i === msgIdx ? { ...m, published: true } : m)
      setMsgs(updated)
      onUpdate({ ...session, messages: updated })
      onCreditsEarned(earned)
      setToast(`Published! +${earned} credits`)
    } catch (e) {
      setToast(`Publish failed: ${e instanceof Error ? e.message : 'error'}`)
    } finally {
      setPublishingIdx(null)
    }
  }

  // ── Input helpers ─────────────────────────────────────────────────────────

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const resetTextareaHeight = () => {
    if (textareaRef.current) textareaRef.current.style.height = 'auto'
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px'
  }

  // ── Context fill derived from last assistant message with token data ─────────
  const lastAssistant = [...msgs].reverse().find(m => m.role === 'assistant' && m.tokensIn !== undefined)
  const ctxWindowSize = contextWindowSize(session.model)
  const ctxUsed = lastAssistant ? (lastAssistant.tokensIn ?? 0) + (lastAssistant.tokensOut ?? 0) : 0
  const ctxPct = ctxUsed > 0 ? Math.min(ctxUsed / ctxWindowSize, 1) : 0
  const ctxWarn = ctxWarning(ctxPct)

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="chat">
      {toast && <div className="toast">{toast}</div>}

      {/* Context fill bar — only shown once we have token data */}
      {ctxUsed > 0 && (
        <div className="ctx-bar-wrap">
          <div className="ctx-bar-track">
            <div
              className="ctx-bar-fill"
              style={{ width: `${ctxPct * 100}%`, background: ctxFillColor(ctxPct) }}
            />
          </div>
          <span className="ctx-bar-label" style={{ color: ctxFillColor(ctxPct) }}>
            {Math.round(ctxPct * 100)}% ctx · {ctxUsed.toLocaleString()}/{ctxWindowSize.toLocaleString()} tok
          </span>
        </div>
      )}
      {ctxWarn && (
        <div className="ctx-warning" style={{ borderColor: ctxFillColor(ctxPct), color: ctxFillColor(ctxPct) }}>
          {ctxWarn}
        </div>
      )}

      <div className="messages" ref={messagesRef}>
        {msgs.length === 0 && !streaming && (
          <div className="chat-hint">
            {readOnly ? (
              <>
                This saved chat is available from the cloud.
                <br />Start the local node to continue the conversation.
              </>
            ) : (
              <>
                Ask anything — embed locally, search the marketplace, get an answer.
                <br />Attach an image or PDF with the paperclip.
              </>
            )}
          </div>
        )}

        {msgs.map((m, i) => {
          // ── System separator (model switch) ────────────────────────────────
          if (m.role === 'system') {
            return (
              <div key={i} className="model-separator">
                <span
                  className="model-separator-pill"
                  style={{ '--model-color': modelColor(m.model ?? '') } as React.CSSProperties}
                >
                  {m.content}
                </span>
              </div>
            )
          }

          const msgModel = m.model ?? session.model
          const color = modelColor(msgModel)

          return (
          <div key={i} className={`message ${m.role}`}>
            {/* Mode badge on assistant messages */}
            {m.role === 'assistant' && m.mode && (
              <div className={`mode-badge mode-${m.mode}`}>
                <span>{MODE_LABEL[m.mode]}</span>
                {m.source_author && m.similarity !== undefined && (
                  <span className="mode-meta">
                    from <strong>{m.source_author}</strong>
                    {' · '}{(m.similarity * 100).toFixed(1)}% match
                  </span>
                )}
              </div>
            )}

            <div
              className="message-label"
              style={m.role === 'assistant' ? { color } : undefined}
            >
              {m.role === 'user' ? 'You' : msgModel}
            </div>

            {/* Attachment badge on user messages */}
            {m.role === 'user' && m.attachmentName && (
              <div className={`msg-attachment-badge ${m.attachmentType}`}>
                {m.attachmentType === 'image' ? '🖼' : '📄'} {m.attachmentName}
              </div>
            )}

            <div className="message-content">
              {m.role === 'assistant'
                ? <Markdown content={m.content} />
                : <span>{m.content}</span>
              }
            </div>

            {/* Publish / published */}
            {m.role === 'assistant' && m.mode === 'miss' && !m.published && m.embedding?.length && !readOnly && (
              <button
                className="publish-btn"
                onClick={() => publish(i)}
                disabled={publishingIdx === i}
              >
                {publishingIdx === i ? 'Publishing…' : '↑ Publish to marketplace (+5 credits)'}
              </button>
            )}
            {m.role === 'assistant' && m.published && (
              <span className="published-badge">✓ Published</span>
            )}

            {/* Token stats */}
            {m.role === 'assistant' && m.tokensOut !== undefined && m.tokensOut > 0 && (
              <div className="token-stats">
                <span>{m.tokensOut} out</span>
                {m.tokensIn !== undefined && m.tokensIn > 0 && <span>{m.tokensIn} in</span>}
                {m.toksPerSec != null && <span>{m.toksPerSec} tok/s</span>}
              </div>
            )}
          </div>
          )
        })}

        {/* Streaming in-progress indicator (shown only while waiting for first token) */}
        {streaming && msgs[msgs.length - 1]?.content === '' && (
          <div className="message assistant">
            <div
              className="message-label"
              style={{ color: modelColor(session.model) }}
            >
              {session.model}
            </div>
            <div className="message-content">
              <span className="thinking-dots"><span /><span /><span /></span>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* ── Input area ── */}
      {readOnly && (
        <div className="cloud-readonly-banner">
          Viewing saved cloud chat. Local OpenClaw/Ollama is required to send new messages.
        </div>
      )}
      <div className="input-area">
        {/* Attachment preview */}
        {(attachment || attachLoading) && (
          <div className="attachment-preview">
            {attachLoading ? (
              <span className="attach-loading">Parsing…</span>
            ) : attachment?.type === 'image' && attachment.previewUrl ? (
              <>
                <img src={attachment.previewUrl} alt={attachment.name} className="attach-thumb" />
                <span className="attach-name">{attachment.name}</span>
                <button className="attach-remove" onClick={removeAttachment}>✕</button>
              </>
            ) : (
              <>
                <span className="attach-icon">📄</span>
                <span className="attach-name">{attachment?.name}</span>
                <button className="attach-remove" onClick={removeAttachment}>✕</button>
              </>
            )}
          </div>
        )}

        <div className="input-row">
          <button
            className="attach-btn"
            onClick={openFilePicker}
            disabled={readOnly || streaming || attachLoading || !canAttach}
            title={canAttach ? 'Attach image (PNG/JPEG) or PDF' : 'Attachments require the local node'}
          >
            ⊕
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg,application/pdf"
            style={{ display: 'none' }}
            onChange={handleFile}
          />

          <textarea
            ref={textareaRef}
            className="input-box"
            value={input}
            onChange={handleInputChange}
            onKeyDown={onKeyDown}
            placeholder={
              readOnly
                ? 'Local node offline — saved chat is read-only'
                : isGroq
                ? 'Ask with Groq fallback…'
                : attachment
                ? `Add a message for ${attachment.name}… (or press Enter)`
                : 'Ask anything… (Enter to send, Shift+Enter for newline)'
            }
            rows={1}
            disabled={readOnly || streaming}
          />

          <button
            className="send-btn"
            onClick={send}
            disabled={readOnly || streaming || (!input.trim() && !attachment)}
          >
            {streaming ? '◼' : '↑'}
          </button>
        </div>
      </div>
    </div>
  )
}
