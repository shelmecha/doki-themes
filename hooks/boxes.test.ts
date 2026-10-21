import { expect, test, type Engine } from 'claude-code/testing'
import { splitBoxes } from './labels'
import type { On, RenderPropsOf } from 'claude-code'

const OPEN = '`★ FYI ─────────────────────────────`'
const CLOSE = '`─────────────────────────────────────`'
const BODY = '- Header: you turned the 404 header ON.\n- Old 404: its button goes to `/about/`.'

test('a closed FYI block is one box between the text around it', () => {
  expect(splitBoxes(`Done.\n\n${OPEN}\n${BODY}\n${CLOSE}\n\nAfter.`)).toEqual([
    { kind: 'text', text: 'Done.' },
    { kind: 'box', title: 'FYI', text: BODY, closed: true },
    { kind: 'text', text: 'After.' },
  ])
  expect(splitBoxes(`${OPEN}\n${BODY}\n${CLOSE}`)).toEqual([{ kind: 'box', title: 'FYI', text: BODY, closed: true }])
  // CRLF and trailing spaces on the rule lines.
  expect(splitBoxes(`${OPEN}  \r\n- a\r\n${CLOSE}\r`)).toEqual([{ kind: 'box', title: 'FYI', text: '- a', closed: true }])
})
test('an unclosed block (still streaming) holds the rest of the text, nothing dropped', () => {
  expect(splitBoxes(`Done.\n\n${OPEN}\n${BODY}`)).toEqual([
    { kind: 'text', text: 'Done.' },
    { kind: 'box', title: 'FYI', text: BODY, closed: false },
  ])
  expect(splitBoxes(OPEN)).toEqual([{ kind: 'box', title: 'FYI', text: '', closed: false }])
  // A closing rule still streaming ("`───" with no backtick) stays a line of the box.
  expect(splitBoxes(`${OPEN}\n- a\n\`───`)).toEqual([{ kind: 'box', title: 'FYI', text: '- a\n`───', closed: false }])
})
test('other inline code, other star lines, indented or fenced openers are no box', () => {
  expect(splitBoxes('Run `npm test` first.')).toBeUndefined()
  expect(splitBoxes('`npm test`\n- a\n`───────`')).toBeUndefined()
  expect(splitBoxes('`★ Note ─────`\n- a\n`───────`')).toBeUndefined()
  expect(splitBoxes('`ℹ FYI ─────`\n- a\n`───────`')).toBeUndefined()
  expect(splitBoxes('★ FYI ─────\n- a\n───────')).toBeUndefined()
  expect(splitBoxes(`  ${OPEN}\n- a\n${CLOSE}`)).toBeUndefined()
  expect(splitBoxes(`\`\`\`\n${OPEN}\n- a\n${CLOSE}\n\`\`\``)).toBeUndefined()
  expect(splitBoxes('**FYI:** plain label')).toBeUndefined()
  // A lone closing rule opens nothing.
  expect(splitBoxes(`Text\n${CLOSE}`)).toBeUndefined()
})
test('the Explanatory Insight block is boxed the same way; a fence inside a box does not close it', () => {
  expect(splitBoxes('`★ Insight ─────`\nA point.\n`─────`')).toEqual([{ kind: 'box', title: 'Insight', text: 'A point.', closed: true }])
  expect(splitBoxes(`${OPEN}\n\`\`\`\n${CLOSE}\n\`\`\`\n${CLOSE}`)).toEqual([{ kind: 'box', title: 'FYI', text: `\`\`\`\n${CLOSE}\n\`\`\``, closed: true }])
})
test('two blocks in one reply', () => {
  expect(splitBoxes(`${OPEN}\n- a\n${CLOSE}\nMid.\n${OPEN}\n- b\n${CLOSE}`)?.map(s => s.kind)).toEqual(['box', 'text', 'box'])
})

type Props = RenderPropsOf['AssistantMessage']
const mount = async ($: Engine, on: On, props: Props) => {
  const seen: Props[] = []
  on('ui.render', { component: 'AssistantMessage' }, ($, e) => {
    seen.push(e.props)
    return $.ui.resolve(e).Markdown({ text: e.props.text })
  })
  const ui = await $.ui.mount({ plugin: 'doki-theme-picker', surface: 'terminal', component: 'AssistantMessage', props })
  return { ui, seen }
}

test('the block draws in a single-bordered box titled on its top border, lead-ins still styled', async ($, on) => {
  const { ui, seen } = await mount($, on, { text: `Done.\n\n${OPEN}\n${BODY}\n${CLOSE}`, isFirstOfReply: true })
  // The engine draws the text before the box; the box lines are the mod's own markdown.
  expect(seen.map(p => [p.text, p.isFirstOfReply])).toEqual([['Done.', true]])
  const frame = (await ui.findAll({ type: 'Box' })).find(b => b.props?.borderStyle === 'single')
  expect(frame?.props).toMatchObject({ borderStyle: 'single', borderColor: 'subtle' })
  expect((await ui.find({ type: 'Text', text: ' ★ FYI ' }))?.props).toMatchObject({ weight: 'bold' })
  const texts = (await ui.findAll({ type: 'Markdown' })).map(m => m.text ?? '')
  expect(texts.join('\n')).toContain('Header: you turned the 404 header ON.')
  expect(texts.join('\n')).toContain('Old 404: its button goes to `/about/`.')
  expect(texts.some(t => t.includes('─'))).toBe(false)
  expect((await ui.find({ type: 'Text', text: 'HEADER' }))?.props).toMatchObject({ color: 'suggestion', underline: true })
  await ui.unmount()
})
test('an unclosed block draws its lines in the box; text without a block keeps the engine default', async ($, on) => {
  const { ui } = await mount($, on, { text: `${OPEN}\nhalf a line`, isFirstOfReply: false })
  expect((await ui.findAll({ type: 'Box' })).find(b => b.props?.borderStyle === 'single')).toBeDefined()
  expect((await ui.find({ type: 'Markdown' }))?.text).toBe('half a line')
  await ui.unmount()
})
test('text without a block keeps the engine default', async ($, on) => {
  const { ui } = await mount($, on, { text: 'Run `npm test` first.', isFirstOfReply: true })
  expect((await ui.findAll({ type: 'Box' })).find(b => b.props?.borderStyle === 'single')).toBeUndefined()
  expect(await ui.drawn()).toMatchObject({ type: 'Markdown', props: { text: 'Run `npm test` first.' } })
  await ui.unmount()
})
