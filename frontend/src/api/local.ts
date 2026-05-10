export function localApiBase(): string {
  const saved = localStorage.getItem('mm_local_api')
  if (saved) return saved.replace(/\/$/, '')

  const host = window.location.hostname
  const isLocal =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === ''

  // Local dev/docker can use Vite/nginx same-origin proxy.
  // Hosted web UI should call the user's local MeshMind node directly.
  return isLocal ? '' : 'http://127.0.0.1:8000'
}

export function apiUrl(path: string): string {
  return `${localApiBase()}${path}`
}
