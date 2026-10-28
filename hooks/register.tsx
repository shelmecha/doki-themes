import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement, RenderNode } from 'claude-code'

import type { DokiTheme } from '../types'
import {
  LIVE_PREFERENCE,
  LIVE_SLUG,
  findTheme,
  ordered,
  preferenceOf,
  slugOfLiveTheme,
  slugOfPreference,
  sourceLabel,
  stamp,
  statusLineSlug,
  swatchCells,
  toAccent,
  toClaudeTheme,
  toLiveTheme,
  toWarpTheme,
  toWtScheme,
  updateClaudeSettings,
  updateStatusLineTheme,
  updateWtSettings,
  nextWarpFile,
  updateWarpSettings,
  warpThemeName,
  windowStart,
} from './theme'
import { splitBoxes, splitReply } from './labels'
import type { Piece } from './labels'

const PANE = 'doki-theme-picker'
const COMMAND = 'doki-theme-picker'
const PREVIEW_ROWS = 11 // title, 2 swatch rows, 5 mock-terminal rows (with padding), hint, 2 spacers
// Windows Terminal settings under %LOCALAPPDATA%: the Store build, the Preview build, the unpackaged build.
const WT_SETTINGS = [
  'Packages/Microsoft.WindowsTerminal_8wekyb3d8bbwe/LocalState/settings.json',
  'Packages/Microsoft.WindowsTerminalPreview_8wekyb3d8bbwe/LocalState/settings.json',
  'Microsoft/Windows Terminal/settings.json',
]

const highlight = atom({ plugin: 'doki-theme-picker', key: 'highlight' } as const, '')
const current = atom({ plugin: 'doki-theme-picker', key: 'current' } as const, '')
// The theme whose scheme and accent were last written, for follow() when there is no accent file.
const followed = atom({ plugin: 'doki-theme-picker', key: 'followed' } as const, '')
// The theme preference Claude Code draws with now. It reads the preference only at start and from /theme
// (seen in 2.1.302), so a pick shows at once only when this is the live file's preference.
const live = atom({ plugin: 'doki-theme-picker', key: 'live' } as const, '')
// The preference settings.json held when this module last read or wrote it: a change it did not make is /theme's.
const seen = atom({ plugin: 'doki-theme-picker', key: 'seen' } as const, '')

// A reply label's place on the engine's row: one blank row above the text, and the
// text two cells in after the reply bullet (none on a later block).
const LABEL_TOP = 1
const LABEL_INDENT = 2
// A category bullet's words ("- Done (2026-10-17)" draws DONE): the H2 tier under the labels.
// The color is a theme key, so each theme draws it in its own color: 'suggestion' is the theme's
// interface color (cream #F6E9CB in Natsuki Dark), apart from the labels' 'claude' accent.
const HEADING_COLOR = 'suggestion'
const HEADING_UNDERLINE = true
const HEADING_CAPS = true
// A dash item with the H2 look reads as a heading line: its "-" mark is painted over with
// HEADING_DASH, one cell. A numbered item keeps its number.
const HEADING_HIDE_DASH = true
// The mark painted over the dash: Nerd Font oct-dot_fill (U+F444). ' ' paints it blank.
const HEADING_DASH = '\uF444'
// The words start after the engine's "- " list mark, two cells.
const HEADING_INDENT = 2
// A callout block (`★ FYI ───` … `───`) is drawn in a box: the 'single' border of Ink's Box, as in
// the mods gallery's BOX BORDERS sample. The border takes the theme's quiet 'subtle' color; the
// title on the top border takes the HEADING_COLOR, bold.
const BOX_STYLE = 'single'
const BOX_COLOR = 'subtle'
const BOX_TITLE_COLOR = HEADING_COLOR
// The title starts this many cells into the top border: past the corner and one rule cell.
const BOX_TITLE_LEFT = 2
// The reply bullet a callout block draws when it opens the reply.
const BULLET = '●'

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

// The folder under ~/.claude/backups for each kind of file the picker backs up.
const BACKUP_SECTIONS = {
  claudeSettings: 'settings/claude',
  wtSettings: 'settings/windows-terminal',
  warpTheme: 'settings/warp',
  theme: 'themes',
} as const
type BackupSection = keyof typeof BACKUP_SECTIONS

/**
 * Copies a user file to ~/.claude/backups/<section>/<name>.<stamp> before it is changed.
 * $.fs.write makes the section folder when it is not there.
 */
async function backup($: EngineInterface, root: string, section: BackupSection, name: string, text: string): Promise<string> {
  const target = `${root}/.claude/backups/${BACKUP_SECTIONS[section]}/${name}.${stamp(new Date())}`
  await $.fs.write(target, text)
  return target
}

/** The theme preference in the user settings.json, as `custom:doki-ram`; undefined when there is none. */
async function currentPreference($: EngineInterface): Promise<unknown> {
  const settings = await readOr($, `${await home($)}/.claude/settings.json`)
  try {
    return (JSON.parse(settings ?? '{}') as { theme?: unknown }).theme
  } catch {
    return undefined
  }
}

async function currentSlug($: EngineInterface): Promise<string> {
  const preference = await currentPreference($)
  if (preference !== LIVE_PREFERENCE) return slugOfPreference(preference)
  return slugOfLiveTheme(await readOr($, `${await home($)}/.claude/themes/${LIVE_SLUG}.json`))
}

/**
 * Reads the preference in settings.json and keeps `live` in step: a change to another theme that this module did
 * not write came from /theme (or a hand edit), and Claude Code draws that theme now. A change to the live file's
 * preference is left out: another session's picker can write it, and this session still draws its own theme.
 */
async function observe($: EngineInterface): Promise<unknown> {
  const preference = await currentPreference($)
  const key = typeof preference === 'string' ? preference : ''
  if (key !== (await read($, seen))) {
    await update($, seen, () => key)
    if (key !== LIVE_PREFERENCE) await update($, live, () => key)
  }
  return preference
}

/** Writes the theme everywhere it shows: Claude Code, Windows Terminal, the shared accent file. */
async function apply($: EngineInterface, theme: DokiTheme): Promise<string[]> {
  const root = await home($)
  const notes: string[] = []
  await observe($)

  // 1. The theme's own file, so /theme lists it, and the live file, which Claude Code reloads at once when it is
  // the theme in use: the preference names the live file, so each pick after the first start on it shows at once.
  const preference = LIVE_PREFERENCE
  for (const [file, content] of [
    [`${preferenceOf(theme).replace(/^custom:/, '')}.json`, toClaudeTheme(theme)],
    [`${LIVE_SLUG}.json`, toLiveTheme(theme)],
  ] as const) {
    const path = `${root}/.claude/themes/${file}`
    const old = await readOr($, path)
    if (old !== undefined) await backup($, root, 'theme', file, old)
    await $.fs.write(path, JSON.stringify(content, null, 2) + '\n')
    notes.push(`theme file ${path}`)
  }

  // 2. Point Claude Code at the live file: the /config row first, then make sure settings.json agrees.
  // The /config row changes only through its dialog, so a refusal is expected; settings.json takes effect at the next start.
  try {
    const { deny } = await $.config.set({ key: 'theme', value: preference })
    if (!deny) {
      notes.push('config.set theme')
      await update($, live, () => preference)
    }
  } catch (error) {
    notes.push(`config.set failed (${String(error).slice(0, 80)})`)
  }
  const settingsPath = `${root}/.claude/settings.json`
  const settings = await readOr($, settingsPath)
  try {
    if (settings === undefined) {
      // A fresh install can have no user settings.json yet: make one that holds only the theme.
      await $.fs.write(settingsPath, JSON.stringify({ theme: preference }, null, 2) + '\n')
      notes.push('settings.json theme')
    } else if ((JSON.parse(settings) as { theme?: unknown }).theme !== preference) {
      const next = updateClaudeSettings(settings, preference)
      await backup($, root, 'claudeSettings', 'settings.json', settings)
      await $.fs.write(settingsPath, next)
      notes.push('settings.json theme')
    }
    await update($, seen, () => preference)
  } catch (error) {
    notes.push(`settings.json skipped (${String(error).slice(0, 80)})`)
  }

  // 3 and 4. Windows Terminal and the accent file.
  notes.push(...(await applyOutside($, root, theme)))

  await update($, followed, () => theme.slug)
  await update($, current, () => theme.slug)
  // Claude Code still draws another file: it changes to the live file at its next start, not now.
  const later = (await read($, live)) !== LIVE_PREFERENCE
  if (later) notes.push('Claude Code changes after a restart')
  $.ui.toast(`Theme: ${sourceLabel(theme)} ${theme.name}${later ? '. Restart Claude Code one time to see it here.' : ''}`)
  return notes
}

/** What Claude Code's own theme setting does not reach: the Windows Terminal scheme and the accent file. */
async function applyOutside($: EngineInterface, root: string, theme: DokiTheme): Promise<string[]> {
  const notes: string[] = []
  // 3. Windows Terminal: the scheme, set on the profile of the tab Claude Code runs in.
  const local = ((await $.env.get('LOCALAPPDATA')) ?? '').replace(/\\/g, '/')
  let wtPath = ''
  let wt: string | undefined
  for (const candidate of local ? WT_SETTINGS : []) {
    wt = await readOr($, `${local}/${candidate}`)
    if (wt !== undefined) {
      wtPath = `${local}/${candidate}`
      break
    }
  }
  if (wt !== undefined) {
    try {
      const next = updateWtSettings(wt, toWtScheme(theme), await $.env.get('WT_PROFILE_ID'))
      await backup($, root, 'wtSettings', 'wt-settings.json', wt)
      await $.fs.write(wtPath, next)
      notes.push('Windows Terminal scheme')
    } catch (error) {
      notes.push(`Windows Terminal skipped (${String(error).slice(0, 80)})`)
    }
  } else {
    notes.push('Windows Terminal not found, skipped')
  }

  // 3b. Warp: written only when Warp's folder is there. Warp does not reload a changed theme file, so the pick
  // goes to the other of two files and settings.toml names it; Warp reloads settings.toml and shows it at once.
  const appData = ((await $.env.get('APPDATA')) ?? '').replace(/\\/g, '/')
  try {
    if (appData && local && (await $.fs.exists(`${appData}/warp/Warp`))) {
      const tomlPath = `${local}/warp/Warp/config/settings.toml`
      const toml = await readOr($, tomlPath)
      const file = nextWarpFile(toml)
      await $.fs.write(`${appData}/warp/Warp/data/themes/${file}`, toWarpTheme(theme))
      if (toml !== undefined) await backup($, root, 'warpTheme', 'settings.toml', toml)
      await $.fs.write(tomlPath, updateWarpSettings(toml, file, warpThemeName(theme)))
      notes.push('Warp theme')
    }
  } catch (error) {
    notes.push(`Warp skipped (${String(error).slice(0, 80)})`)
  }

  // 4. The accent other mods draw with. Written only when ~/.claude/mods already exists, so a
  // person without local mods gets no extra folder.
  try {
    if (await $.fs.exists(`${root}/.claude/mods`)) {
      await $.fs.write(`${root}/.claude/mods/theme-accent.json`, JSON.stringify(toAccent(theme), null, 2) + '\n')
      notes.push('accent file')
    }
  } catch (error) {
    notes.push(`accent file skipped (${String(error).slice(0, 80)})`)
  }

  // 5. The status line: a new `--theme` argument makes every open session run it again with the new accent.
  notes.push(...(await redrawStatusLine($, root, theme)))
  return notes
}

/**
 * Sets the `--theme` argument of the statusLine command in settings.json, when the command has one.
 * Reads the file again just before the write, so a change another session or Claude Code made meanwhile is kept.
 */
async function redrawStatusLine($: EngineInterface, root: string, theme: DokiTheme): Promise<string[]> {
  const path = `${root}/.claude/settings.json`
  const slug = statusLineSlug(theme)
  try {
    const text = await readOr($, path)
    if (text === undefined || updateStatusLineTheme(text, slug) === undefined) return []
    await backup($, root, 'claudeSettings', 'settings.json', text)
    const fresh = await readOr($, path)
    const next = fresh === undefined ? undefined : updateStatusLineTheme(fresh, slug)
    if (fresh === undefined || next === undefined) return []
    if (fresh !== text) await backup($, root, 'claudeSettings', 'settings.json', fresh)
    await $.fs.write(path, next)
    return ['status line theme']
  } catch (error) {
    return [`status line skipped (${String(error).slice(0, 80)})`]
  }
}

/**
 * Claude Code's /theme picked a theme: if it is one of ours, bring the Windows Terminal
 * scheme and the accent file along, so both commands leave the same result. Does nothing when the
 * accent file already holds the theme.
 */
async function follow($: EngineInterface, preference: unknown): Promise<string[]> {
  const theme = findTheme(slugOfPreference(preference))
  if (!theme) return []
  const root = await home($)
  if (await $.fs.exists(`${root}/.claude/mods`)) {
    const accent = await readOr($, `${root}/.claude/mods/theme-accent.json`)
    if (accent === JSON.stringify(toAccent(theme), null, 2) + '\n') return []
  } else if ((await read($, followed)) === theme.slug) {
    // No accent file to compare with: the last theme this session followed stands in for it.
    return []
  }
  const notes = await applyOutside($, root, theme)
  await update($, followed, () => theme.slug)
  await update($, current, () => theme.slug)
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
    // Claude Code has read the theme preference before this hook runs (seen in 2.1.302): it draws this one.
    const preference = await currentPreference($)
    const key = typeof preference === 'string' ? preference : ''
    await update($, live, () => key)
    await update($, seen, () => key)
    const atStart = await currentSlug($)
    await update($, followed, was => was || atStart)
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

  // Claude Code's /theme writes settings.json only and raises no event (seen live 2026-10-06): check at each prompt.
  // A slash command another plugin answers may not reach this hook; the next typed prompt does.
  on('prompt.submit', async ($, e, next) => {
    try {
      await follow($, await observe($))
    } catch {
      // Never block a prompt over a theme.
    }
    return next(e)
  })

  // The person's Tab, arrows or click moved the ring onto a slot: move the highlight by the slots it travelled.
  on('ui.focus', { requestId: PANE }, async ($, e, next) => {
    const slot = slotOfKey(e.element)
    if (slot < 0) return next(e)
    if (e.origin.kind !== 'person') {
      // The first drawing's autoFocus, or this module's own redirect: the ring is where it says, unless refused.
      const result = await next(e)
      if (!result.deny) ringSlot = slot
      return result
    }
    return inOrder(async () => {
      const slug = (await read($, highlight)) || FALLBACK.slug
      const from = ringSlot >= 0 ? ringSlot : slotOfTheme(slug)
      const index = Math.max(0, LIST.findIndex(t => t.slug === slug))
      // The engine wraps its ring past either end of the buttons it holds (a Down on the last slot lands on slot 0), and
      // a burst can outrun a drawing that has fewer buttons than the new window: a jump of nearly a window's height
      // is that wrap, one press in the other direction. (A click never comes here: it raises only ui.press.)
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
      const was = ringSlot
      const to = await moveHighlight($, target.slug)
      // Bring the ring along; a refusal leaves the highlight moved (Enter applies the highlight, not the ring).
      // The ring then stays on its old slot: track that, so Enter there is not read as a click.
      void $.ui
        .focus({ requestId: PANE, key: slotKey(to) })
        .then(result => {
          if (result.deny && ringSlot === to) ringSlot = was
        })
        .catch(() => undefined)
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
              PS C:\projects&gt;{' '}
            </Text>
            <Text color={c.accent} backgroundColor={c.bg}>
              claude
            </Text>
          </Box>
          <Text color={c.accent} backgroundColor={c.bg}>
            ● Update(src/theme.ts)
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
        <Text color={c.subtle}>Tab/↑↓ move · Enter/click apply · Esc close</Text>
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
                onPress={async press => {
                  // Enter presses the slot the ring is on: it applies the theme the header names (the highlight),
                  // because during a burst the row under the ring can be stale. A click raises only ui.press, for the
                  // slot clicked, with no ui.focus (observed 2026-10-06): a press off the ring is a click on this row.
                  const clicked = slotOfKey(press.element) !== ringSlot
                  const named = clicked ? row.theme : (findTheme(await read($, highlight)) ?? row.theme)
                  await apply($, named)
                  await $.ui.close({ id: PANE })
                }}
              />
            </Box>
          )
        })
}
      </Box>
    )
  })

  // Capital label or heading words (FYI:, WAITS ON SHELVI) that open a paragraph: bold in the theme's Claude color.
  // Category words that open a top-level bullet (- Done): underlined capitals in the HEADING_COLOR.
  // A callout block (`★ FYI ───` … `───`): a box with a single border, its title on the top border.
  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    try {
      // Cell offsets fit the terminal alone; a summary row keeps its mark.
      if (e.surface !== 'terminal' || e.props.isSummary) return next(e)
      const { Box, Markdown, Text } = $.ui.resolve(e)

      // The overlays of a piece: its label or heading words, and a blank over its dash.
      const marks = (piece: Piece, top: number, left: number): RenderNode[] => {
        const mark = piece.label
          ? Box({ position: 'absolute', top, left, children: [Text({ color: 'claude', weight: 'bold', children: [piece.label] })] })
          : piece.heading
            ? Box({ position: 'absolute', top, left: left + (piece.bare ? 0 : HEADING_INDENT) + (piece.headingAt ?? 0), children: [Text({ color: HEADING_COLOR, underline: HEADING_UNDERLINE, children: [HEADING_CAPS ? piece.heading.toUpperCase() : piece.heading] })] })
            : undefined
        if (!mark) return []
        // The dot over the dash cell: the engine's "-" is hidden, the cells around it stay.
        const dot = piece.heading && HEADING_HIDE_DASH && piece.text.startsWith('- ')
          ? Box({ position: 'absolute', top, left, children: [Text({ children: [HEADING_DASH] })] })
          : undefined
        return dot ? [dot, mark] : [mark]
      }

      // Text with no callout block: engine blocks, split where a label or heading opens a piece.
      const drawText = async (text: string, first: boolean): Promise<RenderElement> => {
        const whole = text === e.props.text && first === e.props.isFirstOfReply
        const props = { ...e.props, text, isFirstOfReply: first }
        const pieces = splitReply(text)
        if (!pieces) return next(whole ? e : { ...e, props })
        const left = first ? LABEL_INDENT : 0
        const rows: RenderNode[] = []
        for (const [i, piece] of pieces.entries()) {
          const same = whole && pieces.length === 1 && text.startsWith(piece.text)
          // A tight piece goes on from the row above with no blank row, so it is drawn as the
          // reply's markdown alone; any other piece is an engine block, a blank row above it.
          const row = piece.tight
            ? Markdown({ text: piece.text })
            : await next(same ? e : { ...e, props: { ...props, text: piece.text, isFirstOfReply: first && i === 0 } })
          // A later piece has no bullet, so it keeps the first piece's indent itself; a piece under
          // a numbered heading moves right to its title.
          const pad = (i > 0 ? left : 0) + (piece.under ?? 0)
          const body = pad ? Box({ flexDirection: 'column', paddingLeft: pad, children: [row] }) : row
          // The engine still draws the words; the overlay repaints the same cells.
          const over = marks(piece, piece.tight ? 0 : LABEL_TOP, left + (piece.under ?? 0))
          rows.push(over.length ? Box({ flexDirection: 'column', children: [body, ...over] }) : body)
        }
        return Box({ flexDirection: 'column', children: rows })
      }

      // A callout block: its lines as markdown inside the border, wrapped to the box width.
      const drawBox = (title: string, text: string, first: boolean): RenderElement => {
        const pieces: Piece[] = text ? (splitReply(text) ?? [{ text }]) : []
        const inner = pieces.map((piece, j) =>
          Box({ flexDirection: 'column', marginTop: j > 0 && !piece.tight ? 1 : 0, paddingLeft: piece.under ?? 0, children: [Markdown({ text: piece.text }), ...marks(piece, 0, piece.under ?? 0)] }),
        )
        const frame = Box({
          flexDirection: 'column',
          borderStyle: BOX_STYLE,
          borderColor: BOX_COLOR,
          paddingX: 1,
          children: inner.length ? inner : [Text({ children: [' '] })],
        })
        const name = Box({ position: 'absolute', top: 0, left: BOX_TITLE_LEFT, children: [Text({ color: BOX_TITLE_COLOR, weight: 'bold', children: [` ★ ${title} `] })] })
        const box = Box({ flexDirection: 'column', children: [frame, name] })
        // The first block of a reply keeps its bullet, on the top border row.
        const bullet = first ? [Box({ position: 'absolute', top: 0, left: 0, children: [Text({ children: [BULLET] })] })] : []
        return Box({ flexDirection: 'column', marginTop: LABEL_TOP, paddingLeft: first ? LABEL_INDENT : 0, children: [box, ...bullet] })
      }

      const segments = splitBoxes(e.props.text)
      if (!segments) return await drawText(e.props.text, e.props.isFirstOfReply)
      const left = e.props.isFirstOfReply ? LABEL_INDENT : 0
      const rows: RenderNode[] = []
      for (const [i, segment] of segments.entries()) {
        const first = e.props.isFirstOfReply && i === 0
        const row = segment.kind === 'box' ? drawBox(segment.title, segment.text, first) : await drawText(segment.text, first)
        // A later segment has no bullet, so it keeps the first segment's indent itself.
        rows.push(i > 0 && left ? Box({ flexDirection: 'column', paddingLeft: left, children: [row] }) : row)
      }
      return Box({ flexDirection: 'column', children: rows })
    } catch {
      return next(e)
    }
  })
}
