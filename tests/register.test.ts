import type { On, RenderElement } from 'claude-code'
import type { Mounted } from 'claude-code/testing'
import { describe, expect, test } from 'claude-code/testing'

import { textOf } from '../hooks/model'
import { ADDED_BODY, OUTPUT, READ_LINES, SEARCH, SUMMARY, asMcp } from './fixtures'

const PLUGIN = 'leanctx-colored'
const PATCH = 'mcp__lean-ctx__ctx_patch'
const SURFACES = ['terminal', 'desktop', 'vscode', 'mobile'] as const

const useRow = (output: unknown, overrides: Record<string, unknown> = {}) => ({
  component: 'ToolUse' as const,
  props: {
    tool_use_id: 'toolu_use',
    tool: PATCH,
    input: {},
    isRunning: false,
    isErrored: false,
    isInterrupted: false,
    output,
    ...overrides,
  },
})

const resultRow = (output: unknown, overrides: Record<string, unknown> = {}) => ({
  component: 'ToolResult' as const,
  props: { tool_use_id: 'toolu_result', tool: PATCH, output, isErrored: false, ...overrides },
})

// Engine stub beneath the plugin: draws the row as `engine:<response text>`
function stubEngine(on: On) {
  on('ui.render', { component: 'ToolUse' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, {}, `engine:${textOf(e.props.output)}`) as RenderElement
  })
  on('ui.render', { component: 'ToolResult' }, ($, e) => {
    const { Text } = $.ui.resolve(e)
    return h(Text, {}, `engine:${textOf(e.props.output)}`) as RenderElement
  })
}

// Added diff row: green marker, body is a Code with a path for syntax highlighting, not the diff format
async function expectAddedRow(ui: Pick<Mounted, 'find'>, body = ADDED_BODY) {
  expect((await ui.find({ type: 'Text', text: /^\+ $/ }))?.props).toMatchObject({ color: 'success' })
  const code = await ui.find({ type: 'Code', text: body })
  expect(code?.props).toMatchObject({ source: body, path: 'exceptions.py' })
  expect(code?.props.format).toBeUndefined()
}

describe('ToolUse: ctx_patch', () => {
  test('the engine draws the summary, the diff below has colored markers and highlighting', async ($, on) => {
    stubEngine(on)
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ plugin: PLUGIN, surface, ...useRow(asMcp(OUTPUT)) })
      expect(await ui.find({ type: 'Text', text: `engine:${SUMMARY}` })).toBeDefined()
      await expectAddedRow(ui)
      expect((await ui.find({ type: 'Text', text: '  --- exceptions.py' }))?.props).toMatchObject({ bold: true })
      expect((await ui.find({ type: 'Text', text: /brace-balance/ }))?.props).toMatchObject({ dimColor: true })
      await ui.unmount()
    }
  })

  test('running, errored, interrupted and unknown calls are drawn by the engine with the original response', async ($, on) => {
    stubEngine(on)
    const cases = [
      useRow(undefined, { isRunning: true }),
      useRow(asMcp(OUTPUT), { isErrored: true }),
      useRow(asMcp(OUTPUT), { isInterrupted: true }),
      useRow(asMcp(OUTPUT), { tool: 'mcp__lean-ctx__ctx_shell' }),
      useRow(asMcp('✓ created a.py')),
    ]
    for (const c of cases) {
      const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...c })
      expect(await ui.find({ type: 'Code' })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: `engine:${textOf(c.props.output)}` })).toBeDefined()
      await ui.unmount()
    }
  })

  test('a redraw with the same response comes from the cache, a new one under the same tool_use_id is redrawn', async ($, on) => {
    stubEngine(on)
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...useRow(asMcp(OUTPUT)) })
    await expectAddedRow(ui)
    await ui.redraw({ ...useRow(asMcp(OUTPUT)).props })
    await expectAddedRow(ui)
    await ui.redraw({ ...useRow(asMcp(OUTPUT.replace(ADDED_BODY, 'x = 1'))).props })
    await expectAddedRow(ui, 'x = 1')
    expect(await ui.find({ type: 'Code', text: ADDED_BODY })).toBeUndefined()
    await ui.unmount()
  })
})

describe('ToolUse: ctx_read and ctx_search', () => {
  test('ctx_read: the header is the engine summary, the rows are one Code with line numbers and language by path', async ($, on) => {
    stubEngine(on)
    const row = useRow(asMcp(READ_LINES), {
      tool_use_id: 'toolu_read',
      tool: 'mcp__lean-ctx__ctx_read',
      input: { path: '/src/box.py', mode: 'lines:10-12' },
    })
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ plugin: PLUGIN, surface, ...row })
      expect(await ui.find({ type: 'Text', text: 'engine:box.py 120L lines:10-12' })).toBeDefined()
      expect((await ui.find({ type: 'Code' }))?.props).toMatchObject({
        source: 'def f(x):\n    return x\n',
        startLine: 10,
        path: '/src/box.py',
      })
      await ui.unmount()
    }
  })

  test('ctx_search: the match location is dim, the line is highlighted by file extension', async ($, on) => {
    stubEngine(on)
    const row = useRow(asMcp(SEARCH), { tool_use_id: 'toolu_search', tool: 'mcp__lean-ctx__ctx_search' })
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ plugin: PLUGIN, surface, ...row })
      expect(await ui.find({ type: 'Text', text: 'engine:2 matches in 2 files' })).toBeDefined()
      expect((await ui.find({ type: 'Text', text: 'b.ts:5 ' }))?.props).toMatchObject({ dimColor: true })
      const code = await ui.find({ type: 'Code', text: 'const y' })
      expect(code?.props).toMatchObject({ source: '  const y = 1', path: 'b.ts' })
      await ui.unmount()
    }
  })

  test('ctx_search: the symbol note is `∈ name@L…` with the name in green and the line in blue', async ($, on) => {
    stubEngine(on)
    const text = '1 match\nshop/cart.py:27 return total ∈total@L25'
    const row = useRow(asMcp(text), { tool_use_id: 'toolu_note', tool: 'mcp__lean-ctx__ctx_search' })
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ plugin: PLUGIN, surface, ...row })
      expect((await ui.find({ type: 'Text', text: /^ ∈ $/ }))?.props).toMatchObject({ dimColor: true })
      expect((await ui.find({ type: 'Text', text: /^total$/ }))?.props).toMatchObject({ color: 'success' })
      expect((await ui.find({ type: 'Text', text: /^@$/ }))?.props).toMatchObject({ dimColor: true })
      expect((await ui.find({ type: 'Text', text: /^L25$/ }))?.props).toMatchObject({ color: 'ide' })
      await ui.unmount()
    }
  })
})

describe('ToolResult', () => {
  test('the mod draws ctx_patch: summary, diff and the remaining text', async $ => {
    const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...resultRow(asMcp(OUTPUT)) })
    expect(await ui.find({ type: 'Text', text: SUMMARY })).toBeDefined()
    await expectAddedRow(ui)
    expect(await ui.find({ type: 'Text', text: /^\s+@@ -1,3 \+1,4 @@$/ })).toBeDefined()
    await ui.unmount()
  })

  test('an unknown tool, an error and a response without a diff stay with the engine', async ($, on) => {
    stubEngine(on)
    const cases = [
      resultRow(OUTPUT, { tool: 'mcp__lean-ctx__ctx_shell' }),
      resultRow(OUTPUT, { isErrored: true }),
      resultRow('✓ created a.py'),
    ]
    for (const c of cases) {
      const ui = await $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...c })
      expect(await ui.find({ type: 'Code' })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: /^engine:/ })).toBeDefined()
      await ui.unmount()
    }
  })

  test('ToolUse and ToolResult of one call are parsed separately in either order', async ($, on) => {
    stubEngine(on)
    const text = 'import os\nimport sys'
    for (const resultFirst of [true, false]) {
      const ids = { tool_use_id: `toolu_full_${resultFirst}`, tool: 'mcp__lean-ctx__ctx_read' }
      const input = { path: '/src/a.py', mode: 'full' }
      const mountUse = () => $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...useRow(asMcp(text), { ...ids, input }) })
      const mountResult = () => $.ui.mount({ plugin: PLUGIN, surface: 'terminal', ...resultRow(asMcp(text), ids) })
      // A headerless full ctx_read response is recognised only with the call input, which ToolResult lacks
      for (const mount of resultFirst ? [mountResult, mountUse] : [mountUse, mountResult]) {
        const ui = await mount()
        expect((await ui.find({ type: 'Code' }))?.props.source).toBe(mount === mountUse ? text : undefined)
        await ui.unmount()
      }
    }
  })
})
