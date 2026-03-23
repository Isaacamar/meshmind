// Spring Boot backend — set VITE_CLOUD_URL in .env.local to override
const CLOUD = import.meta.env.VITE_CLOUD_URL ?? 'http://localhost:8080'

function headers(json = false) {
  const token = localStorage.getItem('jwt')
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${CLOUD}${path}`, {
    method,
    headers: headers(!!body),
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `${res.status}`)
  }
  return res.json()
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export interface CloudUser {
  id: string
  username: string
  email: string
  displayName: string | null
  avatarUrl: string | null
}

export async function register(username: string, email: string, password: string): Promise<CloudUser> {
  return req('POST', '/api/auth/register', { username, email, password })
}

export async function login(username: string, password: string): Promise<{ token: string; user: CloudUser }> {
  const data = await req<{ token: string; user: CloudUser }>('POST', '/api/auth/login', { username, password })
  localStorage.setItem('jwt', data.token)
  localStorage.setItem('cloudUser', JSON.stringify(data.user))
  return data
}

export function logout() {
  localStorage.removeItem('jwt')
  localStorage.removeItem('cloudUser')
}

export function getStoredUser(): CloudUser | null {
  const raw = localStorage.getItem('cloudUser')
  return raw ? JSON.parse(raw) : null
}

export function isLoggedIn(): boolean {
  return !!localStorage.getItem('jwt')
}

// ── Nodes ────────────────────────────────────────────────────────────────────

export async function heartbeat(modelList: string[], vramGb: number) {
  return req('POST', '/api/nodes/heartbeat', { modelList, vramGb })
}

// ── Groups ───────────────────────────────────────────────────────────────────

export interface Group {
  id: string
  name: string
  description: string | null
  ownerId: string
  ownerUsername: string
  createdAt: string
}

export async function getMyGroups(): Promise<Group[]> {
  return req('GET', '/api/groups/mine')
}

export async function createGroup(name: string, description: string, isPublic = false): Promise<Group> {
  return req('POST', '/api/groups', { name, description, isPublic })
}

export async function inviteToGroup(groupId: string, username: string): Promise<void> {
  return req('POST', `/api/groups/${groupId}/invite`, { username })
}

export async function getPublicGroups(): Promise<Group[]> {
  return req('GET', '/api/groups/public')
}

export async function joinGroup(groupId: string): Promise<void> {
  return req('POST', `/api/groups/${groupId}/join`, {})
}

export interface GroupMessage {
  id: string
  groupId: string
  userId: string
  username: string
  content: string
  isAi: boolean
  modelName: string | null
  createdAt: string
}

export async function getGroupMessages(groupId: string): Promise<GroupMessage[]> {
  return req('GET', `/api/groups/${groupId}/messages`)
}

export async function postGroupMessage(
  groupId: string,
  content: string,
  isAi = false,
  modelName?: string,
): Promise<GroupMessage> {
  return req('POST', `/api/groups/${groupId}/messages`, { content, isAi, modelName })
}

export interface OnlineNode {
  id: string
  userId: string
  username: string
  modelList: string[]
  vramGb: number | null
  lastSeen: string
}

export async function getOnlineNodes(groupId: string): Promise<OnlineNode[]> {
  return req('GET', `/api/nodes/${groupId}`)
}
