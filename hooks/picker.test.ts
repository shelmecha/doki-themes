import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'
import { findTheme, ordered, sourceLabel } from './theme'

const PANE = 'doki-theme-picker'
const PLUGIN = 'doki-theme-picker'
const HOME = 'C:/home'
const SETTINGS = `${HOME}/.claude/settings.json`
const WT = 'C:/local/Packages/Microsoft.WindowsTerminal_8wekyb3d8bbwe/LocalState/settings.json'

const paneProps = (bodyRows: number) => ({
  title: 'Doki themes',
  isFocused: true,
  bodyColumns: 46,
  placement: 'dock' as const,
  scroll: { offset: 0, bodyRows },
  view: {},
})

const norm = (path: string) => path.replace(/\//g, '\\')

/** Paths keyed as the engine hands them (backslashes on Windows), looked up either way. */
class Files extends Map<string, string> {
  override get(path: string) {
    return super.get(norm(path))
  }
  override has(path: string) {
    return super.has(norm(path))
  }
  override set(path: string, text: string) {
    return super.set(norm(path), text)
  }
}

/** A file system in memory and a log of everything the plugin asked the outside world for. */
function world(on: On, env: Record<string, string> = {}) {
  const files = new Files([
    // Another local mod, so ~/.claude/mods exists and the accent file is written.
    [`${HOME}/.claude/mods/other-mod/hooks.json`, '{}'],
    [SETTINGS, JSON.stringify({ env: { A: '1' }, theme: 'custom:doki-ram' }, null, 2)],
    [
      WT,
      JSON.stringify({
        schemes: [{ name: 'Doki Ram' }],
        profiles: { list: [{ guid: '{61c54bbd-c2c6-5271-96e7-009a87ff44bf}', colorScheme: 'Doki Ram' }] },
      }),
    ],
  ])
  const log = { toasts: [] as string[], config: [] as unknown[], opened: [] as unknown[], closed: [] as string[], focused: [] as string[] }
  mock.env(on, { USERPROFILE: HOME, LOCALAPPDATA: 'C:/local', ...env })
  // A path exists when it is a file, or a folder that holds one.
  on('fs.exists', async (_$, e) => ({ value: files.has(e.path) || [...files.keys()].some(k => k.startsWith(`${norm(e.path)}\\`)) }))
  on('fs.read', async (_$, e) => {
    const text = files.get(e.path)
    if (text === undefined) throw new Error(`ENOENT ${e.path}`)
    return { value: text }
  })
  on('fs.write', async (_$, e) => {
    files.set(e.path, e.text)
    return { value: undefined }
  })
  on('config.set', async (_$, e) => {
    log.config.push(e.value)
    return { value: e.value }
  })
  on('ui.toast', async (_$, e) => {
    log.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.open', async (_$, e) => {
    log.opened.push(e)
    return { value: { isPlaced: true as const } }
  })
  on('ui.close', async (_$, e) => {
    log.closed.push(e.id)
    return { value: undefined }
  })
  on('ui.focus', async (_$, e) => {
    if (e.element) log.focused.push(e.element)
    return {}
  })
  on('command.register', async (_$, e) => ({ value: { command: e.name } }))
  on('session.start', async (_$, e) => ({ cwd: e.cwd }))
  return { files, log }
}

const START = { cwd: HOME, surface: 'terminal' as const, isInteractive: true }
const RUN = { command: 'doki-theme-picker', origin: { kind: 'composer' as const }, presentation: { isFullscreen: true, columns: 160 } }
const person = { kind: 'person' as const }
const focus = (element: string) => ({ component: 'Pane' as const, requestId: PANE, plugin: PLUGIN, element, origin: person })
const indexOf = (slug: string) => ordered().findIndex(t => t.slug === slug)
/** The person's arrow that the engine reads as a scroll: moves the highlight by `by` themes. */
const jump = ($: { ui: { scroll: (a: never) => Promise<unknown> } }, by: number) =>
  $.ui.scroll({ component: 'Pane', requestId: PANE, offset: 0, by, bodyRows: 30, contentRows: 40, origin: person } as never)

// The buttons are keyed by SLOT (slot-0, slot-1, ...), not by theme: find a theme's button by its label.
type Row = { key?: string; props: { label?: unknown; autoFocus?: unknown } }
type Mounted = { findAll: (q: { type: string }) => Promise<Row[]>; find: (q: { type: string; text: RegExp }) => Promise<{ text?: unknown } | undefined> }
const buttons = async (ui: Mounted) => await ui.findAll({ type: 'Button' })
const keyOf = async (ui: Mounted, slug: string) => (await buttons(ui)).find(b => String(b.props.label).slice(3) === findTheme(slug)!.name)!.key!
const labelAt = async (ui: Mounted, slot: number) => String((await buttons(ui))[slot]!.props.label).slice(3)
const headerText = async (ui: Mounted) => String((await ui.find({ type: 'Text', text: /^(Doki|termcn) .* · (dark|light)( · current)?$/ }))?.text)
const named = (slug: string) => `${sourceLabel(findTheme(slug)!)} ${findTheme(slug)!.name} · ${findTheme(slug)!.dark ? 'dark' : 'light'}`

test('the picker pane validates on terminal, previews the ring, and Enter applies the theme', async ($, on) => {
  const { files, log } = world(on)
  await $.session.start(START)

  // /doki-theme-picker with no argument opens the focused pane on the current theme.
  const opened = await $.command.run({ ...RUN, args: '' })
  expect(opened.text).toContain('picker opened')
  expect(log.opened[0]).toMatchObject({ id: PANE, focus: true, closeOnEscape: true })

  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: PANE, props: paneProps(30) })
  expect(await ui.find({ type: 'Text', text: 'Doki Ram · dark · current' }), "find#1").toBeDefined()
  expect(await ui.find({ type: 'Raster', key: 'swatch' }), "find#2").toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'DOKI · DARK (64)' }), "find#3").toBeDefined()
  const ramButton = (await buttons(ui as never)).find(b => String(b.props.label) === '●  Ram')
  expect(ramButton?.props.autoFocus).toBe(true)
  // The window fits the body, so the engine has nothing to scroll and the arrows walk the ring.
  expect((await ui.findAll({ type: 'Button' })).length <= 30 - 11).toBe(true)

  // The person's arrow moves the ring onto Rem: the preview follows.
  await $.ui.focus(focus(await keyOf(ui as never, 'rem')))
  expect(await ui.find({ type: 'Text', text: 'Doki Rem · dark' }), "find#4").toBeDefined()

  // An arrow the engine reads as a scroll moves the highlight one theme down instead.
  const scrolled = await $.ui.scroll({ component: 'Pane', requestId: PANE, offset: 1, by: 1, bodyRows: 30, contentRows: 40, origin: person })
  expect(scrolled).toEqual({})
  const afterRem = (await ui.find({ type: 'Text', text: /^Doki .* · dark$/ }))?.text
  expect(afterRem).not.toBe('Doki Rem · dark')

  // Move to Vanilla, press Enter on it.
  await jump($ as never, indexOf('vanilla') - (indexOf('rem') + 1))
  expect(await ui.find({ type: 'Text', text: 'Doki Vanilla · dark' }), "find#5").toBeDefined()
  await ui.press({ key: await keyOf(ui as never, 'vanilla') })

  const theme = JSON.parse(files.get(`${HOME}/.claude/themes/doki-vanilla.json`)!)
  expect(theme.name).toBe('Doki Vanilla')
  expect(theme.base).toBe('dark-daltonized')
  expect(log.config).toEqual(['custom:doki-vanilla'])
  expect(JSON.parse(files.get(SETTINGS)!).theme).toBe('custom:doki-vanilla')
  expect(JSON.parse(files.get(SETTINGS)!).env).toEqual({ A: '1' })
  const wt = JSON.parse(files.get(WT)!)
  expect(wt.profiles.list[0].colorScheme).toBe('Doki Vanilla')
  expect(JSON.parse(files.get(`${HOME}/.claude/mods/theme-accent.json`)!).name).toBe('Vanilla')
  expect(log.toasts).toEqual(['Theme: Doki Vanilla'])
  expect(log.closed).toEqual([PANE])
  // Backups were taken before settings.json and Windows Terminal were changed.
  expect([...files.keys()].some(k => k.startsWith(norm(`${HOME}/.claude/backups/settings.json.`)))).toBe(true)
  expect([...files.keys()].some(k => k.startsWith(norm(`${HOME}/.claude/backups/wt-settings.json.`)))).toBe(true)

  // The list now marks Vanilla as current.
  expect((await buttons(ui as never)).find(b => String(b.props.label) === '●  Vanilla')).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Doki Vanilla · dark · current' }), 'vanilla current').toBeDefined()
  // Ram, the old theme, loses its mark.
  await jump($ as never, indexOf('ram') - indexOf('vanilla'))
  expect((await buttons(ui as never)).find(b => String(b.props.label) === '   Ram')).toBeDefined()
  await ui.unmount()
})

test('a fresh home: the tab Windows Terminal profile gets the scheme, and no mods folder is made', async ($, on) => {
  const { files } = world(on, { WT_PROFILE_ID: '{574E775E-4F2A-5B96-AC1E-A2962A402336}' })
  files.delete(norm(`${HOME}/.claude/mods/other-mod/hooks.json`))
  files.delete(norm(SETTINGS))
  files.set(
    WT,
    JSON.stringify({
      defaultProfile: '{61c54bbd-c2c6-5271-96e7-009a87ff44bf}',
      profiles: {
        list: [
          { guid: '{61c54bbd-c2c6-5271-96e7-009a87ff44bf}', name: 'Windows PowerShell' },
          { guid: '{574e775e-4f2a-5b96-ac1e-a2962a402336}', name: 'PowerShell' },
        ],
      },
    }),
  )
  await $.session.start(START)
  const done = await $.command.run({ ...RUN, args: 'vanilla' })
  expect(done.text).toContain('Windows Terminal scheme')
  const wt = JSON.parse(files.get(WT)!)
  expect(wt.profiles.list[0].colorScheme).toBeUndefined()
  expect(wt.profiles.list[1].colorScheme).toBe('Doki Vanilla')
  expect([...files.keys()].some(k => k.includes(norm('/.claude/mods/')))).toBe(false)
  // No settings.json before: one is made that holds only the theme.
  expect(JSON.parse(files.get(SETTINGS)!)).toEqual({ theme: 'custom:doki-vanilla' })
})

test('the window slides: focusing the last drawn theme draws the next one', async ($, on) => {
  world(on)
  await $.session.start(START)
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: PANE, props: paneProps(20) })
  const before = await buttons(ui as never)
  const last = before[before.length - 1]!
  await $.ui.focus(focus(last.key!))
  const after = (await buttons(ui as never)).map(b => String(b.props.label))
  expect(after).toContain(String(last.props.label))
  expect(after.indexOf(String(last.props.label)) < after.length - 1).toBe(true)
  // Light themes sit under their own header at the end of the list.
  const lastSlug = ordered().find(t => t.name === String(last.props.label).slice(3))!.slug
  await jump($ as never, indexOf('beatrice') - indexOf(lastSlug))
  expect(await ui.find({ type: 'Text', text: 'DOKI · LIGHT (24)' }), "find#6").toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Doki Beatrice · light' }), "find#7").toBeDefined()
  await ui.unmount()
})

test('a click on a theme the ring is not on applies that theme, not the highlight', async ($, on) => {
  const { files, log } = world(on)
  await $.session.start(START)
  await $.command.run({ ...RUN, args: '' })
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: PANE, props: paneProps(30) })
  expect(await headerText(ui as never)).toContain(named('ram'))
  // A click raises only ui.press for the clicked slot; the ring and the highlight stay on Ram (seen live 2026-10-06).
  const remKey = await keyOf(ui as never, 'rem')
  expect(remKey).not.toBe(await keyOf(ui as never, 'ram'))
  await ui.press({ key: remKey })
  expect(JSON.parse(files.get(SETTINGS)!).theme).toBe('custom:doki-rem')
  expect(log.toasts).toEqual(['Theme: Doki Rem'])
  expect(log.closed).toEqual([PANE])
  await ui.unmount()
})

test('/doki-theme-picker <name> applies directly; an unknown name fails', async ($, on) => {
  const { files } = world(on)
  await $.session.start(START)
  const ok = await $.command.run({ ...RUN, args: 'senko' })
  expect(ok.text).toContain('Theme: Doki Senko')
  expect(JSON.parse(files.get(`${HOME}/.claude/themes/doki-senko.json`)!).base).toBe('light-daltonized')
  const nord = await $.command.run({ ...RUN, args: 'nord' })
  expect(nord.text).toContain('Theme: termcn Nord')
  expect(JSON.parse(files.get(`${HOME}/.claude/themes/termcn-nord.json`)!).name).toBe('termcn Nord')
  expect(JSON.parse(files.get(SETTINGS)!).theme).toBe('custom:termcn-nord')
  const bad = await $.command.run({ ...RUN, args: 'not-a-theme' })
  expect(bad.exitCode).toBe(1)
})

const typed = (text: string) => ({ text, wait: false, origin: { kind: 'composer' as const } })
const accentName = (files: Files) => JSON.parse(files.get(`${HOME}/.claude/mods/theme-accent.json`) ?? '{}').name
const backups = (files: Files) => [...files.keys()].filter(k => k.includes(norm('/.claude/backups/'))).length

test('/theme sets one of our themes: the next prompt brings Windows Terminal and the accent file along', async ($, on) => {
  const { files } = world(on)
  on('prompt.submit', async (_$, e) => ({ text: e.text }))
  await $.session.start(START)
  await $.command.run({ ...RUN, args: 'vanilla' })
  expect(accentName(files)).toBe('Vanilla')

  // Claude Code's /theme writes only settings.json.
  files.set(SETTINGS, JSON.stringify({ env: { A: '1' }, theme: 'custom:termcn-nord' }, null, 2))
  await $.prompt.submit(typed('hello'))
  expect(accentName(files)).toBe('Nord')
  expect(JSON.parse(files.get(WT)!).profiles.list[0].colorScheme).toBe('termcn Nord')
  // settings.json is left as the person set it.
  expect(JSON.parse(files.get(SETTINGS)!).theme).toBe('custom:termcn-nord')

  // In step: the next prompt writes nothing.
  const before = backups(files)
  await $.prompt.submit(typed('again'))
  expect(backups(files)).toBe(before)

  // A built-in theme is not ours: nothing follows.
  files.set(SETTINGS, JSON.stringify({ theme: 'dark' }, null, 2))
  await $.prompt.submit(typed('dark now'))
  expect(accentName(files)).toBe('Nord')
  expect(backups(files)).toBe(before)
})

test('termcn themes sit under their own sticky header in the list', async ($, on) => {
  world(on)
  await $.session.start(START)
  await $.command.run({ ...RUN, args: '' })
  const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: PANE, props: paneProps(30) })
  await jump($ as never, indexOf('termcn-nord') - indexOf('ram'))
  expect(await ui.find({ type: 'Text', text: 'termcn Nord · dark' }), 'termcn title').toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^TERMCN · DARK \(\d+\)$/ }), 'termcn header').toBeDefined()
  await ui.unmount()
})

/**
 * The engine model: the ring sits on a slot of the drawing the engine holds, and a Down names the next slot of THAT
 * drawing. `see()` takes the drawing; presses between two see() calls have no redraw between them.
 */
function engine(log: { focused: string[] }, ui: Mounted) {
  let ring = 0
  let drawn: string[] = []
  return {
    async see(fromAutoFocus = false) {
      const rows = await buttons(ui)
      drawn = rows.map(b => b.key!)
      if (fromAutoFocus) ring = rows.findIndex(b => b.props.autoFocus === true)
    },
    async down($: { ui: { focus: (a: ReturnType<typeof focus>) => Promise<unknown> } }, by = 1) {
      log.focused.length = 0
      await $.ui.focus(focus(drawn[ring + by]!))
      ring = drawn.indexOf(log.focused[log.focused.length - 1] ?? drawn[ring + by]!)
    },
    get ring() {
      return ring
    },
  }
}

test('several Downs with no redraw between them move that many rows; the ring row and the header name one theme', async ($, on) => {
  const { log } = world(on)
  await $.session.start(START)
  await $.command.run({ ...RUN, args: '' })
  const ui = (await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: PANE, props: paneProps(30) })) as never as Mounted & {
    unmount: () => Promise<void>
  }
  const eng = engine(log, ui)
  const list = ordered()
  const start = indexOf('ram')
  await eng.see(true)
  // 8 quick Downs. The engine names each next button from the drawing it still holds (taken once, before the burst),
  // so a hook that goes by theme names sees the same theme 8 times and moves 1 row (observed live, 2026-10-04).
  for (let i = 0; i < 8; i++) await eng.down($)
  const down8 = list[start + 8]!.slug
  expect(await headerText(ui), 'header after 8 Downs').toContain(named(down8))
  expect(await labelAt(ui, eng.ring), 'the row under the ring after 8 Downs').toBe(findTheme(down8)!.name)

  // 8 Ups from there, again with no redraw taken between them.
  await eng.see()
  for (let i = 0; i < 8; i++) await eng.down($, -1)
  const home = list[start]!.slug
  expect(await headerText(ui), 'header after 8 Ups').toContain(named(home))
  expect(await labelAt(ui, eng.ring), 'the row under the ring after 8 Ups').toBe(findTheme(home)!.name)
  await ui.unmount()
})

test('Down across group boundaries keeps row and header on one theme, with a redraw between presses', async ($, on) => {
  const { log } = world(on)
  await $.session.start(START)
  await $.command.run({ ...RUN, args: '' })
  const ui = (await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', component: 'Pane', requestId: PANE, props: paneProps(30) })) as never as Mounted & {
    unmount: () => Promise<void>
  }
  const eng = engine(log, ui)
  const list = ordered()
  const lastDark = list.filter(t => (t.source ?? 'doki') === 'doki' && t.dark).slice(-1)[0]!.slug
  await jump($ as never, indexOf(lastDark) - indexOf('ram'))
  await eng.see(true)
  let at = indexOf(lastDark)
  // Down across DOKI DARK -> DOKI LIGHT -> TERMCN, a fresh drawing before each press.
  for (let i = 0; i < 40; i++) {
    await eng.down($)
    await eng.see()
    at += 1
    const slug = list[at]!.slug
    expect(await labelAt(ui, eng.ring), `row under the ring at ${slug}`).toBe(findTheme(slug)!.name)
    expect(await headerText(ui), `header at ${slug}`).toContain(named(slug))
  }
  await ui.unmount()
})
