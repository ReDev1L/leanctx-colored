import type { Register, RenderElement } from 'claude-code'

import { type Els, drawParts } from './draw'
import { textOf, type View } from './model'
import { patchView } from './patch'
import { readView } from './read'
import { searchView } from './search'

// Tools whose responses the mod draws. A literal rather than the RENDERERS keys: the hook matcher is
// read statically (validate shows a computed one as tool=?), and the engine filters out other rows itself
const TOOLS = ['mcp__lean-ctx__ctx_patch', 'mcp__lean-ctx__ctx_read', 'mcp__lean-ctx__ctx_search'] as const

// Parses a response (and the call input) into a View; null leaves it to the engine. The compiler
// checks the keys: a tool in TOOLS without a parser, or a parser without a tool, is a type error
type Renderer = (text: string, input: unknown) => View | null
const RENDERERS: Record<(typeof TOOLS)[number], Renderer> = {
  'mcp__lean-ctx__ctx_patch': patchView,
  'mcp__lean-ctx__ctx_read': readView,
  'mcp__lean-ctx__ctx_search': searchView,
}

// What the mod draws for a response: the parse, the summary for the engine's row (one object for
// every redraw) and the rest subtrees per element table
type Shown = { view: View; summary: { type: 'text'; text: string }[]; drawn: Map<Els, RenderElement> }

// The hook re-runs on scroll and resize while a finished call's response never changes: the parse
// is cached per component and tool_use_id (ToolResult has no call input, so its parse differs);
// when the cache is full the oldest entry goes
const CACHE_LIMIT = 200
const cache = new Map<string, { output: unknown; text: string; shown: Shown | null }>()

// Cached parse: the same output object skips textOf, the same text skips parsing again
function shownFor(render: Renderer, key: string, output: unknown, input: unknown): Shown | null {
  const hit = cache.get(key)
  if (hit !== undefined && hit.output === output) return hit.shown
  const text = textOf(output)
  if (hit !== undefined && hit.text === text) {
    hit.output = output
    return hit.shown
  }
  const view = render(text, input)
  const shown = view && { view, summary: [{ type: 'text' as const, text: view.summary }], drawn: new Map() }
  if (hit === undefined && cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next()
    if (!oldest.done) cache.delete(oldest.value)
  }
  cache.set(key, { output, text, shown })
  return shown
}

// The rest of the response under the summary. $.ui.resolve(e) returns one table per surface and
// component and elements are immutable data, so the tree is built once per table, not per redraw
function drawnRest(shown: Shown, els: Els): RenderElement {
  let node = shown.drawn.get(els)
  if (node === undefined) {
    node = <els.Box flexDirection="column">{drawParts(els, shown.view.rest)}</els.Box>
    shown.drawn.set(els, node)
  }
  return node
}

export const register: Register = on => {
  // In a tool group the ToolUse row itself draws the MCP response; there is no separate ToolResult
  on(
    'ui.render',
    { component: 'ToolUse', props: { tool: TOOLS, isRunning: false, isErrored: false, isInterrupted: false } },
    ($, e, next) => {
      const p = e.props
      const shown = shownFor(RENDERERS[p.tool], `${e.component}:${p.tool_use_id}`, p.output, p.input)
      if (!shown) return next(e)

      // The engine draws the call row and the summary, the mod draws the rest below
      return next({ ...e, props: { ...p, output: shown.summary } }).then(row => {
        const els = $.ui.resolve(e)
        return (
          <els.Box flexDirection="column">
            {row}
            <els.Box flexDirection="column" paddingLeft={5}>
              {drawnRest(shown, els)}
            </els.Box>
          </els.Box>
        )
      })
    },
  )

  // A standalone result row: there is no call input here, so a full ctx_read response without
  // a header is not recognised and stays with the engine
  on('ui.render', { component: 'ToolResult', props: { tool: TOOLS, isErrored: false } }, ($, e, next) => {
    const p = e.props
    const shown = shownFor(RENDERERS[p.tool], `${e.component}:${p.tool_use_id}`, p.output, undefined)
    if (!shown) return next(e)

    const els = $.ui.resolve(e)
    return (
      <els.Box flexDirection="column">
        <els.Text dimColor>{shown.view.summary}</els.Text>
        {drawnRest(shown, els)}
      </els.Box>
    )
  })
}
