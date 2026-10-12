export type RowKind = 'file' | 'hunk' | 'add' | 'del' | 'ctx' | 'meta'
// gutter is the line number (or padding), marker is '+', '-' or ' ' on code rows, body is the rest
export type Row = { kind: RowKind; gutter: string; marker: string; body: string }
// Search hit: loc is `path:line`, body is the line text, note is the enclosing symbol (`∈name@L25`)
export type Hit = { loc: string; path: string; body: string; note: string }

// A piece of the response, ready to draw
export type Part =
  | { kind: 'text'; text: string }
  | { kind: 'diff'; path: string | undefined; rows: Row[] }
  | { kind: 'code'; path: string | undefined; source: string; startLine: number }
  | { kind: 'hits'; rows: Hit[] }

// The engine draws summary in the call row, the mod draws rest below it
export type View = { summary: string; rest: Part[] }

// Text of an MCP tool result: a string, content blocks or the McpToolResult itself
export function textOf(output: unknown): string {
  if (typeof output === 'string') return output
  if (Array.isArray(output)) return output.map(textOf).filter(Boolean).join('\n')
  if (output !== null && typeof output === 'object') {
    const o = output as Record<string, unknown>
    if (typeof o.text === 'string') return o.text
    if (Array.isArray(o.content)) return textOf(o.content)
  }
  return ''
}

export const basename = (path: string) => path.slice(path.lastIndexOf('/') + 1)

// Width is counted per grapheme, as the terminal does: emoji (ZWJ sequences, flags, ⚠️ with VS16) and CJK
// take two columns, a grapheme of a combining or invisible mark (BOM, ZWSP) zero, everything else one
const GRAPHEMES = new Intl.Segmenter()
const ASCII = /^[\x20-\x7e]*$/
const WIDE =
  /^(?:\p{Emoji_Presentation}|\p{Extended_Pictographic}\uFE0F|[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6\u{20000}-\u{3fffd}])/u
const ZERO = /^[\p{M}\p{Cf}]/u

// Terminal column width of a string without tabs or control characters
export function columns(s: string): number {
  if (ASCII.test(s)) return s.length
  let n = 0
  for (const { segment } of GRAPHEMES.segment(s)) n += WIDE.test(segment) ? 2 : ZERO.test(segment) ? 0 : 1
  return n
}
