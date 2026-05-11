import { useEffect, useState } from 'react'
import { me, updateMe } from '../api/cloud'
import './ProfilePage.css'

interface ProfileUser {
  id: string
  username: string
  email: string
  displayName: string | null
  credits: number
}

interface Props {
  onCreditsChange?: (credits: number) => void
}

export default function ProfilePage({ onCreditsChange }: Props) {
  const [user, setUser] = useState<ProfileUser | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    let alive = true
    setLoading(true)
    me()
      .then((data: ProfileUser) => {
        if (!alive) return
        setUser(data)
        setDisplayName(data.displayName ?? data.username)
        onCreditsChange?.(data.credits)
      })
      .catch(err => {
        if (!alive) return
        setError(err instanceof Error ? err.message : 'Unable to load account')
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => { alive = false }
  }, [onCreditsChange])

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (newPassword || confirmPassword || currentPassword) {
      if (newPassword !== confirmPassword) {
        setError('New passwords do not match')
        return
      }
      if (newPassword.length < 8) {
        setError('New password must be at least 8 characters')
        return
      }
      if (!currentPassword) {
        setError('Current password is required to change your password')
        return
      }
    }

    setSaving(true)
    try {
      const body: Record<string, string> = { displayName }
      if (newPassword) {
        body.currentPassword = currentPassword
        body.newPassword = newPassword
      }

      const updated = await updateMe(body)
      setUser(updated)
      setDisplayName(updated.displayName ?? updated.username)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      onCreditsChange?.(updated.credits)
      setSuccess('Account updated')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unable to save account')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="profile-page">
        <div className="profile-shell">
          <span className="profile-kicker">Account</span>
          <h1>Loading profile</h1>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="profile-page">
        <div className="profile-shell">
          <span className="profile-kicker">Account</span>
          <h1>Profile unavailable</h1>
          {error && <div className="profile-alert error">{error}</div>}
        </div>
      </div>
    )
  }

  return (
    <div className="profile-page">
      <form className="profile-shell" onSubmit={saveProfile}>
        <div className="profile-heading">
          <div>
            <span className="profile-kicker">Account</span>
            <h1>{user.displayName || user.username}</h1>
          </div>
          <div className="profile-credit">{user.credits} cr</div>
        </div>

        <section className="profile-section">
          <h2>Profile</h2>
          <div className="profile-grid">
            <label>
              <span>Username</span>
              <input type="text" value={user.username} disabled />
            </label>
            <label>
              <span>Email</span>
              <input type="email" value={user.email} disabled />
            </label>
            <label className="wide">
              <span>Display name</span>
              <input
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                maxLength={128}
                placeholder={user.username}
              />
            </label>
          </div>
        </section>

        <section className="profile-section">
          <h2>Password</h2>
          <div className="profile-grid">
            <label>
              <span>Current password</span>
              <input
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
              />
            </label>
            <label>
              <span>New password</span>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                minLength={8}
                autoComplete="new-password"
              />
            </label>
            <label>
              <span>Confirm new password</span>
              <input
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                minLength={8}
                autoComplete="new-password"
              />
            </label>
          </div>
        </section>

        {error && <div className="profile-alert error">{error}</div>}
        {success && <div className="profile-alert success">{success}</div>}

        <div className="profile-actions">
          <button type="submit" disabled={saving}>
            {saving ? 'Saving...' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  )
}
