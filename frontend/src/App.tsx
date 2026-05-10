import { useState, useEffect } from 'react'
import AuthPage from './components/AuthPage'
import Chat from './components/Chat'
import { apiUrl } from './api/local'
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

interface LocalStatus {
  ok: boolean
  ollama: string
  ollamaUrl: string
  cloudUrl: string
  installedModels: string[]
  requiredModels: string[]
  recommendedModels: string[]
  missingRequired: string[]
  missingRecommended: string[]
  error?: string
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
  const [localStatus, setLocalStatus] = useState<LocalStatus | null>(null)
  const [installingModel, setInstallingModel] = useState<string | null>(null)
  const [showModelBrowser, setShowModelBrowser] = useState(false)
  const [customModel, setCustomModel] = useState('')
  const [temperature, setTemperature] = useState(0.7)
  const [localOnly, setLocalOnly] = useState(() => localStorage.getItem('mm_local_only') === '1')

  const RECOMMENDED = [
    { name: 'llama3.2:3b',      size: '~2 GB', desc: 'Fast general chat' },
    { name: 'mistral:7b',       size: '~4 GB', desc: 'Great general-purpose' },
    { name: 'qwen2.5-coder:7b', size: '~4 GB', desc: 'Code generation' },
    { name: 'llava:7b',         size: '~5 GB', desc: 'Vision / images' },
    { name: 'phi4:14b',         size: '~8 GB', desc: 'Math & reasoning' },
    { name: 'gemma3:12b',       size: '~7 GB', desc: 'Well-rounded' },
  ]

  const refreshLocalStatus = async () => {
    try {
      const r = await fetch(apiUrl('/api/local/status'))
      const data = await r.json()
      setLocalStatus(data)
      setOllamaOk(data.ok)
      return data as LocalStatus
    } catch {
      setOllamaOk(false)
      setLocalStatus(null)
      return null
    }
  }

  const refreshModels = async () => {
    try {
      const r = await fetch(apiUrl('/api/models'))
      const d = await r.json()
      const list: string[] = d.models ?? []
      setModels(list)
      if (list.length && !selectedModel) setSelectedModel(list[0])
      return list
    } catch {
      setModels([])
      return []
    }
  }

  const installModel = async (model: string) => {
    setInstallingModel(model)
    try {
      const r = await fetch(apiUrl('/api/models/pull'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model }),
      })
      if (!r.ok || !r.body) throw new Error(await r.text())
      const reader = r.body.getReader()
      while (true) {
        const { done } = await reader.read()
        if (done) break
      }
      await refreshLocalStatus()
      await refreshModels()
    } catch {
      setOllamaOk(false)
    } finally {
      setInstallingModel(null)
    }
  }

  const installRequiredModels = async () => {
    const status = localStatus ?? await refreshLocalStatus()
    for (const model of status?.missingRequired ?? []) {
      await installModel(model)
    }
  }

  // Load models + credits on login
  useEffect(() => {
    if (!authed) return
    refreshLocalStatus()
    refreshModels()

    fetch(apiUrl('/api/me'))
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
    await fetch(apiUrl('/api/login'), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: '', password: '' }) }).catch(() => {})
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
            <strong>Local node not ready</strong>
            {localStatus?.ollama === 'unreachable' ? (
              <>
                <span>Ollama is not running. Start it, then refresh.</span>
                <code>ollama serve</code>
                <small>Don't have Ollama? Run <code>python local_node.py</code> in the repo.</small>
              </>
            ) : (
              <>
                <span>Missing: <strong>nomic-embed-text</strong> (required for search)</span>
                <button
                  className="setup-btn"
                  onClick={installRequiredModels}
                  disabled={!!installingModel}
                >
                  {installingModel ? `Installing ${installingModel}…` : 'Install now'}
                </button>
              </>
            )}
            <button className="setup-btn secondary" onClick={() => { refreshLocalStatus(); refreshModels() }}>
              Refresh
            </button>
          </div>
        )}

        <div className="model-select">
          <div className="model-select-header">
            <label>Model</label>
            <button
              className="model-browser-toggle"
              onClick={() => setShowModelBrowser(v => !v)}
              title="Browse and download models"
            >
              {showModelBrowser ? '▲ hide' : '+ get models'}
            </button>
          </div>
          {showModelBrowser && (
            <div className="model-browser">
              {RECOMMENDED.map(m => {
                const installed = localStatus?.installedModels?.some(
                  n => n === m.name || n.split(':')[0] === m.name.split(':')[0]
                )
                return (
                  <div key={m.name} className="model-browser-row">
                    <div className="model-browser-info">
                      <span className="model-browser-name">{m.name}</span>
                      <span className="model-browser-meta">{m.size} · {m.desc}</span>
                    </div>
                    {installed ? (
                      <span className="model-installed-tick">✓</span>
                    ) : (
                      <button
                        className="model-pull-btn"
                        onClick={() => installModel(m.name)}
                        disabled={!!installingModel || localStatus?.ollama === 'unreachable'}
                      >
                        {installingModel === m.name ? '…' : 'Pull'}
                      </button>
                    )}
                  </div>
                )
              })}
              <div className="model-browser-custom">
                <input
                  className="model-custom-input"
                  placeholder="any ollama model, e.g. deepseek-r1:7b"
                  value={customModel}
                  onChange={e => setCustomModel(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && customModel.trim()) {
                      installModel(customModel.trim())
                      setCustomModel('')
                    }
                  }}
                />
                <button
                  className="model-pull-btn"
                  onClick={() => { if (customModel.trim()) { installModel(customModel.trim()); setCustomModel('') } }}
                  disabled={!customModel.trim() || !!installingModel || localStatus?.ollama === 'unreachable'}
                >
                  Pull
                </button>
              </div>
              {installingModel && (
                <small className="model-installing-label">Installing {installingModel}…</small>
              )}
            </div>
          )}
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

        <div className="local-only-toggle">
          <label className="local-only-label">
            <span>Local only</span>
            <span className="local-only-desc">skip marketplace, always infer locally</span>
          </label>
          <button
            className={`toggle-btn ${localOnly ? 'on' : 'off'}`}
            onClick={() => {
              const next = !localOnly
              setLocalOnly(next)
              localStorage.setItem('mm_local_only', next ? '1' : '0')
            }}
          >
            {localOnly ? 'ON' : 'OFF'}
          </button>
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
            localOnly={localOnly}
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
