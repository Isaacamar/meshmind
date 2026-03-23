import { useState, useEffect, useRef } from 'react'
import Chat from './components/Chat'
import AuthPage from './components/AuthPage'
import GroupsPanel from './components/GroupsPanel'
import GroupChat from './components/GroupChat'
import { isLoggedIn, getStoredUser, logout, heartbeat, type Group } from './api/cloud'
import './App.css'

interface Session {
  id: string
  title: string
  model: string
  created_at: string
}

export default function App() {
  const [authed, setAuthed] = useState(isLoggedIn())
  const user = getStoredUser()

  const [sessions, setSessions] = useState<Session[]>([])
  const [activeSession, setActiveSession] = useState<string | null>(null)
  const [activeGroup, setActiveGroup] = useState<Group | null>(null)
  const [models, setModels] = useState<string[]>([])
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [ollamaOk, setOllamaOk] = useState<boolean | null>(null)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Load models + sessions on mount / after login
  useEffect(() => {
    if (!authed) return

    fetch('/api/models')
      .then(r => r.json())
      .then(d => {
        setModels(d.models || [])
        if (d.models?.length) setSelectedModel(d.models[0])
        setOllamaOk(true)
        // Send first heartbeat with current model list
        heartbeat(d.models || [], 24.0).catch(() => {})
      })
      .catch(() => setOllamaOk(false))

    fetch('/api/sessions')
      .then(r => r.json())
      .then(setSessions)
      .catch(() => {})

    // Heartbeat every 60s while logged in
    heartbeatRef.current = setInterval(() => {
      heartbeat(models, 24.0).catch(() => {})
    }, 60_000)

    return () => {
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
    }
  }, [authed])

  const handleAuth = () => setAuthed(true)

  const handleLogout = () => {
    if (heartbeatRef.current) clearInterval(heartbeatRef.current)
    logout()
    setAuthed(false)
    setSessions([])
    setActiveSession(null)
    setActiveGroup(null)
  }

  const openGroup = (group: Group) => {
    setActiveGroup(group)
    setActiveSession(null)
  }

  const openSession = (id: string) => {
    setActiveSession(id)
    setActiveGroup(null)
  }

  const newSession = async () => {
    if (!selectedModel) return
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: selectedModel, title: 'New Chat' }),
    })
    const s = await res.json()
    setSessions(prev => [s, ...prev])
    setActiveSession(s.id)
  }

  const deleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    await fetch(`/api/sessions/${id}`, { method: 'DELETE' })
    setSessions(prev => prev.filter(s => s.id !== id))
    if (activeSession === id) setActiveSession(null)
  }

  if (!authed) return <AuthPage onAuth={handleAuth} />

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <span className="logo">⬡ MeshMind</span>
          <div className="user-info">
            <span className="user-name">{user?.username}</span>
            <button className="logout-btn" onClick={handleLogout} title="Log out">↪</button>
          </div>
        </div>

        {ollamaOk === false && (
          <div className="ollama-warn">
            ⚠ Ollama not running<br />
            <code>OLLAMA_HOST=0.0.0.0 ollama serve</code>
          </div>
        )}

        <div className="model-select">
          <label>Model</label>
          <select value={selectedModel} onChange={e => setSelectedModel(e.target.value)}>
            {models.length === 0 && <option>No models found</option>}
            {models.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <button className="new-chat-btn" onClick={newSession} disabled={!selectedModel}>
          + New Chat
        </button>

        <div className="session-list">
          {sessions.map(s => (
            <div
              key={s.id}
              className={`session-item ${s.id === activeSession ? 'active' : ''}`}
              onClick={() => openSession(s.id)}
            >
              <span className="session-title">{s.title}</span>
              <span className="session-model">{s.model}</span>
              <button className="delete-btn" onClick={e => deleteSession(s.id, e)}>✕</button>
            </div>
          ))}
        </div>

        <GroupsPanel onSelectGroup={openGroup} activeGroupId={activeGroup?.id ?? null} />
      </aside>

      <main className="main">
        {activeGroup
          ? <GroupChat group={activeGroup} model={selectedModel} />
          : activeSession
          ? <Chat sessionId={activeSession} model={selectedModel} />
          : (
            <div className="empty-state">
              <div className="empty-icon">⬡</div>
              <h2>Welcome, {user?.username}</h2>
              <p>Privacy-first local AI — your conversations never leave this machine.</p>
              {selectedModel
                ? <button className="start-btn" onClick={newSession}>Start a chat with {selectedModel}</button>
                : <p className="hint">Start Ollama and pull a model:<br /><code>ollama pull llama3.2:3b</code></p>
              }
            </div>
          )
        }
      </main>
    </div>
  )
}
