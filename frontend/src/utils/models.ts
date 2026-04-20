// ── Model color palette ────────────────────────────────────────────────────────
const COLOR_PALETTE = [
  '#7c6af7', // purple  (default / qwen)
  '#4bc8f0', // cyan    (phi / gemma)
  '#3dba6c', // green   (llama)
  '#f0b429', // amber   (mistral)
  '#e05c7a', // rose    (deepseek)
  '#f07c4b', // orange  (command-r)
  '#a78bfa', // violet  (llava)
  '#60a5fa', // blue    (general)
]

export function modelColor(name: string): string {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff
  return COLOR_PALETTE[Math.abs(h) % COLOR_PALETTE.length]
}

// ── Capability tags ────────────────────────────────────────────────────────────
export type ModelTag = 'CODE' | 'VISION' | 'FAST' | 'REASON' | 'MATH' | 'GENERAL' | 'EMBED'

const TAG_RULES: Array<{ match: string; tags: ModelTag[] }> = [
  { match: 'qwen2.5-coder',  tags: ['CODE', 'REASON'] },
  { match: 'qwen2.5vl',      tags: ['VISION', 'REASON'] },
  { match: 'deepseek-coder', tags: ['CODE'] },
  { match: 'starcoder',      tags: ['CODE'] },
  { match: 'codellama',      tags: ['CODE'] },
  { match: 'llava',          tags: ['VISION', 'REASON'] },
  { match: 'minicpm-v',      tags: ['VISION', 'FAST'] },
  { match: 'moondream',      tags: ['VISION', 'FAST'] },
  { match: 'phi',            tags: ['REASON', 'FAST'] },
  { match: 'phi3',           tags: ['REASON', 'FAST'] },
  { match: 'phi4',           tags: ['REASON', 'MATH'] },
  { match: 'gemma3',         tags: ['GENERAL', 'REASON'] },
  { match: 'gemma2',         tags: ['GENERAL', 'FAST'] },
  { match: 'llama3.2:1b',   tags: ['FAST'] },
  { match: 'llama3.2:3b',   tags: ['FAST', 'GENERAL'] },
  { match: 'llama3.3',       tags: ['GENERAL', 'REASON'] },
  { match: 'llama3.1',       tags: ['GENERAL', 'REASON'] },
  { match: 'mistral',        tags: ['GENERAL', 'FAST'] },
  { match: 'qwen2.5:',       tags: ['GENERAL', 'MATH'] },
  { match: 'deepseek-r1',    tags: ['REASON', 'MATH'] },
  { match: 'nomic-embed',    tags: ['EMBED'] },
]

export function modelTags(name: string): ModelTag[] {
  const lower = name.toLowerCase()
  for (const rule of TAG_RULES) {
    if (lower.includes(rule.match)) return rule.tags
  }
  return ['GENERAL']
}

export const TAG_COLORS: Record<ModelTag, string> = {
  CODE:    '#4bc8f0',
  VISION:  '#a78bfa',
  FAST:    '#3dba6c',
  REASON:  '#f0b429',
  MATH:    '#f07c4b',
  GENERAL: '#888',
  EMBED:   '#555',
}

// ── Context window sizes ───────────────────────────────────────────────────────
// Ollama defaults to 2048 — we override to 8192 in all requests.
// These are the ACTUAL model limits for the progress bar ceiling.
const CTX_RULES: Array<{ match: string; ctx: number }> = [
  { match: 'llama3.2:1b',      ctx: 131072 },
  { match: 'llama3.2:3b',      ctx: 131072 },
  { match: 'llama3.1',         ctx: 131072 },
  { match: 'llama3.3',         ctx: 131072 },
  { match: 'qwen2.5-coder:7b', ctx: 32768 },
  { match: 'qwen2.5-coder:14b',ctx: 32768 },
  { match: 'qwen2.5-coder:32b',ctx: 16384 },
  { match: 'qwen2.5:',         ctx: 32768 },
  { match: 'phi3',             ctx: 131072 },
  { match: 'phi4',             ctx: 16384 },
  { match: 'gemma3',           ctx: 131072 },
  { match: 'gemma2',           ctx: 8192 },
  { match: 'mistral',          ctx: 32768 },
  { match: 'llava',            ctx: 4096 },
  { match: 'deepseek-r1',      ctx: 131072 },
  { match: 'deepseek-coder',   ctx: 16384 },
]

// The num_ctx we actually request from Ollama — keep this at or below the model limit.
export const REQUEST_NUM_CTX = 8192

export function contextWindowSize(name: string): number {
  const lower = name.toLowerCase()
  for (const rule of CTX_RULES) {
    if (lower.includes(rule.match)) return Math.min(rule.ctx, REQUEST_NUM_CTX)
  }
  return REQUEST_NUM_CTX
}

// ── Temperature labels ─────────────────────────────────────────────────────────
export function tempLabel(t: number): string {
  if (t <= 0.05) return 'Deterministic'
  if (t <= 0.35) return 'Precise'
  if (t <= 0.65) return 'Balanced'
  if (t <= 0.95) return 'Creative'
  if (t <= 1.30) return 'Expressive'
  if (t <= 1.70) return 'Experimental'
  return 'Chaotic'
}

export function tempColor(t: number): string {
  if (t <= 0.35) return '#4bc8f0'  // cool blue
  if (t <= 0.65) return '#3dba6c'  // green
  if (t <= 0.95) return '#f0b429'  // amber
  if (t <= 1.30) return '#f07c4b'  // orange
  return '#e05c7a'                  // red
}

// ── Context fill severity ──────────────────────────────────────────────────────
export function ctxFillColor(pct: number): string {
  if (pct < 0.55) return '#3dba6c'
  if (pct < 0.75) return '#f0b429'
  if (pct < 0.90) return '#f07c4b'
  return '#e05c7a'
}

export function ctxWarning(pct: number): string | null {
  if (pct >= 0.90) return 'Context nearly full — quality degrades here with local models. Start a new chat or the model may repeat itself.'
  if (pct >= 0.75) return 'Context filling up — responses may slow down and lose coherence.'
  if (pct >= 0.55) return 'Past halfway — keep an eye on context if this is a long reasoning task.'
  return null
}
