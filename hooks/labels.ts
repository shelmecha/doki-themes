// A word of 2 or more capitals, a single hyphen allowed between them (TO-DO); a run is words with one space between.
const WORD = '[A-Z](?:-?[A-Z])+'
const RUN = `${WORD}(?: ${WORD})*`
// "**FYI:**", "**FYI**:" or "**WAITS ON SHELVI**", and the same words with no stars.
const BOLD = new RegExp(`^\\*\\*(${RUN})(:?)\\*\\*(:?)`)
const PLAIN = new RegExp(`^(${RUN})(:?)`)
// What follows a run with no colon: the end of the line, or a space and a digit, a bracket or a dash.
const AFTER = /^(?:\s*$| [\d([\-\u2013\u2014])/
// A wider label could wrap past the first row the overlay paints.
const MAX = 60
// A Markdown heading's mark ("## "): the engine draws the heading's words with no hashes, in
// the same cells as a paragraph's, a blank row above and below.
const HEADING = /^#{1,6} /
const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/

// An ordered list item: indent, number, delimiter, then spaces or the end of the line.
const ORDERED = /^( {0,3})(\d{1,9})([.)])( +|$)/
// A line that opens a block of its own, so it is no lazy line of an item's paragraph.
const BLOCK = /^ {0,3}(?:[-*+](?: |$)|#{1,6}(?: |$)|>|(?:[-*_] *){3,}$)/
// A line of a list: a bullet or number mark, or a line indented under an item.
const LISTED = /^(?:\s+\S|[-*+] |\d+[.)] )/

// The category words that open a top-level dash bullet ("- Done (2026-10-17)"), in any case:
// the categories of the Replies rules in ~/.claude/CLAUDE.md, then risks, blockers and decisions.
export const CATEGORIES = ['Done', 'Waits on Shelvi', 'Later', 'FYI', 'Undone', 'Open checks', 'Open check', 'Risks', 'Risk', 'Blockers', 'Blocker', 'Decisions', 'Decision']
// "Done", "**Done**", "Done:", "**Done:**", "**Done**:" or "**Done (date)**" after a top-level
// "- " or "1. " mark at column 0; a nested item is indented.
const CATEGORY = new RegExp(`^(\\*\\*)?(${[...CATEGORIES].sort((a, b) => b.length - a.length).join('|')})(:?)(\\*\\*)?(:?)`, 'i')

// Any other intro of a top-level item gets the same look when it is at most INTRO_WORDS words and
// a colon follows it: "- Commit: f0a582e". Set 2 to also style "- Left out: x".
export const INTRO_WORDS = 5

// A group heading gets the same look: a short line that opens a paragraph and has a list right
// under it ("Done" then "- ..."), or a Markdown heading that is no capital label ("## Done").
// It is at most BARE_HEADING_WORDS words; the engine draws it at the paragraph's first cell.
export const BARE_HEADING_WORDS = 4
// A word of a bare heading: letters, digits, brackets, apostrophes, hyphens, "&" and "/".
const BARE_WORD = /^[A-Za-z0-9()'\u2019&/-]+$/
// A whole line in bold or italic ("**Done recently**", "**Still open:**", "**Done**:", "__Done__",
// "*Done*", "_Done_", "***Done***"): the engine hides the marks, so the words start at the
// paragraph cell. A word of it may end in a comma ("**Possible, not proven**").
const WRAPPED = /^(\*{1,3}|_{1,2})([^*_]+?)(:?)\1(:?)$/
const WRAPPED_WORD = /^[A-Za-z0-9()'\u2019&/-]+,?$/
// Words that make a line a sentence or a lead-in ("These are the steps:"), not a group name.
const SENTENCE = new Set(['is', 'are', 'was', 'were', 'be', 'been', 'am', 'will', 'would', 'can', 'could', 'should', 'do', 'does', 'did', 'have', 'has', 'had', 'these', 'this', 'those', 'here', 'there', 'we', 'i', 'you', 'they', 'it'])
// The line under a bare heading: a top-level "- " or "1. " item.
const LIST_NEXT = /^(?:- |\d{1,9}\. )/
// A Markdown heading: its text with no hashes; markup in it would move the words.
const MD_HEADING = /^#{1,6} +([^*_\x60[\]<>]+?)(?: +#+)? *$/
// A heading's number mark ("2. ") and its title; a numbered title may be this many words.
const NUMBERED = /^(\d{1,3}[.)] +)(\S.*)$/
const NUMBERED_HEADING_WORDS = 12
// An intro word: a letter, then 1 to 23 letters, digits or hyphens.
const INTRO_WORD = '[A-Za-z][A-Za-z0-9-]{1,23}'
const INTROS = new Map<number, RegExp>()
const introOf = (words: number) => {
  const n = Math.max(1, Math.floor(words))
  let re = INTROS.get(n)
  if (!re) INTROS.set(n, (re = new RegExp(`^(\\*\\*)?(${INTRO_WORD}(?: ${INTRO_WORD}){0,${n - 1}})(:?)(\\*\\*)?(:?)`)))
  return re
}

/**
 * One part of a reply block. `label` is the label that opens a paragraph (H1). `heading` is the
 * category words after a top-level bullet's "- " (H2), as written. `tight` marks a part the
 * engine draws with no blank row above it: it follows the line before it with no blank line, or
 * it is a bullet of the same list after blank lines (the terminal draws a loose list tight).
 * `headingAt` is the cells the engine draws between "- " and the category words: 2 for stars
 * that do not close yet ("- **Done" while it streams), and 1 more for each digit of a number
 * mark ("1. " is 3 cells, "10. " 4); absent for none. `under` is the cells a piece under a
 * numbered heading ("## 2. Tracking") moves right, so its lines start under the title.
 */
export type Piece = { text: string; label?: string; heading?: string; headingAt?: number; under?: number; bare?: true; tight?: true }
type Start = { at: number; label?: string; heading?: string; headingAt?: number; under?: number; numbered?: boolean; bare?: boolean; number?: string; tight: boolean }

/**
 * The words of a group heading on `line` (no hashes, no last colon), or undefined. `next` is
 * the line under it: a bare heading needs a list item there.
 */
function groupOf(line: string, next: string): { heading: string; at: number } | undefined {
  const md = MD_HEADING.exec(line)
  if (md) {
    // A numbered heading ("## 2. Tracking"): the number stays plain, the title gets the look, and
    // a longer title is fine, so every heading of a numbered set looks the same.
    const num = NUMBERED.exec(md[1]!)
    const heading = groupWords((num ? num[2]! : md[1]!).replace(/:$/, ''), 'heading', num ? NUMBERED_HEADING_WORDS : BARE_HEADING_WORDS)
    const at = num ? num[1]!.length : 0
    return heading && at + heading.length <= MAX ? { heading, at } : undefined
  }
  if (!LIST_NEXT.test(next)) return undefined
  const bare = line.replace(/[ \r]+$/, '')
  const wrap = WRAPPED.exec(bare)
  const heading = wrap ? (wrap[3] && wrap[4] ? undefined : groupWords(wrap[2]!, 'wrapped')) : groupWords(bare.replace(/:$/, ''), 'bare')
  return heading ? { heading, at: 0 } : undefined
}

/** `body` when it is a group name: short, not capitals alone, and for a line no sentence. */
function groupWords(body: string, form: 'heading' | 'wrapped' | 'bare', max = BARE_HEADING_WORDS): string | undefined {
  const words = body.split(' ')
  // Capitals alone are a label's (H1), or a label still streaming: "## A" before "## ANSWER:".
  if (!/[a-z]/.test(body) || words.length > max || words.some(w => !w)) return undefined
  if (form === 'heading') return body
  const word = form === 'wrapped' ? WRAPPED_WORD : BARE_WORD
  if (!/^[A-Z]/.test(body) || !words.every(w => word.test(w))) return undefined
  return words.some(w => SENTENCE.has(w.replace(/,$/, '').toLowerCase())) ? undefined : body
}
// The ordered list a line is in: the number the engine draws on its next item (it counts on from
// the first item's number, whatever the source says), its delimiter, and its items' content column.
type List = { next: number; delim: string; content: number }

/** The label text the engine draws at the start of `line` (heading mark and stars removed), or undefined. */
function labelOf(line: string): string | undefined {
  line = line.replace(HEADING, '')
  const hit = BOLD.exec(line) ?? PLAIN.exec(line)
  if (!hit?.[1] || (hit[2] && hit[3])) return undefined
  const colon = hit[2] || hit[3] || ''
  const rest = line.slice(hit[0].length)
  if (colon ? !/^(?:\s|$)/.test(rest) : !AFTER.test(rest)) return undefined
  const label = hit[1] + colon
  return label.length <= MAX ? label : undefined
}

/**
 * The category words the engine draws at the start of `line`, the text after a list mark (stars and colon removed), and
 * the cells before them, or undefined. Opening stars may close later on the line, as in
 * "- **Done (2026-10-17)**"; the engine draws stars that do not close (yet) as text, 2 cells.
 * Closing stars with no opening stars are not a category. An intro of up to `words` other words
 * counts too, but only with its colon: "Commit: x", "**Commit:** x", "**Commit**: x".
 */
function headingOf(line: string, words: number): { heading: string; at: number } | undefined {
  return wordsOf(CATEGORY.exec(line), line, false) ?? wordsOf(introOf(words).exec(line), line, true)
}

function wordsOf(hit: RegExpExecArray | null, line: string, colonNeeded: boolean): { heading: string; at: number } | undefined {
  if (!hit?.[2] || (hit[4] && !hit[1]) || (hit[3] && hit[5])) return undefined
  if (colonNeeded && !hit[3] && !hit[5]) return undefined
  const rest = line.slice(hit[0].length)
  if (hit[3] || hit[5] ? !/^(?:\s|$)/.test(rest) : !AFTER.test(rest)) return undefined
  const open = Boolean(hit[1] && !hit[4] && !/\S\*\*/.test(rest))
  return { heading: hit[2], at: open ? 2 : 0 }
}

// Splits a reply block where a label opens a paragraph outside code fences.
// Undefined means no label: the caller draws the engine's default.
export function splitLabels(text: string): Piece[] | undefined {
  return split(text, false, INTRO_WORDS)
}

// The same split, and also where a top-level dash bullet or "1." item opens with a category word,
// or with an intro of up to `introWords` words and a colon (H2).
export function splitReply(text: string, introWords = INTRO_WORDS): Piece[] | undefined {
  return split(text, true, introWords)
}

function split(text: string, headings: boolean, words: number): Piece[] | undefined {
  const lines = text.split('\n')
  const starts: Start[] = []
  let fence = ''
  let list: List | undefined
  const indentOf = (line: string) => line.length - line.trimStart().length
  lines.forEach((line, i) => {
    const mark = FENCE.exec(line)
    if (fence) {
      if (mark?.[1] && mark[1][0] === fence[0] && mark[1].length >= fence.length && !mark[2]?.trim()) fence = ''
      return
    }
    if (mark?.[1]) {
      fence = mark[1]
      if (list && indentOf(line) < list.content) list = undefined
      return
    }
    const tight = i > 0 && Boolean(lines[i - 1]?.trim())
    // Follow the ordered list, to know the number the engine draws on each item. Where it is
    // not plain (a tab, an item that cannot open a list here), no number is known: no H2.
    let number: number | undefined
    let continued = false
    const item = ORDERED.exec(line)
    if (line.trim()) {
      const indent = indentOf(line)
      const content = item ? item[1]!.length + item[2]!.length + 1 + (item[4] && item[4].length <= 4 ? item[4].length : 1) : 0
      if (/^ *\t/.test(line)) list = undefined
      else if (list && indent >= list.content) {
        // A line inside the item.
      } else if (list && item && item[3] === list.delim) {
        number = list.next++
        list.content = content
        continued = true
      } else if (!(list && tight && !item && !BLOCK.test(line))) list = undefined
      // An item opens a list after a blank line; after text only as "1." (CommonMark).
      if (!list && item && (!tight || item[2] === '1')) {
        number = Number(item[2])
        list = { next: number + 1, delim: item[3]!, content }
      }
    }
    const label = tight ? undefined : labelOf(line)
    if (label) return void starts.push({ at: i, label, tight })
    if (!headings) return
    const group = tight ? undefined : groupOf(line, lines[i + 1] ?? '')
    if (group) {
      const start: Start = { at: i, heading: group.heading, bare: true, tight }
      if (group.at) {
        start.headingAt = group.at
        start.numbered = true
      }
      return void starts.push(start)
    }
    if (line.startsWith('- ')) {
      const hit = headingOf(line.slice(2), words)
      if (!hit) return
      const start: Start = { at: i, heading: hit.heading, tight: tight || LISTED.test(lines.slice(0, i).findLast(l => l.trim()) ?? '') }
      if (hit.at) start.headingAt = hit.at
      return void starts.push(start)
    }
    // A "1. " item at column 0; the piece it opens is drawn with the engine's number for it.
    if (number === undefined || !item || item[1] || item[3] !== '.' || item[4] !== ' ') return
    const hit = headingOf(line.slice(item[0].length), words)
    if (!hit) return
    const shown = String(number)
    const start: Start = { at: i, heading: hit.heading, headingAt: shown.length + hit.at, tight: tight || continued }
    if (shown !== item[2]) start.number = shown
    starts.push(start)
  })
  if (!starts.length) return undefined
  // The lines under a numbered heading start under its title, up to the next heading or label:
  // its first line opens a piece of its own, so the heading line keeps its place.
  for (let s = 0; s < starts.length; s++) {
    const head = starts[s]!
    if (!head.numbered) continue
    const end = starts[s + 1]?.at ?? lines.length
    const first = lines.findIndex((l, j) => j > head.at && j < end && l.trim())
    if (first > 0) starts.splice(s + 1, 0, { at: first, tight: Boolean(lines[first - 1]?.trim()) })
    for (let t = s + 1; t < starts.length && !starts[t]!.label && !starts[t]!.bare; t++) starts[t]!.under = head.headingAt
  }
  const pieces: Piece[] = []
  const cut = (from: number, to: number, start?: Start) => {
    let part = lines.slice(from, to).join('\n').replace(/\s+$/, '')
    if (start?.number) part = part.replace(/^\d+/, start.number)
    if (!part.trim()) return
    const piece: Piece = { text: part }
    if (start?.label) piece.label = start.label
    if (start?.heading) piece.heading = start.heading
    if (start?.headingAt) piece.headingAt = start.headingAt
    if (start?.under) piece.under = start.under
    if (start?.bare) piece.bare = true
    if (start?.tight) piece.tight = true
    pieces.push(piece)
  }
  cut(0, starts[0]!.at)
  starts.forEach((start, i) => cut(start.at, starts[i + 1]?.at ?? lines.length, start))
  return pieces
}

// A callout block: an inline-code line "★ <title> ───" at column 0, its lines, then an
// inline-code rule "───". The titles that open one: the FYI block of ~/.claude/CLAUDE.md and the
// Explanatory output style's Insight block.
export const BOX_TITLES = ['FYI', 'Insight']
const BOX_OPEN = new RegExp(`^\`★ (${BOX_TITLES.join('|')}) ─+\`$`)
const BOX_CLOSE = /^`─{3,}`$/

/**
 * One part of a reply around its callout blocks. A `box` part holds the lines between the
 * opening line and the closing rule; `closed` is false while the rule has not come (yet), and the
 * box then holds the rest of the text.
 */
export type Segment = { kind: 'text'; text: string } | { kind: 'box'; title: string; text: string; closed: boolean }

const trimBlank = (lines: string[]) => lines.join('\n').replace(/^(?:[ \t]*\r?\n)+/, '').replace(/\s+$/, '')

// Splits a reply block at its callout blocks outside code fences. Undefined means none.
export function splitBoxes(text: string): Segment[] | undefined {
  const lines = text.split('\n')
  const segments: Segment[] = []
  let fence = ''
  let from = 0
  let box: { title: string; at: number } | undefined
  const pushText = (to: number) => {
    const part = trimBlank(lines.slice(from, to))
    if (part.trim()) segments.push({ kind: 'text', text: part })
  }
  lines.forEach((raw, i) => {
    const line = raw.replace(/[ \r]+$/, '')
    const mark = FENCE.exec(line)
    if (fence) {
      if (mark?.[1] && mark[1][0] === fence[0] && mark[1].length >= fence.length && !mark[2]?.trim()) fence = ''
      return
    }
    if (mark?.[1]) return void (fence = mark[1])
    if (!box) {
      const open = BOX_OPEN.exec(line)
      if (!open) return
      pushText(i)
      box = { title: open[1]!, at: i }
    } else if (BOX_CLOSE.test(line)) {
      segments.push({ kind: 'box', title: box.title, text: trimBlank(lines.slice(box.at + 1, i)), closed: true })
      box = undefined
      from = i + 1
    }
  })
  if (box) segments.push({ kind: 'box', title: box.title, text: trimBlank(lines.slice(box.at + 1)), closed: false })
  else if (segments.length) pushText(lines.length)
  return segments.length ? segments : undefined
}
