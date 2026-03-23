import { useState, useEffect } from 'react'
import {
  getMyGroups, createGroup, inviteToGroup,
  getPublicGroups, joinGroup,
  type Group,
} from '../api/cloud'
import './GroupsPanel.css'

interface Props {
  onSelectGroup: (group: Group) => void
  activeGroupId: string | null
}

export default function GroupsPanel({ onSelectGroup, activeGroupId }: Props) {
  const [tab, setTab] = useState<'mine' | 'browse'>('mine')
  const [groups, setGroups] = useState<Group[]>([])
  const [publicGroups, setPublicGroups] = useState<Group[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [showInvite, setShowInvite] = useState<string | null>(null)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupDesc, setNewGroupDesc] = useState('')
  const [newGroupPublic, setNewGroupPublic] = useState(false)
  const [inviteUsername, setInviteUsername] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    getMyGroups().then(setGroups).catch(() => {})
  }, [])

  useEffect(() => {
    if (tab === 'browse') {
      getPublicGroups().then(setPublicGroups).catch(() => {})
    }
  }, [tab])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      const g = await createGroup(newGroupName, newGroupDesc, newGroupPublic)
      setGroups(prev => [g, ...prev])
      setNewGroupName('')
      setNewGroupDesc('')
      setNewGroupPublic(false)
      setShowCreate(false)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create group')
    }
  }

  const handleInvite = async (e: React.FormEvent, groupId: string) => {
    e.preventDefault()
    setError('')
    try {
      await inviteToGroup(groupId, inviteUsername)
      setInviteUsername('')
      setShowInvite(null)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to invite')
    }
  }

  const handleJoin = async (groupId: string) => {
    setError('')
    try {
      await joinGroup(groupId)
      // Refresh both lists
      const [mine, pub] = await Promise.all([getMyGroups(), getPublicGroups()])
      setGroups(mine)
      setPublicGroups(pub)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to join group')
    }
  }

  const myGroupIds = new Set(groups.map(g => g.id))

  return (
    <div className="groups-panel">
      <div className="groups-header">
        <span className="groups-label">Peer Groups</span>
        {tab === 'mine' && (
          <button className="groups-add-btn" onClick={() => setShowCreate(v => !v)} title="New group">+</button>
        )}
      </div>

      <div className="groups-tabs">
        <button className={`groups-tab ${tab === 'mine' ? 'active' : ''}`} onClick={() => setTab('mine')}>My Groups</button>
        <button className={`groups-tab ${tab === 'browse' ? 'active' : ''}`} onClick={() => setTab('browse')}>Browse</button>
      </div>

      {tab === 'mine' && showCreate && (
        <form className="groups-form" onSubmit={handleCreate}>
          <input
            placeholder="Group name"
            value={newGroupName}
            onChange={e => setNewGroupName(e.target.value)}
            required
            autoFocus
          />
          <input
            placeholder="Description (optional)"
            value={newGroupDesc}
            onChange={e => setNewGroupDesc(e.target.value)}
          />
          <label className="groups-toggle">
            <input
              type="checkbox"
              checked={newGroupPublic}
              onChange={e => setNewGroupPublic(e.target.checked)}
            />
            Public (anyone can join)
          </label>
          {error && <div className="groups-error">{error}</div>}
          <div className="groups-form-actions">
            <button type="submit">Create</button>
            <button type="button" onClick={() => setShowCreate(false)}>Cancel</button>
          </div>
        </form>
      )}

      {tab === 'mine' && (
        <div className="groups-list">
          {groups.length === 0 && (
            <div className="groups-empty">No groups yet.<br />Create one or browse public groups.</div>
          )}
          {groups.map(g => (
            <div key={g.id} className="group-item">
              <div
                className={`group-row ${g.id === activeGroupId ? 'active' : ''}`}
                onClick={() => onSelectGroup(g)}
                title="Open group chat"
              >
                <span className="group-name">{g.name}</span>
                <button
                  className="group-invite-btn"
                  onClick={e => { e.stopPropagation(); setShowInvite(g.id); setError('') }}
                  title="Invite user"
                >
                  +
                </button>
              </div>

              {showInvite === g.id && (
                <form className="invite-form" onSubmit={e => handleInvite(e, g.id)}>
                  <input
                    placeholder="Username to invite"
                    value={inviteUsername}
                    onChange={e => setInviteUsername(e.target.value)}
                    autoFocus
                    required
                  />
                  {error && <div className="groups-error">{error}</div>}
                  <div className="groups-form-actions">
                    <button type="submit">Invite</button>
                    <button type="button" onClick={() => setShowInvite(null)}>Cancel</button>
                  </div>
                </form>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === 'browse' && (
        <div className="groups-list">
          {publicGroups.length === 0 && (
            <div className="groups-empty">No public groups yet.</div>
          )}
          {error && <div className="groups-error">{error}</div>}
          {publicGroups.map(g => (
            <div key={g.id} className="group-item">
              <div className="group-row">
                <span className="group-name">{g.name}</span>
                {myGroupIds.has(g.id)
                  ? <span className="group-joined-badge">Joined</span>
                  : (
                    <button
                      className="group-join-btn"
                      onClick={() => handleJoin(g.id)}
                    >
                      Join
                    </button>
                  )
                }
              </div>
              {g.description && <div className="group-desc">{g.description}</div>}
              <div className="group-owner">by {g.ownerUsername}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
