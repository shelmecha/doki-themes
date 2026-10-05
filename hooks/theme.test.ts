import { expect, test } from 'claude-code/testing'

import {
  PROTECTED_TOKEN,
  RAM_ACCENT,
  findTheme,
  lightness,
  matchStyle,
  luminance,
  ordered,
  preferenceOf,
  parseAccent,
  slugOfPreference,
  swatchCells,
  toAccent,
  toClaudeTheme,
  toTermcnTheme,
  toWtScheme,
  updateClaudeSettings,
  updateWtSettings,
  windowStart,
} from './theme'
import { TERMCN_RAW } from './termcn-themes'
import { THEMES } from './themes'

// The hand-made files from before this mod (2026-10-04): the reference mapping.
const RAM_CLAUDE = {
  name: 'Doki Ram',
  base: 'dark-daltonized',
  overrides: {
    claude: '#e594bf',
    text: '#F8F8F2',
    inverseText: '#2b252b',
    inactive: '#ab7b9d',
    subtle: '#666879',
    suggestion: '#a1e9ff',
    permission: '#9d8df6',
    remember: '#e88def',
    warning: '#EFA554',
    merged: '#9d8df6',
    promptBorder: '#7a546f',
    planMode: '#75D7EC',
    autoAccept: '#e88def',
    bashBorder: '#EFA554',
    ide: '#85FFEF',
    fastMode: '#FBFF90',
    effortUltra: '#ef57bf',
    userMessageBackground: '#3d343d',
    userMessageBackgroundHover: '#463b46',
    bashMessageBackgroundColor: '#3a3034',
    memoryBackgroundColor: '#3b3042',
    selectionBg: '#7a546f',
    rate_limit_fill: '#e594bf',
    rate_limit_empty: '#4a3f4a',
    briefLabelYou: '#a1e9ff',
    briefLabelClaude: '#e594bf',
  } as Record<string, string>,
}
// Two blended backgrounds were hand-tuned; the formula lands within a few RGB units.
const BLENDED = ['bashMessageBackgroundColor', 'memoryBackgroundColor']

const RAM_WT = {
  background: '#342C34',
  black: '#2B252B',
  blue: '#9B6BDF',
  brightBlack: '#666879',
  brightBlue: '#9D8DF6',
  brightCyan: '#A1E9FF',
  brightGreen: '#85FFEF',
  brightPurple: '#EF57BF',
  brightRed: '#FF5555',
  brightWhite: '#FFFFFF',
  brightYellow: '#FBFF90',
  cursorColor: '#E594BF',
  cyan: '#75D7EC',
  foreground: '#F8F8F2',
  green: '#42E66C',
  name: 'Doki Ram',
  purple: '#E88DEF',
  red: '#E356A7',
  selectionBackground: '#7A546F',
  white: '#F8F8F2',
  yellow: '#EFA554',
}

const ANSI = ['black', 'red', 'green', 'yellow', 'blue', 'purple', 'cyan', 'white']
const channels = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
const ram = findTheme('ram')!

test('88 themes: 64 dark, 24 light, unique slugs', async () => {
  expect(THEMES).toHaveLength(88)
  expect(THEMES.filter(t => t.dark)).toHaveLength(64)
  expect(THEMES.filter(t => !t.dark)).toHaveLength(24)
  expect(new Set(THEMES.map(t => t.slug)).size).toBe(88)
})

test('Ram converts to the hand-made doki-ram.json', async () => {
  const theme = toClaudeTheme(ram)
  expect(theme.name).toBe(RAM_CLAUDE.name)
  expect(theme.base).toBe(RAM_CLAUDE.base)
  expect(Object.keys(theme.overrides).sort()).toEqual(Object.keys(RAM_CLAUDE.overrides).sort())
  for (const [token, want] of Object.entries(RAM_CLAUDE.overrides)) {
    const got = theme.overrides[token]!
    if (BLENDED.includes(token)) {
      const drift = channels(got).map((v, i) => Math.abs(v - channels(want)[i]!))
      expect(Math.max(...drift) <= 3, `${token} ${got} vs ${want}`).toBe(true)
    } else {
      expect(got.toLowerCase(), token).toBe(want.toLowerCase())
    }
  }
})

test('Ram converts to the hand-made Windows Terminal scheme', async () => {
  expect(toWtScheme(ram)).toEqual(RAM_WT)
})

test('every theme keeps the daltonized base and never overrides diff, success or error', async () => {
  for (const t of THEMES) {
    const theme = toClaudeTheme(t)
    expect(theme.base, t.name).toBe(t.dark ? 'dark-daltonized' : 'light-daltonized')
    for (const token of Object.keys(theme.overrides)) expect(PROTECTED_TOKEN.test(token), `${t.name}: ${token}`).toBe(false)
    for (const [token, value] of Object.entries(theme.overrides)) expect(value, `${t.name}: ${token}`).toMatch(/^#[0-9a-fA-F]{6}$/)
  }
  expect(PROTECTED_TOKEN.test('diffAdded')).toBe(true)
  expect(PROTECTED_TOKEN.test('success')).toBe(true)
  expect(PROTECTED_TOKEN.test('error')).toBe(true)
})

test('light themes get light-daltonized', async () => {
  const senko = findTheme('senko')!
  expect(senko.dark).toBe(false)
  expect(toClaudeTheme(senko).base).toBe('light-daltonized')
  for (const t of THEMES.filter(t => !t.dark)) expect(toClaudeTheme(t).base).toBe('light-daltonized')
  // Light message backgrounds are darker than the page, not lighter.
  const page = channels(senko.colors.bg).reduce((a, b) => a + b)
  expect(channels(toClaudeTheme(senko).overrides.userMessageBackground!).reduce((a, b) => a + b) < page).toBe(true)
})

test('every Windows Terminal scheme has the 16 ansi colors', async () => {
  for (const t of THEMES) {
    const scheme = toWtScheme(t)
    const names = [...ANSI, ...ANSI.map(n => `bright${n[0]!.toUpperCase()}${n.slice(1)}`)]
    expect(names).toHaveLength(16)
    for (const n of names) expect(scheme[n], `${t.name}: ${n}`).toMatch(/^#[0-9A-F]{6}$/)
    expect(scheme.name).toBe(`Doki ${t.name}`)
  }
})

test('accent record and its file fallback', async () => {
  expect(toAccent(ram)).toEqual(RAM_ACCENT)
  expect(parseAccent(undefined)).toEqual(RAM_ACCENT)
  expect(parseAccent('{bad json')).toEqual(RAM_ACCENT)
  expect(parseAccent(JSON.stringify(toAccent(findTheme('vanilla')!))).name).toBe('Vanilla')
  expect(parseAccent('{"accent":"pink"}').accent).toBe(RAM_ACCENT.accent)
})

test('findTheme takes a slug, a name, or a preference', async () => {
  expect(findTheme('vanilla')?.name).toBe('Vanilla')
  expect(findTheme('Doki Mai Dark')?.slug).toBe('mai-dark')
  expect(findTheme('custom:doki-ram')?.slug).toBe('ram')
  expect(findTheme('C.C.')?.slug).toBe('c-c')
  expect(findTheme('nope-not-a-theme')).toBeUndefined()
  expect(findTheme('  ')).toBeUndefined()
})

test('list order is dark first, and the window keeps the highlight inside', async () => {
  const list = ordered()
  expect(list[0]!.dark).toBe(true)
  expect(list[list.length - 1]!.dark).toBe(false)
  expect(windowStart(0, 90, 10)).toBe(0)
  expect(windowStart(89, 90, 10)).toBe(80)
  expect(windowStart(50, 90, 10)).toBe(45)
  expect(windowStart(5, 8, 10)).toBe(0)
})

test('settings updates change only what they should', async () => {
  const wt = JSON.stringify({
    schemes: [{ name: 'Doki Vanilla', background: '#000000' }, { name: 'Tango Light' }],
    profiles: { list: [{ guid: '{61c54bbd-c2c6-5271-96e7-009a87ff44bf}', colorScheme: 'Doki Ram', name: 'Windows PowerShell' }] },
    keep: 1,
  })
  const next = JSON.parse(updateWtSettings(wt, toWtScheme(findTheme('vanilla')!)))
  expect(next.keep).toBe(1)
  expect(next.schemes).toHaveLength(2)
  expect(next.schemes.find((s: { name: string }) => s.name === 'Doki Vanilla').background).toBe('#2B2C3D')
  expect(next.profiles.list[0].colorScheme).toBe('Doki Vanilla')
  expect(() => updateWtSettings(JSON.stringify({ profiles: { list: [] } }), toWtScheme(ram))).toThrow('not found')

  // The profile: the tab's WT_PROFILE_ID first, then defaultProfile (a guid or a name), then Windows PowerShell.
  const three = JSON.stringify({
    defaultProfile: 'Command Prompt',
    profiles: {
      list: [
        { guid: '{61c54bbd-c2c6-5271-96e7-009a87ff44bf}', name: 'Windows PowerShell' },
        { guid: '{0caa0dad-35be-5f56-a8ff-afceeeaa6101}', name: 'Command Prompt' },
        { guid: '{574e775e-4f2a-5b96-ac1e-a2962a402336}', name: 'PowerShell' },
      ],
    },
  })
  const schemeOf = (text: string) => (JSON.parse(text) as { profiles: { list: Array<{ colorScheme?: string }> } }).profiles.list.map(p => p.colorScheme)
  expect(schemeOf(updateWtSettings(three, toWtScheme(ram), '{574E775E-4F2A-5B96-AC1E-A2962A402336}'))).toEqual([undefined, undefined, 'Doki Ram'])
  expect(schemeOf(updateWtSettings(three, toWtScheme(ram), '{not-in-the-list}'))).toEqual([undefined, 'Doki Ram', undefined])
  expect(schemeOf(updateWtSettings(three.replace('Command Prompt"', 'Gone"'), toWtScheme(ram)))).toEqual(['Doki Ram', undefined, undefined])

  const settings = JSON.parse(updateClaudeSettings('{"env":{"A":"1"},"theme":"custom:doki-ram"}', 'custom:doki-vanilla'))
  expect(settings).toEqual({ env: { A: '1' }, theme: 'custom:doki-vanilla' })
})

test('settings.json keeps its CRLF and gets a one-line diff', async () => {
  const before = '{\r\n  "env": {\r\n    "theme": "nested-stays"\r\n  },\r\n  "theme": "custom:doki-ram",\r\n  "model": "opus"\r\n}'
  const after = updateClaudeSettings(before, 'custom:doki-vanilla')
  expect(after).toBe(before.replace('"theme": "custom:doki-ram"', '"theme": "custom:doki-vanilla"'))
  // No top-level line to edit: a full rewrite, still CRLF, still no final newline.
  const compact = '{"a":1}\r\n'
  expect(updateClaudeSettings(compact, 'custom:doki-ram')).toBe('{\r\n  "a": 1,\r\n  "theme": "custom:doki-ram"\r\n}\r\n')
  expect(matchStyle('{\n}', '{\n  "a": 1\n}\n')).toBe('{\n  "a": 1\n}')
})

test('swatch strip is a valid 2-row raster', async () => {
  const strip = swatchCells(ram, 2)
  expect(strip.columns).toBe(16)
  expect(strip.rows).toBe(2)
  expect(atob(strip.cells).length).toBe(16 * 2 * 12)
})

const DRACULA = {
  name: 'Dracula',
  slug: 'dracula',
  colors: {
    accent: '#FF79C6', background: '#282A36', error: '#FF5555', focusRing: '#BD93F9', foreground: '#F8F8F2', info: '#8BE9FD',
    muted: '#44475A', mutedForeground: '#6272A4', primary: '#BD93F9', secondary: '#FF79C6', selection: '#44475A', success: '#50FA7B', warning: '#F1FA8C',
  },
}

test('a termcn theme maps onto the picker colors', async () => {
  const t = toTermcnTheme(DRACULA)
  expect(t).toMatchObject({ name: 'Dracula', slug: 'termcn-dracula', dark: true, source: 'termcn' })
  expect(t.colors).toMatchObject({
    bg: '#282A36', fg: '#F8F8F2', accent: '#FF79C6', muted: '#6272A4', subtle: '#44475A', selection: '#44475A', cursor: '#BD93F9',
    red: '#FF5555', error: '#FF5555', green: '#50FA7B', constant: '#50FA7B', yellow: '#F1FA8C', cls: '#F1FA8C',
    blue: '#8BE9FD', cyan: '#8BE9FD', interface: '#8BE9FD', magenta: '#FF79C6', purple: '#BD93F9', func: '#BD93F9', bool: '#FF79C6',
  })
  expect(t.colors.widget).toBe(lightness('#282A36', 0.04))
  expect(toClaudeTheme(t).name).toBe('termcn Dracula')
  expect(toWtScheme(t).name).toBe('termcn Dracula')
  // dark is read off the background's luminance
  expect(luminance('#ffffff')).toBeGreaterThan(0.99)
  expect(toTermcnTheme({ ...DRACULA, colors: { ...DRACULA.colors, background: '#FAFAFA' } }).dark).toBe(false)
})

test('termcn slug and preference round-trip, and findTheme finds termcn names', async () => {
  const t = toTermcnTheme(DRACULA)
  expect(preferenceOf(t)).toBe('custom:termcn-dracula')
  expect(slugOfPreference(preferenceOf(t))).toBe(t.slug)
  const ram = findTheme('ram')!
  expect(slugOfPreference(preferenceOf(ram))).toBe('ram')
  expect(slugOfPreference('custom:other')).toBe('')
  expect(findTheme('termcn dracula')?.slug).toBe('termcn-dracula')
  expect(findTheme('custom:termcn-nord')?.slug).toBe('termcn-nord')
  expect(findTheme('nord')?.slug).toBe('termcn-nord')
  expect(findTheme('ram')?.slug).toBe('ram')
  expect(new Set(TERMCN_RAW.map(r => `termcn-${r.slug}`)).size).toBe(TERMCN_RAW.length)
})

test('list groups Doki first, then termcn, each dark before light', async () => {
  const list = ordered()
  const firstTermcn = list.findIndex(t => t.source === 'termcn')
  expect(firstTermcn).toBe(88)
  expect(list.slice(0, 88).every(t => t.source !== 'termcn')).toBe(true)
  expect(list.slice(firstTermcn).every(t => t.source === 'termcn')).toBe(true)
  const flags = list.slice(firstTermcn).map(t => t.dark)
  expect(flags).toEqual([...flags].sort((a, b) => Number(b) - Number(a)))
})
