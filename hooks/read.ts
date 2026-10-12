import { basename } from './model'
import type { Part, View } from './model'

// File header of the numbered modes: `models.py 1740L lines:1-160 [anchored: …]`
const HEADER = /^(\S+) \d+L\b/
// A row of the lines mode: `  16| code`
const LINES_ROW = /^ *(\d+)\| ?(.*)$/
// A row of the anchored mode: `16:40d0|code`; the model needs the hash for edits, the screen does not
const ANCHOR_ROW = /^(\d+):[0-9a-f]{2,8}\|(.*)$/
// lean-ctx service lines at the end of a response: truncation, gateway, hints, kernel state
const FOOTER = /^(?:\[(?:…|lean-ctx|lines:)|→ kernel context)/
// Tail of a multi-file response: files are separated by `---`, followed by `Read N files`
const MULTI_TAIL = /\n---\n(Read \d+ files?\b[\s\S]*)$/
// Modes whose response is bare code without a header
const RAW_MODES = new Set(['full', 'raw'])

type ReadInput = { path?: unknown; paths?: unknown; mode?: unknown }
type FileView = { summary: string; parts: Part[] }

// ctx_read response: a file with a header and numbered rows (lines, anchored) or bare code
// (full, raw). null for modes without code (signatures, map, compressed), errors and unknown formats
export function readView(text: string, input: unknown): View | null {
  const { path, paths, mode } = (input ?? {}) as ReadInput
  const files = Array.isArray(paths)
    ? paths.filter((p): p is string => typeof p === 'string')
    : typeof path === 'string'
      ? [path]
      : []
  const isRaw = typeof mode === 'string' && RAW_MODES.has(mode)
  if (files.length > 1) return multiView(text, files, isRaw)
  const file = fileView(text, files[0], isRaw)
  return file && { summary: file.summary, rest: file.parts }
}

// Several files: chunks split on `---` are matched to paths in order. There must be exactly
// as many chunks: a `---` in bare code (markdown) or a file lean-ctx skipped would shift the
// match. The exception is a truncated response: no `Read N files` tail, the last file is
// incomplete and none follow, so there may be fewer chunks
function multiView(text: string, files: string[], isRaw: boolean): View | null {
  const tail = MULTI_TAIL.exec(text)
  let body: string
  let trailer: string
  if (tail) {
    body = text.slice(0, tail.index)
    trailer = tail[1] ?? ''
  } else {
    const lines = text.replace(/\n+$/, '').split('\n')
    let end = lines.length
    while (end > 0 && FOOTER.test(lines[end - 1] ?? '')) end--
    if (end === lines.length) return null
    body = lines.slice(0, end).join('\n')
    trailer = lines.slice(end).join('\n')
  }
  const chunks = body.split('\n---\n')
  if (tail ? chunks.length !== files.length : chunks.length > files.length) return null
  const rest: Part[] = []
  for (const [k, chunk] of chunks.entries()) {
    const file = fileView(chunk, files[k], isRaw)
    if (!file) return null
    rest.push({ kind: 'text', text: file.summary }, ...file.parts)
  }
  const [summary = '', ...more] = trailer.split('\n')
  const extra = more.join('\n').trim()
  if (extra) rest.push({ kind: 'text', text: extra })
  return { summary, rest }
}

function fileView(text: string, path: string | undefined, isRaw: boolean): FileView | null {
  const lines = text.replace(/\n+$/, '').split('\n')
  const header = HEADER.exec(lines[0] ?? '')
  if (header) return numberedView(lines, path ?? header[1])
  return isRaw ? rawView(lines, path) : null
}

// A header, then numbered rows; each contiguous run is its own code block
// (lines:1-5,20-30 leaves gaps). Rows after the numbered ones are service text
function numberedView(lines: string[], path: string | undefined): FileView | null {
  const [header = '', ...body] = lines
  const row = ANCHOR_ROW.test(body[0] ?? '') ? ANCHOR_ROW : LINES_ROW
  const parts: Part[] = []
  let run: string[] = []
  let start = 0
  let prev = 0
  let i = 0
  for (; i < body.length; i++) {
    const m = row.exec(body[i] ?? '')
    if (!m) break
    const num = Number(m[1])
    if (run.length > 0 && num !== prev + 1) {
      parts.push({ kind: 'code', path, source: run.join('\n'), startLine: start })
      run = []
    }
    if (run.length === 0) start = num
    run.push(m[2] ?? '')
    prev = num
  }
  if (run.length === 0 && parts.length === 0) return null
  if (run.length > 0) parts.push({ kind: 'code', path, source: run.join('\n'), startLine: start })
  const tail = body.slice(i).join('\n').trim()
  if (tail) parts.push({ kind: 'text', text: tail })
  return { summary: header, parts }
}

// Bare code; lean-ctx service lines at the end are split off. Fewer than two non-empty lines
// is more likely an error message (`Cannot read file: …`) than a file: the engine draws it
function rawView(lines: string[], path: string | undefined): FileView | null {
  let end = lines.length
  while (end > 0 && FOOTER.test(lines[end - 1] ?? '')) end--
  // Counting stops at the second non-empty line: a large file is not walked whole
  let filled = 0
  for (let i = 0; i < end && filled < 2; i++) if (lines[i]?.trim()) filled++
  if (filled < 2) return null
  const code = lines.slice(0, end)
  const parts: Part[] = [{ kind: 'code', path, source: code.join('\n'), startLine: 1 }]
  const tail = lines.slice(end).join('\n')
  if (tail) parts.push({ kind: 'text', text: tail })
  return { summary: `${path ? basename(path) : 'file'} ${code.length}L`, parts }
}
