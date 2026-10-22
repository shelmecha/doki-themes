import { expect, test, type Engine } from 'claude-code/testing'
import { BARE_HEADING_WORDS, CATEGORIES, INTRO_WORDS, splitLabels, splitReply } from './labels'
import type { On, RenderPropsOf, RenderSurface } from 'claude-code'

const one = (text: string) => splitLabels(text)?.map(p => p.label)

test('each reply label opens a block in the bold and the plain form', () => {
  for (const word of ['ANSWER', 'RECOMMEND', 'DONE', 'FIXED', 'FOUND', 'BLOCKED', 'DECISION', 'FYI', 'WRONG', 'NEXT']) {
    const label = `${word}:`
    expect(splitLabels(`**${word}:** rest`)).toEqual([{ text: `**${word}:** rest`, label }])
    expect(splitLabels(`**${word}**: rest`)).toEqual([{ text: `**${word}**: rest`, label }])
    expect(splitLabels(`${word}: rest`)).toEqual([{ text: `${word}: rest`, label }])
  }
})
test('the user reply openers: label, dated label, and headings alone on their line', () => {
  expect(splitLabels('ANSWER: Last record is 2026-10-17, ...')).toEqual([{ text: 'ANSWER: Last record is 2026-10-17, ...', label: 'ANSWER:' }])
  expect(splitLabels('DONE 2026-10-17 (all in MASTER-LIST.md)')).toEqual([{ text: 'DONE 2026-10-17 (all in MASTER-LIST.md)', label: 'DONE' }])
  expect(splitLabels('WAITS ON SHELVI\n1. Approve\n2. Pick')).toEqual([{ text: 'WAITS ON SHELVI\n1. Approve\n2. Pick', label: 'WAITS ON SHELVI' }])
  expect(splitLabels('LATER\n- one\n- two')).toEqual([{ text: 'LATER\n- one\n- two', label: 'LATER' }])
  expect(one('ANSWER: x\n\nDONE 2026-10-17 (y)\n\nWAITS ON SHELVI\n1. a\n\nLATER\n- b\n\nNEXT: go')).toEqual(['ANSWER:', 'DONE', 'WAITS ON SHELVI', 'LATER', 'NEXT:'])
})
test('bold forms, hyphens and the allowed followers', () => {
  expect(one('**WAITS ON SHELVI**\n1. a')).toEqual(['WAITS ON SHELVI'])
  expect(one('**DONE** 2026-10-17')).toEqual(['DONE'])
  expect(one('**WAITS ON SHELVI:** rest')).toEqual(['WAITS ON SHELVI:'])
  expect(one('TO-DO: x')).toEqual(['TO-DO:'])
  expect(one('**TO-DO**')).toEqual(['TO-DO'])
  for (const rest of [' (x)', ' [x]', ' - x', ' \u2013 x', ' \u2014 x', ' 3 items', '  ']) expect(one(`DONE${rest}`)).toEqual(['DONE'])
})
test('a label line followed by a list stays one block', () => {
  expect(splitLabels('FYI:\n- one\n- two')).toEqual([{ text: 'FYI:\n- one\n- two', label: 'FYI:' }])
})
test('a label after a blank line starts a new piece', () => {
  expect(splitLabels('**DONE:** built it.\n\nNEXT: run it\n\n')).toEqual([
    { text: '**DONE:** built it.', label: 'DONE:' },
    { text: 'NEXT: run it', label: 'NEXT:' },
  ])
  expect(splitLabels('Intro.\n\nRECOMMEND: Start with A.')).toEqual([{ text: 'Intro.' }, { text: 'RECOMMEND: Start with A.', label: 'RECOMMEND:' }])
})
test('capitals before a word, a single capital, or a lower-case label are not colored', () => {
  for (const text of [
    'API changes are small.',
    'HTTP is the protocol.',
    'I think so.',
    'A better plan.',
    'NEXT Monday we start.',
    'WAITS ON Shelvi',
    '**API** changes',
    'A: single capital',
    'I: single capital',
    'Done: capitalised word',
    'fyi: lower case',
    'FYIs: other word',
    'API-based tools',
    'DONE.',
    'DONE, then more',
    'DONE:x',
    'TL;DR: short',
    '**A:**: two colons',
    '**FYI:**: two colons',
  ])
    expect(splitLabels(text)).toBeUndefined()
})
test('a label mid-sentence, mid-paragraph or in a list is not colored', () => {
  expect(splitLabels('We are DONE: now')).toBeUndefined()
  expect(splitLabels('We are DONE now and WAITS ON SHELVI')).toBeUndefined()
  expect(splitLabels('First line\nFYI: same paragraph')).toBeUndefined()
  expect(splitLabels('First line\nLATER')).toBeUndefined()
  expect(splitLabels('- FYI: in a list')).toBeUndefined()
  expect(splitLabels('- DONE: in a list')).toBeUndefined()
  expect(splitLabels('1. DONE 2026-10-17')).toBeUndefined()
  expect(splitLabels('* LATER')).toBeUndefined()
})
test('a label inside a fence or inline code is not colored', () => {
  expect(splitLabels('```\nFYI: code\n```')).toBeUndefined()
  expect(splitLabels('```\nWAITS ON SHELVI\n```')).toBeUndefined()
  expect(splitLabels('Text\n\n~~~md\n\nDONE: code\n~~~')).toBeUndefined()
  expect(splitLabels('`FYI: code`')).toBeUndefined()
  expect(splitLabels('`LATER`')).toBeUndefined()
  expect(splitLabels('Use `DONE:` here')).toBeUndefined()
  expect(splitLabels('```\ncode\n```\n\nDONE: after')).toEqual([{ text: '```\ncode\n```' }, { text: 'DONE: after', label: 'DONE:' }])
})
test('a label wider than 60 characters is not colored', () => {
  const words = (n: number) => Array.from({ length: n }, () => 'ABCDEFGHI').join(' ')
  expect(one(words(6))).toEqual([words(6)])
  expect(splitLabels(words(7))).toBeUndefined()
})
test('partial streaming text is safe', () => {
  for (const text of ['*', '**', '**F', '**FY', '**FYI', '**FYI:', '**FYI:*', '**WAITS ON', '**WAITS ON SHELVI*', 'F', '```\nFYI: open fence', 'DONE 2026-10-17 (all', 'WAITS O'])
    expect(() => splitLabels(text)).not.toThrow()
  for (const text of ['*', '**', '**F', '**FY', '**FYI', '**FYI:', '**FYI:*', '**WAITS ON', '**WAITS ON SHELVI*', 'F', '```\nFYI: open fence']) expect(splitLabels(text)).toBeUndefined()
  // A capital run at the end of partial text is colored as it grows.
  expect(one('FY')).toEqual(['FY'])
  expect(one('**FYI:**')).toEqual(['FYI:'])
  expect(one('FYI:')).toEqual(['FYI:'])
  expect(one('DONE 2026-10-17 (all')).toEqual(['DONE'])
})
test('empty and label-free text return undefined', () => {
  expect(splitLabels('')).toBeUndefined()
  expect(splitLabels('Plain reply with **bold** and `code`.')).toBeUndefined()
})

type Props = RenderPropsOf['AssistantMessage']
const mount = async ($: Engine, on: On, props: Props, surface: RenderSurface = 'terminal') => {
  const seen: Props[] = []
  on('ui.render', { component: 'AssistantMessage' }, ($, e) => {
    seen.push(e.props)
    return $.ui.resolve(e).Markdown({ text: e.props.text })
  })
  const ui = await $.ui.mount({ plugin: 'doki-theme-picker', surface, component: 'AssistantMessage', props })
  return { ui, seen }
}

test('no label draws the engine default untouched', async ($, on) => {
  const props = { text: 'Plain reply.', isFirstOfReply: true }
  const { ui, seen } = await mount($, on, props)
  expect(seen).toEqual([props])
  expect(await ui.drawn()).toMatchObject({ type: 'Markdown', props: { text: 'Plain reply.' } })
  await ui.unmount()
})
test('a label is repainted bold in the claude color over the engine row', async ($, on) => {
  const props = { text: '**FYI:** see `x`', isFirstOfReply: true }
  const { ui, seen } = await mount($, on, props)
  expect(seen).toEqual([props])
  const label = await ui.find({ type: 'Text', text: 'FYI:' })
  expect(label?.props).toMatchObject({ color: 'claude', weight: 'bold' })
  expect((await ui.find({ type: 'Markdown' }))?.text).toBe('**FYI:** see `x`')
  await ui.unmount()
})
test('a heading alone on its line is repainted as drawn, with no colon added', async ($, on) => {
  const { ui } = await mount($, on, { text: 'WAITS ON SHELVI\n1. Approve', isFirstOfReply: true })
  const label = await ui.find({ type: 'Text', text: 'WAITS ON SHELVI' })
  expect(label?.props).toMatchObject({ color: 'claude', weight: 'bold' })
  expect(await ui.find({ type: 'Text', text: 'WAITS ON SHELVI:' })).toBeUndefined()
  await ui.unmount()
})
test('later labels split the block; only the first keeps the reply bullet', async ($, on) => {
  const { ui, seen } = await mount($, on, { text: 'Intro.\n\nNEXT: go', isFirstOfReply: true })
  expect(seen.map(p => [p.text, p.isFirstOfReply])).toEqual([['Intro.', true], ['NEXT: go', false]])
  expect((await ui.findAll({ type: 'Text', text: 'NEXT:' })).length).toBe(1)
  await ui.unmount()
})
test('other surfaces and summaries keep the default', async ($, on) => {
  const { ui, seen } = await mount($, on, { text: 'DONE: x', isFirstOfReply: true }, 'desktop')
  expect(await ui.find({ type: 'Text', text: 'DONE:' })).toBeUndefined()
  await ui.unmount()
  const summary = await $.ui.mount({ plugin: 'doki-theme-picker', surface: 'terminal', component: 'AssistantMessage', props: { text: 'DONE: x', isFirstOfReply: false, isSummary: true } })
  expect(seen.length).toBe(2)
  expect(await summary.find({ type: 'Text', text: 'DONE:' })).toBeUndefined()
  await summary.unmount()
})
// H2: category words that open a top-level dash bullet.
const heads = (text: string) => splitReply(text)?.map(p => p.heading ?? p.label ?? '')

test('each category opens a piece at a top-level bullet, in any case', () => {
  for (const word of CATEGORIES)
    for (const shown of [word, word.toUpperCase(), word.toLowerCase()]) {
      expect(splitReply(`- ${shown}`)).toEqual([{ text: `- ${shown}`, heading: shown }])
      expect(heads(`- ${shown}:`)).toEqual([shown])
      expect(heads(`- **${shown}**`)).toEqual([shown])
      expect(heads(`- **${shown}:** x`)).toEqual([shown])
      expect(heads(`- **${shown}**: x`)).toEqual([shown])
    }
})
test('a dated or bracketed category bullet keeps its nested bullets in its piece', () => {
  expect(splitReply('- Done (2026-10-17)\n  - Data Center case studies\n  - Second\n- Waits on Shelvi\n  - Phone check')).toEqual([
    { text: '- Done (2026-10-17)\n  - Data Center case studies\n  - Second', heading: 'Done' },
    { text: '- Waits on Shelvi\n  - Phone check', heading: 'Waits on Shelvi', tight: true },
  ])
  for (const rest of [' (x)', ' [x]', ' - x', ' \u2013 x', ' \u2014 x', ' 2026-10-17', ': x', ':']) expect(heads(`- Later${rest}`)).toEqual(['Later'])
})
test('text before a category bullet is its own piece, and the bullet follows it tight', () => {
  expect(splitReply('An intro line.\n- FYI\n  - note')).toEqual([{ text: 'An intro line.' }, { text: '- FYI\n  - note', heading: 'FYI', tight: true }])
  expect(splitReply('Intro.\n\n- Undone')).toEqual([{ text: 'Intro.' }, { text: '- Undone', heading: 'Undone' }])
  // A blank line inside a list draws no blank row, so the bullet after it is tight too.
  expect(splitReply('- Undone\n  - one\n\n- FYI\n  - two')).toEqual([{ text: '- Undone\n  - one', heading: 'Undone' }, { text: '- FYI\n  - two', heading: 'FYI', tight: true }])
  expect(splitReply('- a\n\n- Later')).toEqual([{ text: '- a' }, { text: '- Later', heading: 'Later', tight: true }])
  expect(splitReply('```\ncode\n```\n\n- Later')).toEqual([{ text: '```\ncode\n```' }, { text: '- Later', heading: 'Later' }])
})
test('a nested, fenced, mid-line or other-word bullet is not a category', () => {
  for (const text of [
    '  - Done (nested)',
    '- Something\n  - Done (nested)',
    '    - Later',
    '-Done',
    '* Done',
    '> - Done',
    'Done',
    '- Done mid-line',
    '- Done, then more',
    '- Done.',
    '- Doneness',
    '- Later we will',
    '- Waits on Bob',
    '- **Done:**: two colons',
    '- `Done`',
    '```\n- Done in a fence\n```',
    '~~~\n- FYI\n~~~',
  ])
    expect(splitReply(text)).toBeUndefined()
})
test('partial streaming text is safe and colors only whole category words', () => {
  for (const text of ['-', '- ', '- D', '- Do', '- Don', '- W', '- Waits', '- Waits on', '- Waits on Shel', '- **', '- **Do', '- **Done', '- **Done*', '- Done (2026', '```\n- Done'])
    expect(() => splitReply(text)).not.toThrow()
  for (const text of ['- D', '- Do', '- Don', '- Waits', '- Waits on', '- Waits on Shel', '- **Do', '- **Done*', '```\n- Done']) expect(splitReply(text)).toBeUndefined()
  // Stars that do not close yet are drawn as text, so the words start 2 cells later.
  expect(splitReply('- **Done')).toEqual([{ text: '- **Done', heading: 'Done', headingAt: 2 }])
  expect(splitReply('- **Done (2026')).toEqual([{ text: '- **Done (2026', heading: 'Done', headingAt: 2 }])
  expect(splitReply('- **Done (2026-10-17)*')).toEqual([{ text: '- **Done (2026-10-17)*', heading: 'Done', headingAt: 2 }])
  expect(splitReply('- **Open checks')).toEqual([{ text: '- **Open checks', heading: 'Open checks', headingAt: 2 }])
  expect(heads('- Done')).toEqual(['Done'])
  expect(heads('- Done (2026')).toEqual(['Done'])
  expect(heads('- **Done**')).toEqual(['Done'])
})
test('bold that wraps the whole category line, and Open checks', () => {
  expect(splitReply('- **Done (2026-10-17)**')).toEqual([{ text: '- **Done (2026-10-17)**', heading: 'Done' }])
  expect(splitReply('- **Open checks**')).toEqual([{ text: '- **Open checks**', heading: 'Open checks' }])
  expect(splitReply('- open check: x')).toEqual([{ text: '- open check: x', heading: 'open check' }])
  expect(splitReply('- **Done** (2026-10-18)')).toEqual([{ text: '- **Done** (2026-10-18)', heading: 'Done' }])
  expect(splitReply('- **Done:** x')).toEqual([{ text: '- **Done:** x', heading: 'Done' }])
  expect(splitReply('- **Later: tidy the board**')).toEqual([{ text: '- **Later: tidy the board**', heading: 'Later' }])
  for (const text of ['- Done**', '- Done** (x)', '- **Doneness**', '- **Later we will**', '- **Open checkup**', '- **Done:**: x', '  - **Done (2026-10-17)**', '- a\n  - **Open checks**'])
    expect(splitReply(text)).toBeUndefined()
})
test('a reply that mixes labels and category bullets', () => {
  expect(splitReply('**DONE:** built it.\n\n- Done (2026-10-17)\n  - a\n- Waits on Shelvi\n  - b\n\nNEXT: run it\n- Later\n  - c')).toEqual([
    { text: '**DONE:** built it.', label: 'DONE:' },
    { text: '- Done (2026-10-17)\n  - a', heading: 'Done' },
    { text: '- Waits on Shelvi\n  - b', heading: 'Waits on Shelvi', tight: true },
    { text: 'NEXT: run it', label: 'NEXT:' },
    { text: '- Later\n  - c', heading: 'Later', tight: true },
  ])
  // The H1 split alone does not see bullets.
  expect(splitLabels('**DONE:** built it.\n\n- Done (2026-10-17)')).toEqual([{ text: '**DONE:** built it.\n\n- Done (2026-10-17)', label: 'DONE:' }])
})

test('a category bullet is repainted in capitals, underlined, in its own color', async ($, on) => {
  const { ui, seen } = await mount($, on, { text: '- Done (2026-10-17)\n  - Data', isFirstOfReply: true })
  expect(seen.map(p => p.text)).toEqual(['- Done (2026-10-17)\n  - Data'])
  const word = await ui.find({ type: 'Text', text: 'DONE' })
  expect(word?.props).toMatchObject({ color: 'suggestion', underline: true })
  expect(word?.props.color).not.toBe('claude')
  expect(await ui.find({ type: 'Text', text: 'DONE (2026-10-17)' })).toBeUndefined()
  await ui.unmount()
})
test('a tight category bullet is drawn as markdown under the block before it, one overlay each', async ($, on) => {
  const text = '**DONE:** built it.\n\n- Done (2026-10-17)\n  - a\n- Waits on Shelvi\n  - b'
  const { ui, seen } = await mount($, on, { text, isFirstOfReply: true })
  expect(seen.map(p => [p.text, p.isFirstOfReply])).toEqual([
    ['**DONE:** built it.', true],
    ['- Done (2026-10-17)\n  - a', false],
  ])
  const marks = await ui.findAll({ type: 'Markdown' })
  expect(marks.map(m => m.text)).toEqual(['**DONE:** built it.', '- Done (2026-10-17)\n  - a', '- Waits on Shelvi\n  - b'])
  expect((await ui.find({ type: 'Text', text: 'DONE:' }))?.props).toMatchObject({ color: 'claude', weight: 'bold' })
  expect((await ui.findAll({ type: 'Text', text: 'DONE' })).filter(t => t.props.underline).map(t => t.text)).toEqual(['DONE'])
  expect((await ui.find({ type: 'Text', text: 'WAITS ON SHELVI' }))?.props).toMatchObject({ color: 'suggestion', underline: true })
  await ui.unmount()
})
test('category bullets on other surfaces and in summaries keep the default', async ($, on) => {
  const { ui } = await mount($, on, { text: '- Done (x)', isFirstOfReply: true }, 'desktop')
  expect(await ui.find({ type: 'Text', text: 'DONE' })).toBeUndefined()
  await ui.unmount()
  const summary = await $.ui.mount({ plugin: 'doki-theme-picker', surface: 'terminal', component: 'AssistantMessage', props: { text: '- Done (x)', isFirstOfReply: false, isSummary: true } })
  expect(await summary.find({ type: 'Text', text: 'DONE' })).toBeUndefined()
  await summary.unmount()
})

test('the live reply shape: an H1 paragraph, then bold category bullets with nested items', async ($, on) => {
  const text = [
    '**ANSWER:** The H2 fix covers bold category bullets.',
    '',
    '- **Done (2026-10-17)**',
    '  - Data Center case studies are live on the site, and this sub-bullet is long enough that it wraps past ninety columns',
    '  - Second item',
    '- **Waits on Shelvi**',
    '  - Phone check of the new page',
    '- **Open checks**',
    '  - Live reload',
  ].join('\n')
  const { ui, seen } = await mount($, on, { text, isFirstOfReply: true })
  expect(seen.map(p => [p.text.split('\n')[0], p.isFirstOfReply])).toEqual([
    ['**ANSWER:** The H2 fix covers bold category bullets.', true],
    ['- **Done (2026-10-17)**', false],
  ])
  expect((await ui.findAll({ type: 'Markdown' })).map(m => m.text.split('\n')[0])).toEqual([
    '**ANSWER:** The H2 fix covers bold category bullets.',
    '- **Done (2026-10-17)**',
    '- **Waits on Shelvi**',
    '- **Open checks**',
  ])
  expect((await ui.find({ type: 'Text', text: 'ANSWER:' }))?.props).toMatchObject({ color: 'claude', weight: 'bold' })
  const words = (await ui.findAll({ type: 'Text' })).filter(t => t.props.underline).map(t => [t.text, t.props.color])
  expect(words).toEqual([['DONE', 'suggestion'], ['WAITS ON SHELVI', 'suggestion'], ['OPEN CHECKS', 'suggestion']])
  // The first bullet follows a blank line: an engine block, its row under the blank row above it.
  const places = (await ui.findAll({ type: 'Box' })).filter(b => b.props.position === 'absolute').map(b => [b.props.top, b.props.left])
  expect(places).toEqual([[1, 2], [1, 2], [1, 4], [0, 2], [0, 4], [0, 2], [0, 4]])
  await ui.unmount()
})

// H2 on numbered items: the piece keeps the number the engine draws for the item.
const items = (n: number) => Array.from({ length: n }, (_, i) => `${i + 1}. Item`).join('\n')
test('a top-level numbered item opens a category piece, numbered as the engine draws it', () => {
  expect(splitReply('1. Done (2026-10-17)')).toEqual([{ text: '1. Done (2026-10-17)', heading: 'Done', headingAt: 1 }])
  expect(splitReply('1. Approve\n2. Done (2026-10-17)\n   - sub\n3. **Waits on Shelvi**\n   - b\n10. Later: tidy')).toEqual([
    { text: '1. Approve' },
    { text: '2. Done (2026-10-17)\n   - sub', heading: 'Done', headingAt: 1, tight: true },
    { text: '3. **Waits on Shelvi**\n   - b', heading: 'Waits on Shelvi', headingAt: 1, tight: true },
    // The engine counts on from the first number: "10." in the source is drawn "4.".
    { text: '4. Later: tidy', heading: 'Later', headingAt: 1, tight: true },
  ])
  expect(splitReply(`${items(9)}\n10. **Open checks**`)?.at(-1)).toEqual({ text: '10. **Open checks**', heading: 'Open checks', headingAt: 2, tight: true })
  expect(splitReply('1. **Done (2026-10-17)**')).toEqual([{ text: '1. **Done (2026-10-17)**', heading: 'Done', headingAt: 1 }])
  expect(splitReply('Intro.\n\n7. Done\n8. FYI')).toEqual([{ text: 'Intro.' }, { text: '7. Done', heading: 'Done', headingAt: 1 }, { text: '8. FYI', heading: 'FYI', headingAt: 1, tight: true }])
  expect(splitReply('Intro.\n1. Done')).toEqual([{ text: 'Intro.' }, { text: '1. Done', heading: 'Done', headingAt: 1, tight: true }])
  // A loose list: the item after a blank line is still the same list, with no blank row.
  expect(splitReply('1. Approve\n\n2. Done')).toEqual([{ text: '1. Approve' }, { text: '2. Done', heading: 'Done', headingAt: 1, tight: true }])
  // An item indented less than the item text is a sibling, so it counts.
  expect(splitReply('9. a\n  1. b\n3. Done')).toEqual([{ text: '9. a\n  1. b' }, { text: '11. Done', heading: 'Done', headingAt: 2, tight: true }])
  // A paragraph after a blank line ends the list; the next list counts from its own first number.
  expect(splitReply('1. a\n\nText.\n\n5. Done')?.at(-1)).toEqual({ text: '5. Done', heading: 'Done', headingAt: 1 })
})
test('nested, indented, other-delimiter, fenced or unopened numbered items are not a category', () => {
  for (const text of [
    '  1. Done',
    '1) Done',
    '1.  Done',
    '1.Done',
    '1. a\n   1. Done',
    '10. a\n    1. Done',
    'Intro.\n2. Done',
    '- a\n2. Done',
    '```\n1. Done\n```',
    '1. Doneness',
    '1. Done mid-line',
    '1. Later we will',
    '1. Done**',
  ])
    expect(splitReply(text)).toBeUndefined()
  expect(splitLabels('1. DONE 2026-10-17')).toBeUndefined()
})
test('partial numbered items are safe and colored only as whole words', () => {
  for (const text of ['1', '1.', '1. ', '1. D', '1. Don', '1. Waits on', '10', '10.', '10. L', '1. **Do', '1. a\n2', '1. a\n2.'])
    expect(() => splitReply(text)).not.toThrow()
  for (const text of ['1', '1.', '1. ', '1. D', '1. Don', '1. Waits on', '10', '10.', '10. L', '1. **Do']) expect(splitReply(text)).toBeUndefined()
  expect(splitReply('1. **Done (2026')).toEqual([{ text: '1. **Done (2026', heading: 'Done', headingAt: 3 }])
})
test('numbered category items are repainted after their 1- and 2-digit marks', async ($, on) => {
  const text = ['**ANSWER:** numbered.', '', '1. Approve', '2. Done (2026-10-17)', '   - a', ...items(9).split('\n').slice(2), '10. **Open checks**'].join('\n')
  const { ui } = await mount($, on, { text, isFirstOfReply: true })
  expect((await ui.findAll({ type: 'Markdown' })).map(m => m.text.split('\n')[0])).toEqual(['**ANSWER:** numbered.', '2. Done (2026-10-17)', '10. **Open checks**'])
  const words = (await ui.findAll({ type: 'Text' })).filter(t => t.props.underline).map(t => [t.text, t.props.color])
  expect(words).toEqual([['DONE', 'suggestion'], ['OPEN CHECKS', 'suggestion']])
  const places = (await ui.findAll({ type: 'Box' })).filter(b => b.props.position === 'absolute').map(b => [b.props.top, b.props.left])
  expect(places).toEqual([[1, 2], [0, 5], [0, 6]])
  await ui.unmount()
})

// Labels written as Markdown headings ("## ANSWER:"): the engine draws them with no hashes.
test('a heading label is a label, with no hashes', () => {
  expect(splitLabels('## ANSWER:\n\nLast work was x.')).toEqual([{ text: '## ANSWER:\n\nLast work was x.', label: 'ANSWER:' }])
  expect(one('## ANSWER')).toEqual(['ANSWER'])
  expect(one('## ANSWER: text on same line')).toEqual(['ANSWER:'])
  expect(one('## DONE 2026-10-17 (x)')).toEqual(['DONE'])
  expect(one('## WAITS ON SHELVI\n1. a')).toEqual(['WAITS ON SHELVI'])
  expect(one('## **FYI:**')).toEqual(['FYI:'])
  expect(one('# NEXT:')).toEqual(['NEXT:'])
  expect(one('###### NEXT:')).toEqual(['NEXT:'])
  expect(one('Intro.\n\n## NEXT: go')).toEqual([undefined, 'NEXT:'])
  for (const text of ['#ANSWER:', '####### ANSWER:', '## Answer:', '## A: single capital', 'Intro\n## NEXT:', '```\n## FYI:\n```', '    ## ANSWER:', '## API changes', '##  ANSWER:'])
    expect(splitLabels(text)).toBeUndefined()
})
test('partial heading labels are safe', () => {
  for (const text of ['#', '##', '## ', '## A', '## AN', '## ANSWER', '## ANSWER:', '## **ANS']) expect(() => splitReply(text)).not.toThrow()
  for (const text of ['#', '##', '## ', '## A', '## **ANS']) expect(splitReply(text)).toBeUndefined()
  expect(one('## ANSWER')).toEqual(['ANSWER'])
  expect(one('## ANSWER:')).toEqual(['ANSWER:'])
})
test('a reply under the heading rule: heading labels and category bullets', () => {
  expect(splitReply('## ANSWER:\n\nLast work.\n\n- **Done (2026-10-17)**\n  - a\n- **Waits on Shelvi**\n  - b\n\n## NEXT: run it')).toEqual([
    { text: '## ANSWER:\n\nLast work.', label: 'ANSWER:' },
    { text: '- **Done (2026-10-17)**\n  - a', heading: 'Done' },
    { text: '- **Waits on Shelvi**\n  - b', heading: 'Waits on Shelvi', tight: true },
    { text: '## NEXT: run it', label: 'NEXT:' },
  ])
})
test('a heading label is repainted bold in the claude color on the engine row', async ($, on) => {
  const text = '## ANSWER:\n\nLast work.\n\n- **Done (2026-10-17)**\n  - a\n\n## NEXT: run it'
  const { ui, seen } = await mount($, on, { text, isFirstOfReply: true })
  expect(seen.map(p => [p.text, p.isFirstOfReply])).toEqual([['## ANSWER:\n\nLast work.', true], ['- **Done (2026-10-17)**\n  - a', false], ['## NEXT: run it', false]])
  for (const word of ['ANSWER:', 'NEXT:']) expect((await ui.find({ type: 'Text', text: word }))?.props).toMatchObject({ color: 'claude', weight: 'bold' })
  expect(await ui.find({ type: 'Text', text: '## ANSWER:' })).toBeUndefined()
  const places = (await ui.findAll({ type: 'Box' })).filter(b => b.props.position === 'absolute').map(b => [b.props.top, b.props.left])
  expect(places).toEqual([[1, 2], [1, 2], [1, 4], [1, 2]])
  await ui.unmount()
})

// H2 on any one-word intro with a colon: "- Commit: f0a582e".
test('a one-word intro with a colon opens a piece, in dash and numbered items', () => {
  expect(INTRO_WORDS).toBe(5)
  expect(splitReply('- Commit: f0a582e "Add icons", 4 files')).toEqual([{ text: '- Commit: f0a582e "Add icons", 4 files', heading: 'Commit' }])
  for (const [text, word] of [['- Result: 5 pass', 'Result'], ['- **Commit:** x', 'Commit'], ['- **Commit**: x', 'Commit'], ['- **Commit: x**', 'Commit'], ['- Commit:', 'Commit'], ['- re-run: x', 're-run'], ['- Step2: x', 'Step2']])
    expect(splitReply(text!)?.[0]).toMatchObject({ heading: word })
  expect(splitReply('1. Note: x')).toEqual([{ text: '1. Note: x', heading: 'Note', headingAt: 1 }])
  expect(splitReply('1. a\n2. Result: x')?.at(-1)).toEqual({ text: '2. Result: x', heading: 'Result', headingAt: 1, tight: true })
  expect(splitReply(`${items(9)}\n10. **Note:** x`)?.at(-1)).toEqual({ text: '10. **Note:** x', heading: 'Note', headingAt: 2, tight: true })
})
test('intros that are over five words, or not a word with a colon and a space, stay plain', () => {
  for (const text of [
    '- https://x',
    '- 10:30 x',
    '- C: drive',
    '- One two three four five six: x',
    '- Commit',
    '- Commit x',
    '- Commit :',
    '- Commit:x',
    '- Commit::',
    '- Commit** : x',
    '- Commit**: x',
    '  - Commit: nested',
    '- a\n  - Commit: nested',
    '```\n- Commit: x\n```',
    '- Abcdefghijklmnopqrstuvwxyz: too long',
    '1) Note: x',
    '1. a\n   1. Note: nested',
  ])
    expect(splitReply(text)).toBeUndefined()
  expect(splitLabels('- Commit: x')).toBeUndefined()
})
test('INTRO_WORDS 2 also takes two-word intros, and no more', () => {
  expect(splitReply('- Left out: DOCS.md', 2)).toEqual([{ text: '- Left out: DOCS.md', heading: 'Left out' }])
  expect(splitReply('- **Secret scan:** 3 hits', 2)?.[0]).toMatchObject({ heading: 'Secret scan' })
  expect(splitReply('- Commit: x', 2)?.[0]).toMatchObject({ heading: 'Commit' })
  expect(splitReply('- Three word intro: x', 2)).toBeUndefined()
  expect(splitReply('- One two three four five: x')?.[0]).toMatchObject({ heading: 'One two three four five' })
  expect(splitReply('- One two three four five six: x')).toBeUndefined()
  expect(splitReply('- Left out: x')?.[0]).toMatchObject({ heading: 'Left out' })
})
test('a partial intro is plain until its colon arrives', () => {
  for (const text of ['- C', '- Co', '- Comm', '- Commit', '- **Commit', '- **Commit:*', '1. Note', '- Left'])
    expect(() => splitReply(text)).not.toThrow()
  for (const text of ['- C', '- Co', '- Comm', '- Commit', '- **Commit', '- **Commit:*', '1. Note']) expect(splitReply(text)).toBeUndefined()
  expect(splitReply('- Commit:')?.[0]).toMatchObject({ heading: 'Commit' })
  expect(splitReply('- **Commit:')).toEqual([{ text: '- **Commit:', heading: 'Commit', headingAt: 2 }])
})
test('the live reply shape: intros, a category with nested items, under a heading label', async ($, on) => {
  const text = [
    '## DONE:',
    '',
    'Pushed the icon directory.',
    '',
    '- Commit: f0a582e "Add Nerd Font icon directory", 4 files, +125 lines.',
    '- Secret scan: 3 hits, all in hooks/nerdfont-data.js.',
    '- Left out: DOCS.md and desktop.ini are still untracked.',
    '- FYI:',
    '  - The repo is public.',
    '  - Git warned that LF will be replaced by CRLF.',
  ].join('\n')
  const { ui } = await mount($, on, { text, isFirstOfReply: true })
  expect((await ui.find({ type: 'Text', text: 'DONE:' }))?.props).toMatchObject({ color: 'claude', weight: 'bold' })
  const words = (await ui.findAll({ type: 'Text' })).filter(t => t.props.underline).map(t => [t.text, t.props.color])
  expect(words).toEqual([['COMMIT', 'suggestion'], ['SECRET SCAN', 'suggestion'], ['LEFT OUT', 'suggestion'], ['FYI', 'suggestion']])
  const places = (await ui.findAll({ type: 'Box' })).filter(b => b.props.position === 'absolute').map(b => [b.props.top, b.props.left])
  expect(places).toEqual([[1, 2], [1, 2], [1, 4], [0, 2], [0, 4], [0, 2], [0, 4], [0, 2], [0, 4]])
  await ui.unmount()
})

// A dash item with the H2 look shows the oct-dot_fill glyph (U+F444) over the dash cell.
const DOT = '\uF444'
const overlays = async (ui: Awaited<ReturnType<typeof mount>>['ui']) =>
  (await ui.findAll({ type: 'Box' }))
    .filter(b => b.props.position === 'absolute')
    .map(b => [b.props.top, b.props.left, b.text])
test('the dash of an H2 dash item is painted as the dot glyph; numbered items and labels keep theirs', async ($, on) => {
  const text = [
    '## DONE:',
    '',
    '- Commit: f0a582e',
    '- Secret scan: 3 hits',
    '- **Done (2026-10-17)**',
    '  - nested',
    '',
    '- FYI:',
    '  - nested',
    '',
    'Options.',
    '',
    '1. Raise it',
    '   - nested',
    '2. Result: x',
  ].join('\n')
  const { ui } = await mount($, on, { text, isFirstOfReply: true })
  expect(await overlays(ui)).toEqual([
    [1, 2, 'DONE:'],
    [1, 2, DOT],
    [1, 4, 'COMMIT'],
    [0, 2, DOT],
    [0, 4, 'SECRET SCAN'],
    [0, 2, DOT],
    [0, 4, 'DONE'],
    [0, 2, DOT],
    [0, 4, 'FYI'],
    [0, 5, 'RESULT'],
  ])
  await ui.unmount()
})
test('a bold item whose stars are drawn keeps its word after them, the dot on the dash', async ($, on) => {
  const { ui } = await mount($, on, { text: 'Intro.\n\n- **Commit:', isFirstOfReply: true })
  expect(await overlays(ui)).toEqual([[1, 2, DOT], [1, 6, 'COMMIT']])
  await ui.unmount()
})
// The engine's markdown draws a plain or nested item's "-"; no overlay reaches a row inside a block.
test('plain and nested items, and dash items in a fence, get no dot', async ($, on) => {
  const text = ['- Done: x', '  - Renewable 71452', '- plain item', '', '```', '- Done: in a fence', '```'].join('\n')
  const { ui } = await mount($, on, { text, isFirstOfReply: true })
  expect((await overlays(ui)).filter(o => o[2] === DOT)).toEqual([[1, 2, DOT]])
  expect((await ui.findAll({ type: 'Markdown' })).map(m => m.text)).toEqual([text])
  await ui.unmount()
})

// A short lead-in with no end mark and a list right under it reads as a group heading.
test('a short lead-in with a list under it is a group heading', () => {
  expect(splitReply('Intro\n- FYI')?.[0]).toEqual({ text: 'Intro', heading: 'Intro', bare: true })
})
// Group headings: a short line with a list right under it, or a title-case Markdown heading.
test('a bare group heading with a list under it opens a piece', () => {
  expect(BARE_HEADING_WORDS).toBe(4)
  expect(splitReply('Done\n- All 16 pages are live.')).toEqual([{ text: 'Done\n- All 16 pages are live.', heading: 'Done', bare: true }])
  for (const [text, words] of [
    ['Waits on Shelvi\n- a', 'Waits on Shelvi'],
    ["Next action (Shelvi's)\n- a", "Next action (Shelvi's)"],
    ['Open checks\n1. a', 'Open checks'],
    ['Later:\n- a', 'Later'],
    ['What changed\n- a', 'What changed'],
  ])
    expect(splitReply(text!)?.[0]).toEqual({ text: text, heading: words, bare: true })
  expect(splitReply('Intro.\n\nDone\n- a\n\nNext action\n- b')).toEqual([
    { text: 'Intro.' },
    { text: 'Done\n- a', heading: 'Done', bare: true },
    { text: 'Next action\n- b', heading: 'Next action', bare: true },
  ])
})
test('sentences, long lines and lines with no list right under them are no group heading', () => {
  for (const text of [
    'These are the steps:\n- a',
    'Here is what I found:\n- a',
    'I checked:\n- a',
    'It is done\n- a',
    'Done.\n- a',
    'Is it done?\n- a',
    'Ready!\n- a',
    'Five words are too many\n- a',
    'done\n- a',
    'Done\n\n- a',
    'Done',
    'Done\nmore text',
    'Done\n  - nested',
    'Done\n1) a',
    'Text line\nDone\n- a',
    '\x60\x60\x60\nDone\n- a\n\x60\x60\x60',
    '    Done\n- a',
    'v2.1 notes\n- a',
  ])
    expect(splitReply(text)).toBeUndefined()
  // A capital label keeps the H1 look; a bullet is a bullet.
  expect(splitReply('DONE\n- a')).toEqual([{ text: 'DONE\n- a', label: 'DONE' }])
  expect(splitReply('- Done\n- a')?.[0]).toMatchObject({ heading: 'Done' })
  expect(splitReply('- Done\n- a')?.[0]?.bare).toBeUndefined()
  expect(splitLabels('Done\n- a')).toBeUndefined()
})
test('a title-case Markdown heading is a group heading; a capital one stays a label', () => {
  expect(splitReply('## Done\n\nText.')).toEqual([{ text: '## Done\n\nText.', heading: 'Done', bare: true }])
  expect(splitReply('### Next steps')).toEqual([{ text: '### Next steps', heading: 'Next steps', bare: true }])
  expect(splitReply('## Open checks:')?.[0]).toMatchObject({ heading: 'Open checks', bare: true })
  expect(splitReply('## Done ##')?.[0]).toMatchObject({ heading: 'Done', bare: true })
  expect(splitReply('## DONE:')).toEqual([{ text: '## DONE:', label: 'DONE:' }])
  for (const text of ['## A heading of five words', '## **Done**', '## \x60code\x60', '#Done', '####### Done', 'Text\n## Done'])
    expect(splitReply(text)).toBeUndefined()
})
test('a bare heading is plain until a list item starts under it', () => {
  for (const text of ['D', 'Do', 'Done', 'Done\n', 'Done\n-', 'Done\n1', 'Done\n1.', 'Next action (Shel', '#', '## D'])
    expect(() => splitReply(text)).not.toThrow()
  for (const text of ['Done', 'Done\n', 'Done\n-', 'Done\n1', 'Done\n1.']) expect(splitReply(text)).toBeUndefined()
  expect(splitReply('Done\n- ')?.[0]).toMatchObject({ heading: 'Done', bare: true })
  expect(splitReply('Done\n1. ')?.[0]).toMatchObject({ heading: 'Done', bare: true })
})
test('the live reply: an inline label, bare group headings, a category bullet and options', () => {
  const text = [
    'FOUND: The last logged state is 2026-10-18.',
    '',
    'Done',
    '- All 16 redesign pages are live (2026-10-15).',
    '- Done (2026-10-17)',
    '  - nested',
    '',
    "Next action (Shelvi's)",
    '1. Request indexing',
    '2. Result: x',
  ].join('\n')
  expect(splitReply(text)).toEqual([
    { text: 'FOUND: The last logged state is 2026-10-18.', label: 'FOUND:' },
    { text: 'Done\n- All 16 redesign pages are live (2026-10-15).', heading: 'Done', bare: true },
    { text: '- Done (2026-10-17)\n  - nested', heading: 'Done', tight: true },
    { text: "Next action (Shelvi's)\n1. Request indexing", heading: "Next action (Shelvi's)", bare: true },
    { text: '2. Result: x', heading: 'Result', headingAt: 1, tight: true },
  ])
})
test('bare group headings are repainted at the paragraph cell, with no dash cover', async ($, on) => {
  const text = [
    'FOUND: The last logged state is 2026-10-18.',
    '',
    'Done',
    '- All 16 redesign pages are live.',
    '',
    "Next action (Shelvi's)",
    '- Request indexing.',
  ].join('\n')
  const { ui } = await mount($, on, { text, isFirstOfReply: true })
  expect(await overlays(ui)).toEqual([
    [1, 2, 'FOUND:'],
    [1, 2, 'DONE'],
    [1, 2, "NEXT ACTION (SHELVI'S)"],
  ])
  expect((await ui.find({ type: 'Text', text: 'DONE' }))?.props).toMatchObject({ color: 'suggestion', underline: true })
  await ui.unmount()
})

// Group headings in bold or italic: the engine hides the marks.
test('a bold or italic group heading with a list under it opens a piece', () => {
  const real = [
    'ANSWER: All 16 Divi redesign pages are live.',
    '',
    '**Next action (yours)**',
    '1. GSC URL Inspection and "Request indexing", about 10 URLs per day.',
    '   - Day 1: home page.',
    '',
    '**Done recently**',
    '- 2026-10-17: the live case studies were checked.',
    '',
    '**Still open**',
    '- \x60/sandbox/\x60 (page 49791) needs the new design.',
  ].join('\n')
  expect(splitReply(real)?.map(p => p.label ?? p.heading)).toEqual(['ANSWER:', 'Next action (yours)', 'Done recently', 'Still open'])
  expect(splitReply(real)?.filter(p => p.bare).length).toBe(3)
  for (const [text, words] of [
    ['**Still open:**\n- a', 'Still open'],
    ['**Still open**:\n- a', 'Still open'],
    ['**Still open**  \n- a', 'Still open'],
    ['**Still open**\r\n- a', 'Still open'],
    ['__Still open__\n- a', 'Still open'],
    ['*Still open*\n- a', 'Still open'],
    ['_Still open_\n- a', 'Still open'],
    ['***Still open***\n1. a', 'Still open'],
    ['**Possible, not proven**\n- a', 'Possible, not proven'],
    ['**Verifier result (logged out):**\n- a', 'Verifier result (logged out)'],
    ['**WAITS ON dev:**\n- a', 'WAITS ON dev'],
  ])
    expect(splitReply(text!)?.[0]).toMatchObject({ heading: words, bare: true })
  // Capitals alone in bold stay a label (H1).
  expect(splitReply('**DONE:**\n- a')?.[0]).toMatchObject({ label: 'DONE:' })
})
test('bold lead-ins, bold in a sentence and bold lines with no list under them stay plain', () => {
  for (const text of [
    '**These are the steps:**\n- a',
    '**Did your changes affect it?**\n- a',
    '**Image 2: not changed**\n- a',
    '**Rules \x60dev\x60 chose**\n- a',
    '**1. Ads ping (running now)**\n- a',
    '**Done 2026-10-17** (the earlier summary)\n- a',
    '**Still yours, in the HubSpot screen:**\n- a',
    'We are **still open** here\n- a',
    '**Still open**',
    '**Still open**\n\n- a',
    '**Still open**\nmore text',
    'Text line\n**Still open**\n- a',
    '\x60\x60\x60\n**Still open**\n- a\n\x60\x60\x60',
    '**Still open:**:\n- a',
    '**_Still open_**\n- a',
    '**Still open*\n- a',
  ])
    expect(splitReply(text)).toBeUndefined()
})
test('a bold heading is plain until its closing stars and the list under it arrive', () => {
  for (const text of ['**', '**S', '**Still', '**Still open', '**Still open*', '**Still open**', '**Still open**\n', '**Still open**\n-'])
    expect(() => splitReply(text)).not.toThrow()
  for (const text of ['**S', '**Still open', '**Still open*', '**Still open**', '**Still open**\n', '**Still open**\n-', '**Still open*\n- ']) expect(splitReply(text)).toBeUndefined()
  expect(splitReply('**Still open**\n- ')?.[0]).toMatchObject({ heading: 'Still open', bare: true })
})
test('a bold group heading is repainted with no stars at the paragraph cell', async ($, on) => {
  const text = ['ANSWER: All 16 pages are live.', '', '**Next action (yours)**', '1. Request indexing.', '', '**Done recently**', '- Checked.'].join('\n')
  const { ui } = await mount($, on, { text, isFirstOfReply: true })
  expect(await overlays(ui)).toEqual([
    [1, 2, 'ANSWER:'],
    [1, 2, 'NEXT ACTION (YOURS)'],
    [1, 2, 'DONE RECENTLY'],
  ])
  await ui.unmount()
})
test('a numbered Markdown heading keeps its number plain, whatever the title length', () => {
  expect(splitReply('## 2. Tracking\n- a')?.[0]).toMatchObject({ heading: 'Tracking', bare: true, headingAt: 3 })
  expect(splitReply('## 1. Google Ads campaign v1\n- a')?.[0]).toMatchObject({ heading: 'Google Ads campaign v1', bare: true, headingAt: 3 })
  expect(splitReply('## 3. HubSpot (contacts → properties → MQL flow)')?.[0]).toMatchObject({ heading: 'HubSpot (contacts → properties → MQL flow)', headingAt: 3 })
  expect(splitReply('## 10. Open for you')?.[0]).toMatchObject({ heading: 'Open for you', headingAt: 4 })
  expect(splitReply('## 4. OPEN FOR YOU')).toBeUndefined()
})
test('the lines under a numbered heading start under its title, up to the next heading or label', () => {
  expect(splitReply('## 1. Google Ads\n- Build: paused\n- Link: live\n\n## 2. Tracking\n- Gtm: v25\n\nNEXT: go')).toEqual([
    { text: '## 1. Google Ads', heading: 'Google Ads', headingAt: 3, bare: true },
    { text: '- Build: paused', heading: 'Build', under: 3, tight: true },
    { text: '- Link: live', heading: 'Link', under: 3, tight: true },
    { text: '## 2. Tracking', heading: 'Tracking', headingAt: 3, bare: true },
    { text: '- Gtm: v25', heading: 'Gtm', under: 3, tight: true },
    { text: 'NEXT: go', label: 'NEXT:' },
  ])
  expect(splitReply('## 1. Plans\nplain line\n- Done: x')?.[1]).toEqual({ text: 'plain line', under: 3, tight: true })
  expect(splitReply('## Done\n- Build: x')?.[1]?.under).toBeUndefined()
})
