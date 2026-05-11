// Spring Boot backend — set VITE_CLOUD_URL in .env.local to override.
// The hosted frontend must work without OpenClaw, so default to the Render API.
export const CLOUD = (import.meta.env.VITE_CLOUD_URL ?? 'https://meshmind-g3am.onrender.com').replace(/\/$/, '')

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
    let message = text || `${res.status}`
    try {
      const data = JSON.parse(text)
      message = data.error ?? data.detail ?? message
    } catch {}
    throw new Error(message)
  }
  return res.json()
}

async function reqWithHeaders<T>(
  method: string,
  path: string,
  extraHeaders: Record<string, string>,
  body?: unknown,
): Promise<T> {
  const res = await fetch(`${CLOUD}${path}`, {
    method,
    headers: {
      ...headers(!!body),
      ...extraHeaders,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const text = await res.text()
    let message = text || `${res.status}`
    try {
      const data = JSON.parse(text)
      message = data.error ?? data.detail ?? message
    } catch {}
    throw new Error(message)
  }
  return res.json()
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export interface CloudUser {
  id: string
  username: string
  email: string
  displayName: string | null
  credits: number
  avatarUrl?: string | null
}

export interface AuthResponse {
  token: string
  user: CloudUser
}

function storeAuth(data: AuthResponse) {
  localStorage.setItem('jwt', data.token)
  localStorage.setItem('cloudUser', JSON.stringify(data.user))
  localStorage.setItem('mm_user', JSON.stringify(data.user))
}

export async function register(username: string, email: string, password: string): Promise<AuthResponse> {
  const data = await req<AuthResponse>('POST', '/api/auth/register', { username, email, password })
  storeAuth(data)
  return data
}

export async function login(username: string, password: string): Promise<AuthResponse> {
  const data = await req<AuthResponse>('POST', '/api/auth/login', { username, password })
  storeAuth(data)
  return data
}

export function logout() {
  localStorage.removeItem('jwt')
  localStorage.removeItem('cloudUser')
  localStorage.removeItem('mm_user')
}

export function getStoredUser(): CloudUser | null {
  const raw = localStorage.getItem('cloudUser')
  return raw ? JSON.parse(raw) : null
}

export function isLoggedIn(): boolean {
  return !!localStorage.getItem('jwt')
}

export async function me(): Promise<CloudUser> {
  const user = await req<CloudUser>('GET', '/api/users/me')
  localStorage.setItem('cloudUser', JSON.stringify(user))
  localStorage.setItem('mm_user', JSON.stringify(user))
  return user
}

export async function updateMe(body: {
  displayName?: string
  currentPassword?: string
  newPassword?: string
}): Promise<CloudUser> {
  const user = await req<CloudUser>('PUT', '/api/users/me', body)
  localStorage.setItem('cloudUser', JSON.stringify(user))
  localStorage.setItem('mm_user', JSON.stringify(user))
  return user
}

export async function deleteMe(currentPassword: string): Promise<void> {
  await req('DELETE', '/api/users/me', { currentPassword })
}

// ── Cloud chat history ──────────────────────────────────────────────────────

export interface CloudMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  [key: string]: unknown
}

export interface CloudChat {
  id: string
  title: string
  model: string | null
  messages: CloudMessage[]
  createdAt: string
  updatedAt: string
}

export async function getChats(): Promise<CloudChat[]> {
  return req('GET', '/api/chats')
}

export async function saveChat(chat: {
  id: string
  title: string
  model: string
  messages: CloudMessage[]
}): Promise<CloudChat> {
  return req('POST', '/api/chats', chat)
}

export async function deleteChat(id: string): Promise<void> {
  await req('DELETE', `/api/chats/${id}`)
}

// ── Marketplace ─────────────────────────────────────────────────────────────

export interface MarketSearchResult {
  id: string
  author: string
  prompt: string
  response: string
  modelUsed: string
  similarity: number
  mode: 'verbatim' | 'repackage' | 'miss'
  consumeCount: number
}

export async function searchMarketByText(
  text: string,
  k = 3,
): Promise<{ results: MarketSearchResult[] }> {
  return req('POST', '/api/market/search/text', { text, k })
}

export async function publishMarketEntry(body: {
  prompt: string
  response: string
  modelUsed?: string
  embedding: number[]
  tags?: string[]
}): Promise<{ id: string; creditsEarned: number }> {
  return req('POST', '/api/market/publish', body)
}

// ── Groq fallback ───────────────────────────────────────────────────────────

export interface GroqChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface GroqChatResponse {
  content: string
  model: string
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

export async function groqChat(body: {
  apiKey: string
  model: string
  messages: GroqChatMessage[]
  temperature: number
}): Promise<GroqChatResponse> {
  return reqWithHeaders('POST', '/api/groq/chat', { 'X-Groq-Api-Key': body.apiKey }, {
    model: body.model,
    messages: body.messages,
    temperature: body.temperature,
  })
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
  return req('POST', '/api/groups', { name, description, publicGroup: isPublic })
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
