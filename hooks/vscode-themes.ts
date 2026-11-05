// VS Code color themes as picker themes: scans installed extensions, converts their themes, keeps a store.
import type { DokiColors, DokiTheme } from '../types'
import { LIGHT_SUBTLE_CONTRAST, ROLE_CONTRAST, SUBTLE_CONTRAST, TEXT_CONTRAST, contrast, lightness, luminance, mix, readableOn } from './theme'

/** Extension folders under the home folder. A missing folder is skipped. */
export const EXTENSION_ROOTS = ['.vscode/extensions', '.vscode-insiders/extensions'] as const
/** The store, relative to the home folder. */
export const STORE_PATH = '.claude/doki-theme-picker/vscode-themes.json'
/** Extensions whose themes the picker already has (Doki, termcn). */
export const SKIP_EXTENSIONS: readonly string[] = ['unthrottled.doki-theme', 'local.termcn-themes']

/** The file access a scan needs; the picker passes the engine's fs. */
export type SyncFs = {
  exists: (path: string) => Promise<boolean>
  list: (path: string) => Promise<readonly { name: string; kind: string }[]>
  read: (path: string) => Promise<string>
  stat: (path: string) => Promise<{ mtimeMs: number }>
}

export type Skip = { extension: string; theme: string; reason: string }
export type StoredTheme = DokiTheme & { extension: string }
export type ExtensionRecord = { version: string; folder: string; mtime: number; label: string }
export type Store = { version: 1; extensions: Record<string, ExtensionRecord>; themes: StoredTheme[]; skipped: Skip[] }
export type SyncResult = { store: Store; changed: boolean; added: string[]; updated: string[] }

const emptyStore = (): Store => ({ version: 1, extensions: {}, themes: [], skipped: [] })

/** The store in `text`; an empty store when there is none. `corrupt` when text was there but unreadable. */
export function parseStore(text: string | undefined): { store: Store; corrupt: boolean } {
  if (text === undefined || text.trim() === '') return { store: emptyStore(), corrupt: false }
  try {
    const s = JSON.parse(text) as Partial<Store>
    if (s.version !== 1 || typeof s.extensions !== 'object' || !s.extensions || !Array.isArray(s.themes)) throw new Error('shape')
    return { store: { version: 1, extensions: s.extensions, themes: s.themes, skipped: Array.isArray(s.skipped) ? s.skipped : [] }, corrupt: false }
  } catch {
    return { store: emptyStore(), corrupt: true }
  }
}

export const serializeStore = (store: Store): string => JSON.stringify(store, null, 2) + '\n'

/** The picker themes a store holds, by group then name. */
export function themesOf(store: Store): DokiTheme[] {
  return store.themes
    .map(({ extension: _, ...theme }) => theme as DokiTheme)
    .sort((a, b) => (a.group ?? '').localeCompare(b.group ?? '') || a.name.localeCompare(b.name))
}

/** `next` plus the extensions only `other` holds: another session stored them during this scan. */
export function keepOthers(next: Store, other: Store): Store {
  const out: Store = { ...next, extensions: { ...next.extensions }, themes: [...next.themes], skipped: [...next.skipped] }
  for (const [id, record] of Object.entries(other.extensions)) {
    if (out.extensions[id]) continue
    out.extensions[id] = record
    out.themes.push(...other.themes.filter(t => t.extension === id))
    out.skipped.push(...other.skipped.filter(s => s.extension === id))
  }
  return out
}

// ---------- reading ----------

/** JSON with comments and trailing commas, as VS Code reads theme files. */
export function parseJsonc(text: string): unknown {
  let out = ''
  let i = 0
  while (i < text.length) {
    const c = text[i]!
    if (c === '"') {
      let j = i + 1
      while (j < text.length && text[j] !== '"') j += text[j] === '\\' ? 2 : 1
      out += text.slice(i, j + 1)
      i = j + 1
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2)
      i = end < 0 ? text.length : end + 2
    } else {
      out += c
      i++
    }
  }
  return JSON.parse(out.replace(/^﻿/, '').replace(/,(\s*[}\]])/g, '$1'))
}

/** A path with `.` and `..` resolved, forward slashes. */
function normalize(path: string): string {
  const parts: string[] = []
  for (const p of path.replace(/\\/g, '/').split('/')) {
    if (p === '.' || (p === '' && parts.length > 0)) continue
    if (p === '..') parts.pop()
    else parts.push(p)
  }
  return parts.join('/')
}

const dirOf = (path: string) => path.slice(0, path.lastIndexOf('/'))

/** `relative` under `base`'s folder, or undefined when it leaves `root`. */
function confined(root: string, from: string, relative: string): string | undefined {
  const full = normalize(`${from}/${relative}`)
  return full.startsWith(`${normalize(root)}/`) ? full : undefined
}

type TokenRule = { scope?: string | string[]; settings?: { foreground?: string; background?: string } }
type RawTheme = { colors: Record<string, string>; tokenColors: TokenRule[] }

/** A .tmTheme (plist) as VS Code theme parts: globals become editor colors, scoped settings token rules. */
export function parseTmTheme(text: string): RawTheme {
  const colors: Record<string, string> = {}
  const tokenColors: TokenRule[] = []
  // Settings come in order: the global dict first (no scope), then one dict per scope with a nested settings dict.
  let scope: string | undefined
  for (const m of text.matchAll(/<key>([^<]*)<\/key>\s*<string>([^<]*)<\/string>/g)) {
    const [k, v] = [m[1]!, m[2]!.trim()]
    if (k === 'scope') scope = v
    else if (scope) {
      if (k === 'foreground') tokenColors.push({ scope, settings: { foreground: v } })
    } else if (k === 'background') colors['editor.background'] ??= v
    else if (k === 'foreground') colors['editor.foreground'] ??= v
    else if (k === 'caret') colors['editorCursor.foreground'] ??= v
    else if (k === 'selection') colors['editor.selectionBackground'] ??= v
  }
  if (!colors['editor.background'] && tokenColors.length === 0) throw new Error('no colors in tmTheme')
  return { colors, tokenColors }
}

/** A theme file with its include chain merged (included first, the file's own values win). */
async function loadTheme(fs: SyncFs, root: string, path: string, seen: Set<string> = new Set()): Promise<RawTheme> {
  if (seen.has(path)) throw new Error(`include cycle at ${path.slice(root.length + 1)}`)
  if (seen.size > 10) throw new Error('include chain too long')
  seen.add(path)
  if (!(await fs.exists(path))) throw new Error(`missing file ${path.slice(root.length + 1)}`)
  const text = await fs.read(path)
  if (/\.tmTheme$/i.test(path)) return parseTmTheme(text)
  const json = parseJsonc(text) as { include?: unknown; colors?: unknown; tokenColors?: unknown }
  if (!json || typeof json !== 'object') throw new Error('not a JSON object')
  let base: RawTheme = { colors: {}, tokenColors: [] }
  if (typeof json.include === 'string') {
    const inc = confined(root, dirOf(path), json.include)
    if (!inc) throw new Error(`include outside the extension: ${json.include}`)
    base = await loadTheme(fs, root, inc, seen)
  }
  let tokens: TokenRule[] = []
  if (Array.isArray(json.tokenColors)) tokens = json.tokenColors as TokenRule[]
  else if (typeof json.tokenColors === 'string') {
    const tm = confined(root, dirOf(path), json.tokenColors)
    if (!tm) throw new Error(`tokenColors outside the extension: ${json.tokenColors}`)
    tokens = (await loadTheme(fs, root, tm, seen)).tokenColors
  }
  const colors = json.colors && typeof json.colors === 'object' ? (json.colors as Record<string, string>) : {}
  return { colors: { ...base.colors, ...colors }, tokenColors: [...base.tokenColors, ...tokens] }
}

// ---------- conversion ----------

/** #rgb, #rgba, #rrggbb or #rrggbbaa as #rrggbb, alpha blended over `under`. */
export function solid(value: unknown, under: string): string | undefined {
  if (typeof value !== 'string') return undefined
  let h = value.trim().toLowerCase()
  if (!/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/.test(h)) return undefined
  if (h.length <= 5) h = '#' + [...h.slice(1)].map(c => c + c).join('')
  if (h.length === 7) return h
  const alpha = parseInt(h.slice(7, 9), 16) / 255
  return mix(under, h.slice(0, 7), alpha)
}

const ANSI = {
  dark: { red: '#f14c4c', green: '#23d18b', yellow: '#f5f543', blue: '#3b8eea', magenta: '#d670d6', cyan: '#29b8db' },
  light: { red: '#cd3131', green: '#00bc00', yellow: '#949800', blue: '#0451a5', magenta: '#bc05bc', cyan: '#0598bc' },
}

/** A background moved out of the 0.1..0.5 luminance band, toward the side its theme declares. */
export function clearBackground(bg: string, dark: boolean): string {
  let c = bg
  for (let i = 0; i < 100 && luminance(c) > 0.1 && luminance(c) < 0.5; i++) c = lightness(c, dark ? -0.01 : 0.01)
  return c
}

/** The text roles: every color but selection, widget and cursor. */
export const TEXT_ROLES = ['fg', 'accent', 'muted', 'subtle', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'error', 'interface', 'purple', 'func', 'constant', 'cls', 'bool'] as const

export const lowestTextContrast = (theme: DokiTheme): number => Math.min(...TEXT_ROLES.map(k => contrast(theme.colors.bg, theme.colors[k])))

/** A VS Code theme's parts as picker colors: text readable, background clearly dark or light. */
export function convertTheme(raw: RawTheme, uiTheme: string): { dark: boolean; colors: DokiColors } {
  const declaredDark = !/^(vs|hc-light)$/.test(uiTheme)
  const c = raw.colors
  const rawBg = solid(c['editor.background'], declaredDark ? '#1e1e1e' : '#ffffff') ?? (declaredDark ? '#1e1e1e' : '#ffffff')
  const bg = clearBackground(rawBg, declaredDark)
  const dark = luminance(bg) < 0.5
  const col = (key: string) => solid(c[key], bg)
  const rules: [string, string][] = []
  for (const rule of raw.tokenColors) {
    const fg = solid(rule?.settings?.foreground, bg)
    if (!fg || !rule.scope) continue
    const scopes = Array.isArray(rule.scope) ? rule.scope : String(rule.scope).split(',')
    for (const s of scopes) rules.push([s.trim(), fg])
  }
  // TextMate: a rule for "keyword" colors "keyword.control"; the longest matching rule wins, later rules break ties.
  const tok = (...wanted: string[]): string | undefined => {
    for (const w of wanted) {
      let best: [number, string] | undefined
      for (const [s, fg] of rules) if ((s === w || w.startsWith(`${s}.`)) && (!best || s.length >= best[0])) best = [s.length, fg]
      if (best) return best[1]
    }
    return undefined
  }
  const ansi = dark ? ANSI.dark : ANSI.light
  const fg = col('editor.foreground') ?? col('foreground') ?? (dark ? '#d4d4d4' : '#333333')
  const red = col('terminal.ansiRed') ?? col('errorForeground') ?? tok('invalid') ?? ansi.red
  const green = col('terminal.ansiGreen') ?? tok('string') ?? ansi.green
  const yellow = col('terminal.ansiYellow') ?? tok('constant.numeric') ?? ansi.yellow
  const blue = col('terminal.ansiBlue') ?? tok('entity.name.function') ?? ansi.blue
  const magenta = col('terminal.ansiMagenta') ?? tok('keyword') ?? ansi.magenta
  const cyan = col('terminal.ansiCyan') ?? tok('support.type', 'support') ?? ansi.cyan
  const accent = col('activityBarBadge.background') ?? col('focusBorder') ?? col('textLink.foreground') ?? col('button.background') ?? tok('keyword') ?? blue
  const raw0: DokiColors = {
    bg,
    fg,
    accent,
    muted: tok('comment') ?? col('descriptionForeground') ?? mix(bg, fg, 0.5),
    subtle: col('editorLineNumber.foreground') ?? mix(bg, fg, 0.35),
    selection: col('editor.selectionBackground') ?? mix(bg, accent, 0.3),
    widget: col('editorWidget.background') ?? col('sideBar.background') ?? lightness(bg, dark ? 0.04 : -0.04),
    cursor: col('editorCursor.foreground') ?? accent,
    red,
    green,
    yellow,
    blue,
    magenta,
    cyan,
    error: col('errorForeground') ?? col('editorError.foreground') ?? red,
    interface: tok('entity.name.type.interface', 'entity.name.type') ?? blue,
    purple: tok('storage.type', 'keyword') ?? magenta,
    func: tok('entity.name.function', 'support.function') ?? blue,
    constant: tok('constant.numeric', 'constant') ?? yellow,
    cls: tok('entity.name.class', 'entity.name.type', 'support.class') ?? yellow,
    bool: tok('constant.language.boolean', 'constant.language') ?? accent,
  }
  const colors = { ...raw0 }
  for (const k of TEXT_ROLES) {
    const min = k === 'fg' ? TEXT_CONTRAST : k === 'subtle' ? (dark ? SUBTLE_CONTRAST : LIGHT_SUBTLE_CONTRAST) : ROLE_CONTRAST
    colors[k] = readableOn(bg, raw0[k], min)
  }
  return { dark, colors }
}

// ---------- scanning ----------

const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

/** "tal7aouy.theme-3.1.0" -> id and version; undefined for anything else. */
export function parseFolder(name: string): { id: string; version: string } | undefined {
  const m = /^([^.\s][^.]*\.[^\s]+?)-(\d+(?:\.\d+)*.*)$/.exec(name)
  return m ? { id: m[1]!.toLowerCase(), version: m[2]! } : undefined
}

export function compareVersions(a: string, b: string): number {
  const pa = (/^[\d.]+/.exec(a)?.[0] ?? '').split('.').map(Number)
  const pb = (/^[\d.]+/.exec(b)?.[0] ?? '').split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d) return d
  }
  return 0
}

/** The section a creator's themes go under: the display name, or the publisher when the name says nothing. */
export function groupLabel(pkg: { displayName?: unknown; publisher?: unknown; name?: unknown }): string {
  const display = typeof pkg.displayName === 'string' ? pkg.displayName.trim() : ''
  const publisher = typeof pkg.publisher === 'string' ? pkg.publisher : String(pkg.name ?? 'VS Code')
  const meaningful = display.replace(/\b(vs ?code|color|colou?r|themes?)\b/gi, '').replace(/[^a-z0-9]/gi, '')
  return display && !display.startsWith('%') && meaningful ? display : publisher
}

async function listOr(fs: SyncFs, path: string) {
  try {
    return (await fs.exists(path)) ? await fs.list(path) : []
  } catch {
    return []
  }
}

/** Scans the extension folders and returns the store with new or changed extensions converted. Never throws for one bad theme. */
export async function syncVscodeThemes(fs: SyncFs, roots: readonly string[], before: Store): Promise<SyncResult> {
  const store: Store = { version: 1, extensions: { ...before.extensions }, themes: [...before.themes], skipped: [...before.skipped] }
  const added: string[] = []
  const updated: string[] = []
  // Highest version per id across all roots; folders VS Code marked obsolete are ignored.
  const found = new Map<string, { version: string; folder: string }>()
  for (const root of roots) {
    const entries = await listOr(fs, root)
    let obsolete: Record<string, unknown> = {}
    try {
      if (entries.some(e => e.name === '.obsolete')) obsolete = JSON.parse(await fs.read(`${root}/.obsolete`)) as Record<string, unknown>
    } catch {
      // An unreadable .obsolete hides nothing.
    }
    for (const e of entries) {
      if (e.kind !== 'dir' || e.name.startsWith('.') || obsolete[e.name]) continue
      const p = parseFolder(e.name)
      if (!p || SKIP_EXTENSIONS.includes(p.id)) continue
      const have = found.get(p.id)
      if (!have || compareVersions(p.version, have.version) > 0) found.set(p.id, { version: p.version, folder: `${root}/${e.name}` })
    }
  }
  for (const [id, { version, folder }] of found) {
    let mtime: number
    try {
      mtime = (await fs.stat(`${folder}/package.json`)).mtimeMs
    } catch {
      continue
    }
    const old = store.extensions[id]
    if (old && old.folder === folder && old.version === version && old.mtime === mtime) continue
    let pkg: { displayName?: unknown; publisher?: unknown; name?: unknown; contributes?: { themes?: unknown } }
    try {
      pkg = parseJsonc(await fs.read(`${folder}/package.json`)) as typeof pkg
    } catch {
      continue
    }
    const contributed = Array.isArray(pkg.contributes?.themes) ? (pkg.contributes.themes as { label?: unknown; id?: unknown; uiTheme?: unknown; path?: unknown }[]) : []
    if (contributed.length === 0 && !old) {
      store.extensions[id] = { version, folder, mtime, label: '' }
      continue
    }
    const group = groupLabel(pkg)
    const themes: StoredTheme[] = []
    const skipped: Skip[] = []
    for (const t of contributed) {
      const name = String(t.label ?? t.id ?? '').trim()
      try {
        if (!name) throw new Error('no label')
        if (typeof t.path !== 'string') throw new Error('no path')
        const path = confined(folder, folder, t.path)
        if (!path) throw new Error(`path outside the extension: ${t.path}`)
        const { dark, colors } = convertTheme(await loadTheme(fs, folder, path), String(t.uiTheme ?? 'vs-dark'))
        themes.push({ name, slug: `vscode-${slugify(id)}-${slugify(name)}`, dark, colors, source: 'vscode', group, extension: id })
      } catch (error) {
        skipped.push({ extension: id, theme: name || '?', reason: error instanceof Error ? error.message : String(error) })
      }
    }
    const hadThemes = store.themes.some(t => t.extension === id)
    store.themes = [...store.themes.filter(t => t.extension !== id), ...themes]
    store.skipped = [...store.skipped.filter(s => s.extension !== id), ...skipped]
    store.extensions[id] = { version, folder, mtime, label: group }
    if (themes.length > 0) (hadThemes ? updated : added).push(id)
  }
  return { store, changed: serializeStore(store) !== serializeStore(before), added, updated }
}
