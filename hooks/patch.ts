import type { Row, RowKind, View } from './model'

// Diff lines start with ' ', '+', '-', '@' or '\', so ``` at the start of a line can only be a fence
const DIFF_BLOCK = /^```diff[ \t]*\n([\s\S]*?)^```[ \t]*$/gm
const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/
const FILE_HEADER = /^(?:\+\+\+|---) (\S+)/
// Code rows carry a +/-/space marker and a highlighted body; the rest are headers
export const CODE_KINDS = new Set<RowKind>(['add', 'del', 'ctx'])

export type Segment = { kind: 'text'; text: string } | { kind: 'diff'; source: string }

// Splits the response into text and diff blocks, in order; null when there is no diff block
export function splitPatchOutput(text: string): Segment[] | null {
  const segments: Segment[] = []
  let at = 0
  for (const m of text.matchAll(DIFF_BLOCK)) {
    const before = text.slice(at, m.index).trim()
    if (before) segments.push({ kind: 'text', text: before })
    segments.push({ kind: 'diff', source: (m[1] ?? '').replace(/\n$/, '') })
    at = m.index + m[0].length
  }
  if (at === 0) return null
  const after = text.slice(at).trim()
  if (after) segments.push({ kind: 'text', text: after })
  return segments
}

// Separates the summary line (`✓ file: 1 replacement …`) from the rest of the response;
// anchored edits put a `[path]` line before it, which goes to the rest
export function splitSummary(segments: Segment[]): { summary: string; rest: Segment[] } {
  const [first, ...others] = segments
  if (first?.kind !== 'text') return { summary: '', rest: segments }
  const lines = first.text.split('\n')
  const found = lines.findIndex(l => l.startsWith('✓'))
  const at = found === -1 ? 0 : found
  const remaining = lines.toSpliced(at, 1).join('\n').trim()
  return {
    summary: lines[at] ?? '',
    rest: remaining ? [{ kind: 'text', text: remaining }, ...others] : others,
  }
}

// Diff rows with a line-number column: a removed line shows its number in the old file,
// an added or context line in the new one. Everything before the first `@@` is the file header,
// which gives the path for syntax highlighting (`+++` wins over `---`)
export function diffRows(source: string): { path: string | undefined; rows: Row[] } {
  const parsed: { kind: RowKind; num?: string; line: string }[] = []
  let path: string | undefined
  let inHunk = false
  let oldNo = 0
  let newNo = 0
  let width = 0
  for (const line of source.split('\n')) {
    const hunk = HUNK.exec(line)
    let num: string | undefined
    if (hunk) {
      inHunk = true
      oldNo = Number(hunk[1])
      newNo = Number(hunk[2])
      parsed.push({ kind: 'hunk', line })
    } else if (!inHunk) {
      path = FILE_HEADER.exec(line)?.[1] ?? path
      parsed.push({ kind: 'file', line })
    } else if (line.startsWith('-')) {
      num = String(oldNo++)
      parsed.push({ kind: 'del', num, line })
    } else if (line.startsWith('+')) {
      num = String(newNo++)
      parsed.push({ kind: 'add', num, line })
    } else if (line.startsWith('\\')) {
      parsed.push({ kind: 'meta', line })
    } else {
      num = String(newNo)
      parsed.push({ kind: 'ctx', num, line })
      oldNo++
      newNo++
    }
    if (num !== undefined && num.length > width) width = num.length
  }
  const blank = ' '.repeat(width)
  const rows = parsed.map(({ kind, num, line }): Row => {
    const gutter = num === undefined ? blank : num.padStart(width)
    return CODE_KINDS.has(kind)
      ? { kind, gutter, marker: line.slice(0, 1) || ' ', body: line.slice(1) }
      : { kind, gutter, marker: '', body: line }
  })
  return { path, rows }
}

// ctx_patch response: the `✓ …` summary apart, the diff split into rows; null when there is no diff
export function patchView(text: string): View | null {
  const segments = splitPatchOutput(text)
  if (!segments) return null
  const { summary, rest } = splitSummary(segments)
  return {
    summary: summary || '✓',
    rest: rest.map(s => (s.kind === 'diff' ? { kind: 'diff', ...diffRows(s.source) } : s)),
  }
}
