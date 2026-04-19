import { useState, useEffect } from 'react'
import AuthPage from './components/AuthPage'
import Chat from './components/Chat'
import { modelTags, TAG_COLORS, tempLabel, tempColor } from './utils/models'
import './App.css'

export interface LocalMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  // Which model generated this response (assistant messages only)
  model?: string
  mode?: 'verbatim' | 'repackage' | 'miss'
  source_author?: string
  similarity?: number
  source_entry_id?: string
  embedding?: number[]
  published?: boolean
  // Attachment metadata (name/type only — raw bytes are not persisted)
  attachmentType?: 'image' | 'pdf'
  attachmentName?: string
  // Token usage (assistant messages only)
  tokensIn?: number
  tokensOut?: number
  toksPerSec?: number | null
}

export interface LocalSession {
  id: string
  title: string
  model: string
  messages: LocalMessage[]
  created_at: string
}

function loadSessions(): LocalSession[] {
  try {
    return JSON.parse(localStorage.getItem('mm_sessions') ?? '[]')
  } catch {
    return []
  }
}

function saveSessions(sessions: LocalSession[]) {
  localStorage.setItem('mm_sessions', JSON.stringify(sessions))
}

function getStoredUser(): { username: string } | null {
  try {
    return JSON.parse(localStorage.getItem('mm_user') ?? 'null')
  } catch {
    return null
  }
}

export default function App() {
  const [authed, setAuthed] = useState(() => !!getStoredUser())
  const [username, setUsername] = useState(() => getStoredUser()?.username ?? '')
  const [credits, setCredits] = useState<number | null>(null)

  const [sessions, setSessions] = useState<LocalSession[]>(loadSessions)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const [models, setModels] = useState<string[]>([])
  const [selectedModel, setSelectedModel] = useState('')
  const [ollamaOk, setOllamaOk] = useState<boolean | null>(null)
  const [temperature, setTemperature] = useState(0.7)

  // Load models + credits on login
  useEffect(() => {
    if (!authed) return
    fetch('/api/models')
      .then(r => r.json())
      .then(d => {
        const list: string[] = d.models ?? []
        setModels(list)
        if (list.length) setSelectedModel(list[0])
        setOllamaOk(list.length > 0)
      })
      .catch(() => setOllamaOk(false))

    fetch('/api/me')
      .then(r => r.json())
      .then(d => setCredits(d.credits ?? null))
      .catch(() => {})
  }, [authed])

  // Persist sessions to localStorage whenever they change
  useEffect(() => {
    saveSessions(sessions)
  }, [sessions])

  // Sync dropdown to the active session's model when switching sessions
  useEffect(() => {
    if (activeId) {
      const s = sessions.find(s => s.id === activeId)
      if (s && s.model && models.includes(s.model)) setSelectedModel(s.model)
    }
  }, [activeId])

  const handleAuth = (user: string) => {
    setUsername(user)
    setAuthed(true)
  }

  const handleLogout = async () => {
    await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: '', password: '' }) }).catch(() => {})
    localStorage.removeItem('mm_user')
    setAuthed(false)
    setUsername('')
    setCredits(null)
    setActiveId(null)
  }

  const newSession = () => {
    if (!selectedModel) return
    const s: LocalSession = {
      id: crypto.randomUUID(),
      title: 'New chat',
      model: selectedModel,
      messages: [],
      created_at: new Date().toISOString(),
    }
    setSessions(prev => [s, ...prev])
    setActiveId(s.id)
  }

  const updateSession = (updated: LocalSession) => {
    setSessions(prev => prev.map(s => s.id === updated.id ? updated : s))
  }

  const deleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSessions(prev => prev.filter(s => s.id !== id))
    if (activeId === id) setActiveId(null)
  }

  const startRename = (s: LocalSession, e: React.MouseEvent) => {
    e.stopPropagation()
    setRenamingId(s.id)
    setRenameValue(s.title)
  }

  const commitRename = (id: string) => {
    const title = renameValue.trim()
    if (title) setSessions(prev => prev.map(s => s.id === id ? { ...s, title } : s))
    setRenamingId(null)
  }

  const onCreditsEarned = (earned: number) => {
    setCredits(prev => (prev ?? 0) + earned)
  }

  const activeSession = sessions.find(s => s.id === activeId) ?? null

  if (!authed) return <AuthPage onAuth={handleAuth} />

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <span className="logo">⬡ MeshMind</span>
          <div className="user-info">
            <span className="user-name">{username}</span>
            {credits !== null && (
              <span className="credits-badge" title="Marketplace credits">{credits} cr</span>
            )}
            <button className="logout-btn" onClick={handleLogout} title="Log out">↪</button>
          </div>
        </div>

        {ollamaOk === false && (
          <div className="ollama-warn">
            ⚠ Ollama not running<br />
            <code>ollama serve</code>
          </div>
        )}

        <div className="model-select">
          <label>Model</label>
          <select value={selectedModel} onChange={e => {
            const newModel = e.target.value
            setSelectedModel(newModel)
            if (activeId) {
              setSessions(prev => prev.map(s => {
                if (s.id !== activeId) return s
                // Only insert separator if we actually changed the model and the
                // session already has messages (no point flagging a switch on an empty chat)
                const changed = s.model !== newModel
                const hasMessages = s.messages.length > 0
                const separator: LocalMessage | null =
                  changed && hasMessages
                    ? { role: 'system', content: `Switched to ${newModel}`, model: newModel }
                    : null
                return {
                  ...s,
                  model: newModel,
                  messages: separator ? [...s.messages, separator] : s.messages,
                }
              }))
            }
          }}>
            {models.length === 0 && <option>No models found</option>}
            {models.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          {selectedModel && (
            <div className="model-tags">
              {modelTags(selectedModel).map(tag => (
                <span
                  key={tag}
                  className="model-tag-pill"
                  style={{ color: TAG_COLORS[tag], borderColor: TAG_COLORS[tag] }}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="temp-slider-wrap">
          <div className="temp-slider-header">
            <label>Temperature</label>
            <span className="temp-label" style={{ color: tempColor(temperature) }}>
              {tempLabel(temperature)} · {temperature.toFixed(2)}
            </span>
          </div>
          <input
            type="range"
            min={0} max={2} step={0.05}
            value={temperature}
            onChange={e => setTemperature(parseFloat(e.target.value))}
            className="temp-slider"
            style={{ '--thumb-color': tempColor(temperature) } as React.CSSProperties}
          />
          <div className="temp-ticks">
            <span>Precise</span><span>Balanced</span><span>Creative</span><span>Chaotic</span>
          </div>
        </div>

        <button className="new-chat-btn" onClick={newSession} disabled={!selectedModel}>
          + New Chat
        </button>

        <div className="session-list">
          {sessions.map(s => (
            <div
              key={s.id}
              className={`session-item ${s.id === activeId ? 'active' : ''}`}
              onClick={() => setActiveId(s.id)}
            >
              {renamingId === s.id ? (
                <input
                  className="session-rename-input"
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onBlur={() => commitRename(s.id)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitRename(s.id)
                    if (e.key === 'Escape') setRenamingId(null)
                  }}
                  onClick={e => e.stopPropagation()}
                  autoFocus
                />
              ) : (
                <span className="session-title" onDoubleClick={e => startRename(s, e)}>{s.title}</span>
              )}
              <span className="session-model">{s.model.split(':')[0]}</span>
              <button className="delete-btn" onClick={e => deleteSession(s.id, e)}>✕</button>
            </div>
          ))}
        </div>
      </aside>

      <main className="main">
        {activeSession ? (
          <Chat
            key={activeSession.id}
            session={activeSession}
            onUpdate={updateSession}
            onCreditsEarned={onCreditsEarned}
            temperature={temperature}
          />
        ) : (
          <div className="empty-state">
            <div className="empty-icon">⬡</div>
            <h2>Welcome, {username}</h2>
            <p>Your questions are embedded locally. Only you decide what gets shared.</p>
            {selectedModel
              ? <button className="start-btn" onClick={newSession}>Start a chat with {selectedModel}</button>
              : <p className="hint">Pull a model: <code>ollama pull qwen2.5-coder:14b</code></p>
            }
          </div>
        )}
      </main>
    </div>
  )
}
