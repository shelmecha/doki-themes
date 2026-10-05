// Pure conversion: a Doki theme -> Claude Code theme JSON, Windows Terminal scheme, shared accent record.
import type { Accent, DokiTheme, TermcnRaw } from '../types'
import { TERMCN_RAW } from './termcn-themes'
import { THEMES as DOKI_THEMES } from './themes'

export const WT_PROFILE_GUID = '{61c54bbd-c2c6-5271-96e7-009a87ff44bf}'

// Doki "Ram": the default theme, and the fallback when the accent file is missing.
export const RAM_ACCENT: Accent = {
  name: 'Ram',
  dark: true,
  accent: '#e594bf',
  accent2: '#a1e9ff',
  muted: '#ab7b9d',
  text: '#F8F8F2',
  subtle: '#666879',
}

// Tokens that must stay with the daltonized (color-blind-safe) base: never overridden.
export const PROTECTED_TOKEN = /^(diff|success$|error$)/

type Rgb = [number, number, number]

const parse = (hex: string): Rgb => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as Rgb
const format = (rgb: readonly number[]): string =>
  '#' + rgb.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')

/** Blend `a` toward `b` by `t` (0..1). */
export function mix(a: string, b: string, t: number): string {
  const A = parse(a)
  const B = parse(b)
  return format(A.map((v, i) => v + ((B[i] ?? v) - v) * t))
}

/** Shift HSL lightness by `delta` (-1..1), keeping hue and saturation. */
export function lightness(hex: string, delta: number): string {
  const [r, g, b] = parse(hex).map(v => v / 255) as Rgb
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  let l = (max + min) / 2
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    h /= 6
  }
  l = Math.max(0, Math.min(1, l + delta))
  if (s === 0) return format([l * 255, l * 255, l * 255])
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const channel = (t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return format([channel(h + 1 / 3) * 255, channel(h) * 255, channel(h - 1 / 3) * 255])
}

/** Relative luminance (0..1) of a #rrggbb color. */
export function luminance(hex: string): number {
  const [r, g, b] = parse(hex).map(v => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }) as Rgb
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** A termcn theme as the picker's theme: termcn has no ANSI palette, so the roles stand in for it. */
export function toTermcnTheme(raw: TermcnRaw): DokiTheme {
  const k = raw.colors
  const dark = luminance(k.background) < 0.5
  return {
    name: raw.name,
    slug: `termcn-${raw.slug}`,
    dark,
    source: 'termcn',
    colors: {
      bg: k.background,
      fg: k.foreground,
      accent: k.accent,
      muted: k.mutedForeground,
      subtle: k.muted,
      selection: k.selection,
      widget: lightness(k.background, dark ? 0.04 : -0.04),
      cursor: k.focusRing,
      red: k.error,
      green: k.success,
      yellow: k.warning,
      blue: k.info,
      magenta: k.secondary,
      cyan: k.info,
      error: k.error,
      interface: k.info,
      purple: k.primary,
      func: k.primary,
      constant: k.success,
      cls: k.warning,
      bool: k.accent,
    },
  }
}

export const THEMES: readonly DokiTheme[] = [...DOKI_THEMES, ...TERMCN_RAW.map(toTermcnTheme)]

/** The label a theme goes by in names and toasts: "Doki Ram", "termcn Dracula". */
export const sourceLabel = (theme: DokiTheme): string => (theme.source === 'termcn' ? 'termcn' : 'Doki')

/** The Claude Code theme preference for a theme: custom:doki-ram, custom:termcn-dracula. */
export const preferenceOf = (theme: DokiTheme): string => (theme.source === 'termcn' ? `custom:${theme.slug}` : `custom:doki-${theme.slug}`)

export type ClaudeTheme = { name: string; base: 'dark-daltonized' | 'light-daltonized'; overrides: Record<string, string> }

/** The same tokens ~/.claude/themes/doki-ram.json sets, sourced from the theme's own colors. */
export function toClaudeTheme(theme: DokiTheme): ClaudeTheme {
  const c = theme.colors
  // Dark themes lift message backgrounds toward light; light themes push them toward dark.
  const lift = (d: number) => lightness(c.bg, theme.dark ? d : -d)
  return {
    name: `${sourceLabel(theme)} ${theme.name}`,
    base: theme.dark ? 'dark-daltonized' : 'light-daltonized',
    overrides: {
      claude: c.accent,
      text: c.fg,
      inverseText: c.widget,
      inactive: c.muted,
      subtle: c.subtle,
      suggestion: c.interface,
      permission: c.purple,
      remember: c.func,
      warning: c.yellow,
      merged: c.purple,
      promptBorder: c.selection,
      planMode: c.cyan,
      autoAccept: c.func,
      bashBorder: c.yellow,
      ide: c.constant,
      fastMode: c.cls,
      effortUltra: c.bool,
      userMessageBackground: lift(0.033),
      userMessageBackgroundHover: lift(0.065),
      bashMessageBackgroundColor: mix(c.bg, c.yellow, 0.03),
      memoryBackgroundColor: mix(c.bg, c.purple, 0.065),
      selectionBg: c.selection,
      rate_limit_fill: c.accent,
      rate_limit_empty: lift(0.08),
      briefLabelYou: c.interface,
      briefLabelClaude: c.accent,
    },
  }
}

export type WtScheme = Record<string, string>

/**
 * Windows Terminal color scheme. Doki ships 6 terminal.ansi* colors (red..cyan); the rest
 * come from the same keys the hand-made "Doki Ram" scheme used.
 */
export function toWtScheme(theme: DokiTheme): WtScheme {
  const c = theme.colors
  const up = (hex: string) => hex.toUpperCase()
  return {
    name: `${sourceLabel(theme)} ${theme.name}`,
    background: up(c.bg),
    foreground: up(c.fg),
    cursorColor: up(c.cursor),
    selectionBackground: up(c.selection),
    black: up(theme.dark ? c.widget : c.fg),
    red: up(c.red),
    green: up(c.green),
    yellow: up(c.yellow),
    blue: up(c.blue),
    purple: up(c.func),
    cyan: up(c.cyan),
    white: up(theme.dark ? c.fg : c.widget),
    brightBlack: up(c.subtle),
    brightRed: up(c.error),
    brightGreen: up(c.constant),
    brightYellow: up(c.cls),
    brightBlue: up(c.purple),
    brightPurple: up(c.bool),
    brightCyan: up(c.interface),
    brightWhite: theme.dark ? '#FFFFFF' : up(c.bg),
  }
}

export function toAccent(theme: DokiTheme): Accent {
  const c = theme.colors
  return { name: theme.name, dark: theme.dark, accent: c.accent, accent2: c.interface, muted: c.muted, text: c.fg, subtle: c.subtle }
}

/** Reads the accent file's text; anything missing or malformed falls back to Ram. */
export function parseAccent(text: string | undefined): Accent {
  try {
    const raw = JSON.parse(text ?? '') as Partial<Accent>
    const hex = (v: unknown, fallback: string) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback)
    return {
      name: typeof raw.name === 'string' ? raw.name : RAM_ACCENT.name,
      dark: typeof raw.dark === 'boolean' ? raw.dark : RAM_ACCENT.dark,
      accent: hex(raw.accent, RAM_ACCENT.accent),
      accent2: hex(raw.accent2, RAM_ACCENT.accent2),
      muted: hex(raw.muted, RAM_ACCENT.muted),
      text: hex(raw.text, RAM_ACCENT.text),
      subtle: hex(raw.subtle, RAM_ACCENT.subtle),
    }
  } catch {
    return RAM_ACCENT
  }
}

/** "vanilla", "Doki Mai Dark", "mai dark", "termcn dracula", "custom:termcn-nord", or bare "nord" -> the theme. */
export function findTheme(query: string, themes: readonly DokiTheme[] = THEMES): DokiTheme | undefined {
  const key = query
    .trim()
    .toLowerCase()
    .replace(/^custom:/, '')
    .replace(/^doki[\s-]+/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  if (!key) return undefined
  // Doki names win; a bare termcn name ("nord") is tried as "termcn-nord" after them.
  const termcn = `termcn-${key}`
  return (
    themes.find(t => t.slug === key) ??
    themes.find(t => t.slug === termcn) ??
    themes.find(t => t.slug.startsWith(key)) ??
    themes.find(t => t.slug.startsWith(termcn))
  )
}

/** The slug in a theme preference ("custom:doki-ram" -> "ram", "custom:termcn-nord" -> "termcn-nord"), or "" for a built-in theme. */
export function slugOfPreference(preference: unknown): string {
  if (typeof preference !== 'string') return ''
  if (preference.startsWith('custom:doki-')) return preference.slice('custom:doki-'.length)
  return preference.startsWith('custom:termcn-') ? preference.slice('custom:'.length) : ''
}

/** Doki, then termcn; within each, dark first, then light, each by name: the order the picker lists them in. */
export function ordered(themes: readonly DokiTheme[] = THEMES): DokiTheme[] {
  const rank = (t: DokiTheme) => (t.source === 'termcn' ? 1 : 0)
  return [...themes].sort((a, b) => rank(a) - rank(b) || Number(b.dark) - Number(a.dark) || a.name.localeCompare(b.name))
}

/** The first index of a `size`-row window over `count` rows that keeps `index` in its middle. */
export function windowStart(index: number, count: number, size: number): number {
  if (count <= size) return 0
  const start = index - Math.floor(size / 2)
  return Math.max(0, Math.min(count - size, start))
}

/** Gives freshly serialized `text` the line endings (CRLF or LF) and final newline (or none) of `original`. */
export function matchStyle(original: string, text: string): string {
  const eol = original.includes('\r\n') ? '\r\n' : '\n'
  const body = text.replace(/\r?\n$/, '').replace(/\r?\n/g, eol)
  return /\r?\n$/.test(original) ? body + eol : body
}

/**
 * Adds or replaces `scheme` (by name) and points one profile at it. Returns the new file text.
 * The profile: `current` (Windows Terminal's WT_PROFILE_ID, the tab Claude Code runs in), else the
 * default profile (a guid or a name), else Windows PowerShell.
 */
export function updateWtSettings(text: string, scheme: WtScheme, current?: string | null): string {
  const settings = JSON.parse(text) as {
    defaultProfile?: unknown
    schemes?: WtScheme[]
    profiles?: { list?: Array<Record<string, unknown>> }
  }
  const list = settings.profiles?.list ?? []
  const same = (a: unknown, b: unknown) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase()
  const profile = [current, settings.defaultProfile, WT_PROFILE_GUID]
    .map(want => list.find(p => same(p.guid, want) || same(p.name, want)))
    .find(p => p !== undefined)
  if (!profile) throw new Error('Windows Terminal profile not found')
  const schemes = (settings.schemes ?? []).filter(s => s.name !== scheme.name)
  settings.schemes = [...schemes, scheme]
  profile.colorScheme = scheme.name
  return matchStyle(text, JSON.stringify(settings, null, 4))
}

/**
 * Sets the top-level "theme" key of Claude Code's settings.json text. Edits that one line in place
 * when it can (a one-line diff); otherwise re-serializes in the file's own line endings.
 */
export function updateClaudeSettings(text: string, preference: string): string {
  const line = /^( {2}"theme"\s*:\s*)"(?:[^"\\\r\n]|\\.)*"/gm
  if ((text.match(line) ?? []).length === 1) {
    const edited = text.replace(line, (_all, head: string) => `${head}${JSON.stringify(preference)}`)
    try {
      if ((JSON.parse(edited) as { theme?: unknown }).theme === preference) return edited
    } catch {
      // fall through to a full rewrite
    }
  }
  const settings = JSON.parse(text) as Record<string, unknown>
  settings.theme = preference
  return matchStyle(text, JSON.stringify(settings, null, 2))
}

/**
 * A Raster strip of the theme's colors: row 1 the UI colors, row 2 the terminal colors.
 * Each swatch is `width` full-block cells in that color.
 */
export function swatchCells(theme: DokiTheme, width = 2): { columns: number; rows: number; cells: string } {
  const c = theme.colors
  const rows = [
    [c.bg, c.fg, c.accent, c.muted, c.subtle, c.selection, c.interface, c.purple],
    [c.red, c.green, c.yellow, c.blue, c.func, c.cyan, c.constant, c.cls],
  ]
  const columns = rows[0]!.length * width
  const words: number[] = []
  for (const row of rows) {
    for (const hex of row) {
      const color = parseInt(hex.slice(1, 7), 16)
      for (let i = 0; i < width; i++) words.push(0x2588, color, 0x01000000)
    }
  }
  const bytes = new Uint8Array(new Uint32Array(words).buffer)
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return { columns, rows: rows.length, cells: btoa(binary) }
}

export function stamp(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-')
}
