export type DokiColors = {
  bg: string
  fg: string
  accent: string
  muted: string
  subtle: string
  selection: string
  widget: string
  cursor: string
  red: string
  green: string
  yellow: string
  blue: string
  magenta: string
  cyan: string
  error: string
  interface: string
  purple: string
  func: string
  constant: string
  cls: string
  bool: string
}

/** Where a theme comes from. Doki themes leave `source` off. termcn slugs carry a "termcn-" prefix. */
export type ThemeSource = 'doki' | 'termcn'

export type DokiTheme = { name: string; slug: string; dark: boolean; colors: DokiColors; source?: ThemeSource }

/** The termcn color keys the picker maps from (hooks/termcn-themes.ts, generated). */
export type TermcnColors = Record<
  'accent' | 'background' | 'error' | 'focusRing' | 'foreground' | 'info' | 'muted' | 'mutedForeground' | 'primary' | 'secondary' | 'selection' | 'success' | 'warning',
  string
>

export type TermcnRaw = { name: string; slug: string; colors: TermcnColors }

/** The shared accent file (~/.claude/mods/theme-accent.json), read by jev-copilot. */
export type Accent = {
  name: string
  dark: boolean
  accent: string
  accent2: string
  muted: string
  text: string
  subtle: string
}

declare module 'claude-code' {
  interface PluginState {
    /** highlight: the slug under the focus ring; current: the slug last applied. */
    'doki-theme-picker': { highlight: string; current: string }
  }
}
