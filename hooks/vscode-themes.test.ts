import { expect, test } from 'claude-code/testing'

import { THEMES, contrast, luminance } from './theme'
import { lowestTextContrast, parseJsonc, parseStore, serializeStore, syncVscodeThemes, themesOf } from './vscode-themes'
import type { SyncFs } from './vscode-themes'

const ROOT = 'home/.vscode/extensions'

/** An in-memory folder tree: file paths to text and mtime. */
function memoryFs(files: Record<string, string>, mtimes: Record<string, number> = {}): SyncFs & { files: Record<string, string> } {
  const dirs = () => new Set(Object.keys(files).flatMap(p => p.split('/').map((_, i, a) => a.slice(0, i).join('/'))))
  return {
    files,
    exists: async p => p in files || dirs().has(p),
    list: async p => {
      if (!dirs().has(p)) throw new Error('no folder')
      const names = new Map<string, string>()
      for (const f of Object.keys(files)) if (f.startsWith(`${p}/`)) {
        const rest = f.slice(p.length + 1).split('/')
        names.set(rest[0]!, rest.length > 1 ? 'dir' : 'file')
      }
      return [...names].map(([name, kind]) => ({ name, kind }))
    },
    read: async p => {
      if (!(p in files)) throw new Error(`no file ${p}`)
      return files[p]!
    },
    stat: async p => {
      if (!(p in files)) throw new Error('no file')
      return { mtimeMs: mtimes[p] ?? 1 }
    },
  }
}

const pkg = (publisher: string, displayName: string, themes: { label: string; uiTheme: string; path: string }[]) =>
  JSON.stringify({ publisher, displayName, contributes: { themes } })

function extension(folder: string, publisher: string, displayName: string, themes: Record<string, { uiTheme: string; text: string }>) {
  const out: Record<string, string> = {
    [`${ROOT}/${folder}/package.json`]: pkg(
      publisher,
      displayName,
      Object.keys(themes).map(label => ({ label, uiTheme: themes[label]!.uiTheme, path: `./themes/${label}.json` })),
    ),
  }
  for (const [label, t] of Object.entries(themes)) out[`${ROOT}/${folder}/themes/${label}.json`] = t.text
  return out
}

const pinkTheme = (bg = '#1a1020', keyword = '#ff79c6') =>
  `// comment\n{ "colors": { "editor.background": "${bg}", "editor.foreground": "#eeeeee", }, "tokenColors": [ { "scope": "keyword", "settings": { "foreground": "${keyword}" } } ] }`

test('a new extension is added in its own group', async () => {
  const fs = memoryFs(extension('acme.pink-1.0.0', 'acme', 'Pink Theme', { Pink: { uiTheme: 'vs-dark', text: pinkTheme() } }))
  const r = await syncVscodeThemes(fs, [ROOT], parseStore(undefined).store)
  expect(r.changed).toBe(true)
  expect(r.added).toEqual(['acme.pink'])
  const [t] = themesOf(r.store)
  expect(t!.slug).toBe('vscode-acme-pink-pink')
  expect(t!.group).toBe('Pink Theme')
  expect(t!.source).toBe('vscode')
  expect(t!.dark).toBe(true)
  expect(lowestTextContrast(t!) >= 2.5).toBe(true)
})

test('a version update changes the colors; an unchanged scan changes nothing', async () => {
  const files = extension('acme.pink-1.0.0', 'acme', 'Pink Theme', { Pink: { uiTheme: 'vs-dark', text: pinkTheme() } })
  const first = await syncVscodeThemes(memoryFs(files), [ROOT], parseStore(undefined).store)
  const again = await syncVscodeThemes(memoryFs(files), [ROOT], parseStore(serializeStore(first.store)).store)
  expect(again.changed).toBe(false)
  const v2 = extension('acme.pink-1.1.0', 'acme', 'Pink Theme', { Pink: { uiTheme: 'vs-dark', text: pinkTheme('#000000', '#00ff00') } })
  const r = await syncVscodeThemes(memoryFs({ ...files, ...v2 }), [ROOT], first.store)
  expect(r.updated).toEqual(['acme.pink'])
  expect(themesOf(r.store)).toHaveLength(1)
  expect(themesOf(r.store)[0]!.colors.bg).toBe('#000000')
  expect(themesOf(r.store)[0]!.colors.bg === themesOf(first.store)[0]!.colors.bg).toBe(false)
})

test('a removed extension keeps its themes', async () => {
  const files = extension('acme.pink-1.0.0', 'acme', 'Pink Theme', { Pink: { uiTheme: 'vs-dark', text: pinkTheme() } })
  const first = await syncVscodeThemes(memoryFs(files), [ROOT], parseStore(undefined).store)
  const r = await syncVscodeThemes(memoryFs({ [`${ROOT}/other.thing-1.0.0/package.json`]: '{}' }), [ROOT], first.store)
  expect(themesOf(r.store).map(t => t.name)).toEqual(['Pink'])
})

test('a malformed theme is skipped with a reason; its good sibling stays', async () => {
  const fs = memoryFs(
    extension('acme.mixed-1.0.0', 'acme', 'Mixed', {
      Good: { uiTheme: 'vs', text: '{ "colors": { "editor.background": "#ffffff" } }' },
      Bad: { uiTheme: 'vs-dark', text: '{ "colors": ' },
    }),
  )
  const r = await syncVscodeThemes(fs, [ROOT], parseStore(undefined).store)
  expect(themesOf(r.store).map(t => t.name)).toEqual(['Good'])
  expect(r.store.skipped).toHaveLength(1)
  expect(r.store.skipped[0]!.theme).toBe('Bad')
  expect(r.store.skipped[0]!.reason.length > 0).toBe(true)
})

test('paths outside the extension folder are refused', async () => {
  const files = extension('acme.escape-1.0.0', 'acme', 'Escape', { E: { uiTheme: 'vs-dark', text: '{ "include": "../../secret.json" }' } })
  files[`${ROOT}/secret.json`] = '{ "colors": {} }'
  const r = await syncVscodeThemes(memoryFs(files), [ROOT], parseStore(undefined).store)
  expect(themesOf(r.store)).toHaveLength(0)
  expect(r.store.skipped[0]!.reason.includes('outside')).toBe(true)
})

test('include chains, tmTheme token colors and obsolete folders', async () => {
  const files = extension('acme.chain-2.0.0', 'acme', 'Chain', { C: { uiTheme: 'vs-dark', text: '{ "include": "./base.json", "colors": { "editor.foreground": "#ffffff" } }' } })
  files[`${ROOT}/acme.chain-2.0.0/themes/base.json`] = '{ "colors": { "editor.background": "#101010" }, "tokenColors": "./t.tmTheme" }'
  files[`${ROOT}/acme.chain-2.0.0/themes/t.tmTheme`] =
    '<plist><dict><key>settings</key><array><dict><key>settings</key><dict><key>background</key><string>#101010</string></dict></dict><dict><key>scope</key><string>string</string><key>settings</key><dict><key>foreground</key><string>#55ff55</string></dict></dict></array></dict></plist>'
  Object.assign(files, extension('acme.chain-3.0.0', 'acme', 'Chain', { C: { uiTheme: 'vs', text: '{ "colors": { "editor.background": "#ffffff" } }' } }))
  files[`${ROOT}/.obsolete`] = '{ "acme.chain-3.0.0": true }'
  const r = await syncVscodeThemes(memoryFs(files), [ROOT], parseStore(undefined).store)
  const [t] = themesOf(r.store)
  expect(t!.colors.bg).toBe('#101010')
  expect(t!.colors.green).toBe('#55ff55')
})

test('a missing VS Code folder is safe and changes nothing', async () => {
  const r = await syncVscodeThemes(memoryFs({}), [ROOT, 'home/.vscode-insiders/extensions'], parseStore(undefined).store)
  expect(r.changed).toBe(false)
  expect(themesOf(r.store)).toHaveLength(0)
})

test('Doki and termcn extensions are skipped', async () => {
  const fs = memoryFs({
    ...extension('unthrottled.doki-theme-88.1.18', 'unthrottled', 'Doki Theme', { Ram: { uiTheme: 'vs-dark', text: pinkTheme() } }),
    ...extension('local.termcn-themes-1.1.0', 'local', 'termcn Themes', { Dracula: { uiTheme: 'vs-dark', text: pinkTheme() } }),
  })
  const r = await syncVscodeThemes(fs, [ROOT], parseStore(undefined).store)
  expect(themesOf(r.store)).toHaveLength(0)
})

test('mid-tone backgrounds move out of 0.1..0.5 and text stays readable', async () => {
  const fs = memoryFs(extension('acme.grey-1.0.0', 'acme', 'Grey', { G: { uiTheme: 'vs-dark', text: '{ "colors": { "editor.background": "#808080", "editor.foreground": "#999999" } }' } }))
  const [t] = themesOf((await syncVscodeThemes(fs, [ROOT], parseStore(undefined).store)).store)
  expect(luminance(t!.colors.bg) <= 0.1).toBe(true)
  expect(t!.dark).toBe(true)
  expect(contrast(t!.colors.bg, t!.colors.fg) >= 7).toBe(true)
})

test('a corrupt store reads as empty and is flagged; JSONC keeps comment-like text in strings', () => {
  expect(parseStore('{ nope').corrupt).toBe(true)
  expect(parseStore(undefined).corrupt).toBe(false)
  expect(parseJsonc('{ "a": "http://x", /* c */ }')).toEqual({ a: 'http://x' })
})

test('no synced slug collides with a built-in theme', async () => {
  const fs = memoryFs(extension('acme.ram-1.0.0', 'acme', 'Ram', { Ram: { uiTheme: 'vs-dark', text: pinkTheme() } }))
  const [t] = themesOf((await syncVscodeThemes(fs, [ROOT], parseStore(undefined).store)).store)
  expect(THEMES.some(b => b.slug === t!.slug)).toBe(false)
})
