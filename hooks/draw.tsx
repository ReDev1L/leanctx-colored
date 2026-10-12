import type { Elements, TextProps } from 'claude-code'

import { columns, type Hit, type Part, type Row, type RowKind } from './model'
import { CODE_KINDS } from './patch'

// Only the +/- markers are colored; syntax highlighting paints the line body
const MARKER_STYLE: Record<RowKind, TextProps> = {
  file: {},
  hunk: {},
  add: { color: 'success', bold: true },
  del: { color: 'error', bold: true },
  ctx: {},
  meta: {},
}
const LINE_STYLE: Record<RowKind, TextProps> = {
  file: { bold: true },
  hunk: { color: 'subtle' },
  add: {},
  del: {},
  ctx: {},
  meta: { dimColor: true },
}

export type Els = Pick<Elements[keyof Elements], 'Box' | 'Text' | 'Code'>

const DIM: TextProps = { dimColor: true }

// Code infers the highlighting language from the path extension
const langOf = (path: string | undefined) => (path ? { path } : {})

// A cell that never shrinks: line number, marker, match location, symbol note.
// Only code shrinks and wraps; otherwise a narrow cell breaks onto two rows
const fixedCell = ({ Box, Text }: Els, k: string, text: string, style: TextProps) => (
  <Box key={k} flexShrink={0}>
    <Text {...style}>{text}</Text>
  </Box>
)

// Code cell: shrinks and wraps the code when the line does not fit the terminal
const codeCell = (
  { Box, Code }: Els,
  k: string,
  source: string,
  lang: { path?: string },
  box: { width?: number } = {},
) => (
  <Box key={k} flexShrink={1} {...box}>
    <Code source={source} {...lang} />
  </Box>
)

const drawRow = (els: Els, r: Row, lang: { path?: string }, k: string) => {
  if (!CODE_KINDS.has(r.kind)) {
    return (
      <els.Text key={k} {...LINE_STYLE[r.kind]}>
        {r.gutter ? `${r.gutter} ${r.body}` : r.body}
      </els.Text>
    )
  }
  const cells = [
    fixedCell(els, `${k}.n`, `${r.gutter} `, DIM),
    fixedCell(els, `${k}.m`, `${r.marker} `, MARKER_STYLE[r.kind]),
  ]
  if (r.body) cells.push(codeCell(els, `${k}.c`, r.body, lang))
  return (
    <els.Box key={k} flexDirection="row">
      {cells}
    </els.Box>
  )
}

// Symbol note `∈ name@L25`: the name in green, the line in blue, the rest dim
const noteCell = ({ Box, Text }: Els, k: string, note: { name: string; line: string }) => (
  <Box key={k} flexDirection="row" flexShrink={0}>
    <Text dimColor> ∈ </Text>
    <Text color="success">{note.name}</Text>
    <Text dimColor>@</Text>
    <Text color="ide">{note.line}</Text>
  </Box>
)

// Code fills its whole cell: a width equal to the line keeps the symbol note right after the code
const drawHit = (els: Els, hit: Hit, k: string) => {
  const cells = [fixedCell(els, `${k}.l`, `${hit.loc} `, DIM)]
  if (hit.body) cells.push(codeCell(els, `${k}.c`, hit.body, { path: hit.path }, { width: columns(hit.body) }))
  if (hit.note) cells.push(noteCell(els, `${k}.s`, hit.note))
  return (
    <els.Box key={k} flexDirection="row">
      {cells}
    </els.Box>
  )
}

const drawPart = (els: Els, part: Part, k: string) => {
  switch (part.kind) {
    case 'text':
      return (
        <els.Text key={k} dimColor>
          {part.text}
        </els.Text>
      )
    case 'code':
      return <els.Code key={k} source={part.source} startLine={part.startLine} {...langOf(part.path)} />
    case 'diff': {
      const lang = langOf(part.path)
      return (
        <els.Box key={k} flexDirection="column">
          {part.rows.map((r, j) => drawRow(els, r, lang, `${k}.${j}`))}
        </els.Box>
      )
    }
    case 'hits':
      return (
        <els.Box key={k} flexDirection="column">
          {part.rows.map((hit, j) => drawHit(els, hit, `${k}.${j}`))}
        </els.Box>
      )
  }
}

export const drawParts = (els: Els, parts: Part[]) => parts.map((part, i) => drawPart(els, part, `p${i}`))
