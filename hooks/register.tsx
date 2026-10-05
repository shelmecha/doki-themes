import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { DokiTheme } from '../types'
import {
  findTheme,
  ordered,
  preferenceOf,
  slugOfPreference,
  sourceLabel,
  stamp,
  swatchCells,
  toAccent,
  toClaudeTheme,
  toWtScheme,
  updateClaudeSettings,
  updateWtSettings,
  windowStart,
} from './theme'

const PANE = 'doki-theme-picker'
const COMMAND = 'doki-theme-picker'
const PREVIEW_ROWS = 11 // title, 2 swatch rows, 5 mock-terminal rows (with padding), hint, 2 spacers
const WT_SETTINGS = 'Packages/Microsoft.WindowsTerminal_8wekyb3d8bbwe/LocalState/settings.json'

const highlight = atom({ plugin: 'doki-theme-picker', key: 'highlight' } as const, '')
const current = atom({ plugin: 'doki-theme-picker', key: 'current' } as const, '')

const LIST = ordered()
// The rows the list draws, group headers included: what the window slides over.
type Row = { kind: 'header'; label: string } | { kind: 'theme'; theme: DokiTheme }
const ROWS: Row[] = []
// The header row each row sits under, so the sticky header can name the source.
const HEADER_OF: number[] = []
for (const source of ['doki', 'termcn'] as const) {
  for (const dark of [true, false]) {
    const group = LIST.filter(t => (t.source ?? 'doki') === source && t.dark === dark)
    if (group.length === 0) continue
    const header = ROWS.length
    ROWS.push({ kind: 'header', label: `${source.toUpperCase()} · ${dark ? 'DARK' : 'LIGHT'} (${group.length})` })
    HEADER_OF.push(header)
    for (const theme of group) {
      ROWS.push({ kind: 'theme', theme })
      HEADER_OF.push(header)
    }
  }
}
const FALLBACK = findTheme('ram') ?? LIST[0]!

// The body height the last render saw: the hooks need it to know which rows a window holds.
let bodyRows = 30

/** The rows the window draws around `slug`, one of them taken for the sticky group header. */
function windowAround(slug: string, rows: number = bodyRows): { start: number; visible: Row[]; buttons: string[] } {
  const size = Math.max(6, rows - PREVIEW_ROWS)
  const rowIndex = ROWS.findIndex(row => row.kind === 'theme' && row.theme.slug === slug)
  const start = windowStart(rowIndex, ROWS.length, size - 1)
  const visible = ROWS.slice(start, start + size - 1)
  const buttons = visible.flatMap(row => (row.kind === 'theme' ? [row.theme.slug] : []))
  return { start, visible, buttons }
}

/**
 * The ring is tracked by SLOT, not by theme. Every button is keyed `slot-<n>`, n the place among the drawn buttons.
 * The engine keeps the ring on the same slot when the window slides, and when several keys arrive before a redraw
 * (a burst, a fast typist) it works out each "next button" from the SLOT the ring still holds in the old drawing.
 * Names from that old drawing are stale then (observed 2026-10-04: 8 Downs sent 8 ui.focus events that all named
 * the same theme, so the highlight moved 1 row). A slot is the same in every drawing, so the move is
 * (slot named) - (slot the ring is on): one Down is +1 however many redraws are still pending.
 */
const slotKey = (slot: number) => `slot-${slot}`
const slotOfKey = (element: string | undefined) => {
  const match = /^slot-(\d+)$/.exec(element ?? '')
  return match ? Number(match[1]) : -1
}
/** The slot `slug` takes among the buttons of the window drawn around it. */
const slotOfTheme = (slug: string) => windowAround(slug).buttons.indexOf(slug)

// The slot the engine's ring sits on, as this module last set it or was told.
let ringSlot = -1
// Moves arrive one at a time: each reads the ring slot and the highlight the one before left.
let queue: Promise<unknown> = Promise.resolve()
function inOrder<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job)
  queue = run.catch(() => undefined)
  return run
}

/** Moves the highlight to `slug`; says which slot the ring must take so it sits on that theme in the new window. */
async function moveHighlight($: EngineInterface, slug: string): Promise<number> {
  await update($, highlight, () => slug)
  ringSlot = slotOfTheme(slug)
  return ringSlot
}

async function home($: EngineInterface): Promise<string> {
  return ((await $.env.get('USERPROFILE')) ?? (await $.env.get('HOME')) ?? '').replace(/\\/g, '/')
}

async function readOr($: EngineInterface, path: string): Promise<string | undefined> {
  try {
    if (!(await $.fs.exists(path))) return undefined
    const text = await $.fs.read(path)
    return typeof text === 'string' ? text : undefined
  } catch {
    return undefined
  }
}

/** Copies a user file to ~/.claude/backups/<name>.<stamp> before it is changed. */
async function backup($: EngineInterface, root: string, path: string, name: string, text: string): Promise<string> {
  const target = `${root}/.claude/backups/${name}.${stamp(new Date())}`
  await $.fs.write(target, text)
  return target
}

async function currentSlug($: EngineInterface): Promise<string> {
  const settings = await readOr($, `${await home($)}/.claude/settings.json`)
  try {
    return slugOfPreference((JSON.parse(settings ?? '{}') as { theme?: unknown }).theme)
  } catch {
    return ''
  }
}

/** Writes the theme everywhere it shows: Claude Code, Windows Terminal, the shared accent file. */
async function apply($: EngineInterface, theme: DokiTheme): Promise<string[]> {
  const root = await home($)
  const notes: string[] = []
  const preference = preferenceOf(theme)

  // 1. The Claude Code theme file (hot-reloaded from ~/.claude/themes).
  const themeFile = `${preference.replace(/^custom:/, '')}.json`
  const themePath = `${root}/.claude/themes/${themeFile}`
  const oldTheme = await readOr($, themePath)
  if (oldTheme !== undefined) await backup($, root, themePath, themeFile, oldTheme)
  await $.fs.write(themePath, JSON.stringify(toClaudeTheme(theme), null, 2) + '\n')
  notes.push(`theme file ${themePath}`)

  // 2. Switch Claude Code to it: the /config row first, then make sure settings.json agrees.
  try {
    const { deny } = await $.config.set({ key: 'theme', value: preference })
    notes.push(deny ? `config.set refused (${deny})` : 'config.set theme')
  } catch (error) {
    notes.push(`config.set failed (${String(error).slice(0, 80)})`)
  }
  const settingsPath = `${root}/.claude/settings.json`
  const settings = await readOr($, settingsPath)
  if (settings !== undefined && (JSON.parse(settings) as { theme?: unknown }).theme !== preference) {
    await backup($, root, settingsPath, 'settings.json', settings)
    await $.fs.write(settingsPath, updateClaudeSettings(settings, preference))
    notes.push('settings.json theme')
  }

  // 3. Windows Terminal: the scheme, set on the PowerShell profile.
  const local = ((await $.env.get('LOCALAPPDATA')) ?? '').replace(/\\/g, '/')
  const wtPath = `${local}/${WT_SETTINGS}`
  const wt = local ? await readOr($, wtPath) : undefined
  if (wt !== undefined) {
    try {
      const next = updateWtSettings(wt, toWtScheme(theme))
      await backup($, root, wtPath, 'wt-settings.json', wt)
      await $.fs.write(wtPath, next)
      notes.push('Windows Terminal scheme')
    } catch (error) {
      notes.push(`Windows Terminal skipped (${String(error).slice(0, 80)})`)
    }
  } else {
    notes.push('Windows Terminal not found, skipped')
  }

  // 4. The accent other mods (jev-copilot) draw with.
  await $.fs.write(`${root}/.claude/mods/theme-accent.json`, JSON.stringify(toAccent(theme), null, 2) + '\n')
  notes.push('accent file')

  await update($, current, () => theme.slug)
  $.ui.toast(`Theme: ${sourceLabel(theme)} ${theme.name}`)
  return notes
}

const openPicker = async ($: EngineInterface) => {
  const now = (await read($, current)) || (await currentSlug($))
  await update($, current, () => now)
  const start = findTheme(now)?.slug ?? FALLBACK.slug
  await update($, highlight, () => start)
  ringSlot = slotOfTheme(start)
  return $.ui.open({ id: PANE, title: 'Themes', focus: true, closeOnEscape: true, columns: 48 })
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await update($, current, () => '')
    await $.command.register({
      name: COMMAND,
      description: 'Pick a Doki or termcn theme for Claude Code and Windows Terminal (arrows + Enter)',
      argumentHint: '[theme name]',
    })
    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    const query = e.args.trim()
    if (query) {
      const theme = findTheme(query)
      if (!theme) return { text: `No theme matches "${query}". Run /${COMMAND} to browse.`, exitCode: 1 }
      const notes = await apply($, theme)
      return { text: `Theme: ${sourceLabel(theme)} ${theme.name} (${notes.join('; ')})` }
    }
    const opened = await openPicker($)
    return { text: opened.isPlaced ? 'Theme picker opened: arrows to move, Enter to apply.' : 'Theme picker is waiting for room.' }
  })

  // The person's Tab, arrows or click moved the ring onto a slot: move the highlight by the slots it travelled.
  on('ui.focus', { requestId: PANE }, async ($, e, next) => {
    const slot = slotOfKey(e.element)
    if (slot < 0) return next(e)
    if (e.origin.kind !== 'person') {
      // The first drawing's autoFocus, or this module's own redirect: the ring is where it says.
      ringSlot = slot
      return next(e)
    }
    return inOrder(async () => {
      const slug = (await read($, highlight)) || FALLBACK.slug
      const from = ringSlot >= 0 ? ringSlot : slotOfTheme(slug)
      const index = Math.max(0, LIST.findIndex(t => t.slug === slug))
      // The engine wraps its ring past either end of the buttons it holds (a Down on the last slot lands on slot 0), and
      // a burst can outrun a drawing that has fewer buttons than the new window: a jump of nearly a window's height
      // is that wrap, one press in the other direction. (A click that far away is read the same way: it does nothing.)
      const wrap = Math.max(2, Math.max(6, bodyRows - PREVIEW_ROWS) - 4)
      const travelled = slot - from <= -wrap ? 1 : slot - from >= wrap ? -1 : slot - from
      const target = LIST[Math.max(0, Math.min(LIST.length - 1, index + travelled))]!
      if (target.slug === slug) {
        // Nothing to move (the end of the list, or the same slot): keep the ring where it was.
        return next(from === slot ? e : { ...e, element: slotKey(from) })
      }
      const was = ringSlot
      const to = await moveHighlight($, target.slug)
      const result = await next({ ...e, element: slotKey(to) })
      if (result.deny) {
        // The engine's drawing has no such slot yet: the ring stayed. Ask again once the next drawing brings it.
        ringSlot = was
        void $.ui.focus({ requestId: PANE, key: slotKey(to) }).catch(() => undefined)
      }
      return result
    })
  })

  // If the engine reads an arrow as a scroll (the list overflowed), move the highlight instead.
  on('ui.scroll', { requestId: PANE }, async ($, e, next) => {
    if (e.origin.kind !== 'person' || e.pointer !== undefined || e.by === 0) return next(e)
    return inOrder(async () => {
      const slug = (await read($, highlight)) || FALLBACK.slug
      const index = Math.max(0, LIST.findIndex(t => t.slug === slug))
      const target = LIST[Math.max(0, Math.min(LIST.length - 1, index + e.by))]!
      const to = await moveHighlight($, target.slug)
      // Bring the ring along; a refusal leaves the highlight moved (Enter applies the highlight, not the ring).
      void $.ui.focus({ requestId: PANE, key: slotKey(to) }).catch(() => undefined)
      return {}
    })
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const slug = await read($, highlight)
    const chosen = await read($, current)
    const theme = findTheme(slug) ?? FALLBACK
    const c = theme.colors

    let swatch = null
    if (e.surface === 'terminal') {
      const { Raster } = $.ui.resolve(e)
      const strip = swatchCells(theme, 2)
      swatch = <Raster key="swatch" columns={strip.columns} rows={strip.rows} cells={strip.cells} />
    }

    bodyRows = e.props.scroll.bodyRows
    // One row is kept for a sticky group header, so DARK / LIGHT always shows above the window.
    const { start, visible } = windowAround(theme.slug, bodyRows)
    const top = visible[0]
    const sticky = top && top.kind === 'theme' ? ROWS[HEADER_OF[start]!]! : null

    let slotNumber = -1
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text color={c.accent} bold>
          {sourceLabel(theme)} {theme.name} · {theme.dark ? 'dark' : 'light'}
          {theme.slug === chosen ? ' · current' : ''}
        </Text>
        {swatch}
        <Box key="mock" flexDirection="column" backgroundColor={c.bg} paddingX={1} marginTop={1}>
          <Box flexDirection="row">
            <Text color={c.fg} backgroundColor={c.bg}>
              PS C:\hook-review&gt;{' '}
            </Text>
            <Text color={c.accent} backgroundColor={c.bg}>
              claude
            </Text>
          </Box>
          <Text color={c.accent} backgroundColor={c.bg}>
            Jev ▸ question 92% · small · workflow off
          </Text>
          <Text color={c.red} backgroundColor={c.bg}>
            - const theme = 'old'
          </Text>
          <Text color={c.green} backgroundColor={c.bg}>
            + const theme = '{theme.slug}'
          </Text>
          <Text color={c.muted} backgroundColor={c.bg}>
            ✻ Thinking…
          </Text>
        </Box>
        <Text color={c.subtle}>Tab/↑↓ move · Enter apply · Esc close</Text>
        <Text> </Text>
        {sticky && sticky.kind === 'header' && (
          <Text color={c.muted} bold>
            {sticky.label}
          </Text>
        )}
        {visible.map(row => {
          if (row.kind !== 'header') slotNumber += 1
          return row.kind === 'header' ? (
            <Text color={c.muted} bold>
              {row.label}
            </Text>
          ) : (
            <Box key={`r-${slotKey(slotNumber)}`} flexDirection="row" gap={1}>
              <Text color={row.theme.colors.accent}>██</Text>
              <Button
                key={slotKey(slotNumber)}
                label={`${row.theme.slug === chosen ? '●' : ' '}  ${row.theme.name}`}
                plain
                autoFocus={row.theme.slug === theme.slug ? true : undefined}
                onPress={async () => {
                  // Enter applies the theme the header names (the highlight), whatever the ring holds.
                  const named = findTheme(await read($, highlight)) ?? row.theme
                  await apply($, named)
                  await $.ui.close({ id: PANE })
                }}
              />
            </Box>
          )
        })}
      </Box>
    )
  })
}
