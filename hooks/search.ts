import type { Hit, Part, View } from './model'

// A hit: `src/app/models.py:42 line text`
const HIT = /^([^\s:]+):(\d+) (.*)$/
// lean-ctx note at the end of a hit: the symbol the match is inside, not code
const SYMBOL_NOTE = / (∈\S+@L\d+)$/

// ctx_search response: consecutive hits form a block highlighted by file extension,
// other lines (counters, hints) are plain text. null when there are no hits
export function searchView(text: string): View | null {
  const [summary = '', ...lines] = text.replace(/\n+$/, '').split('\n')
  const rest: Part[] = []
  let hits: Hit[] = []
  let notes: string[] = []
  let found = false
  const flushHits = () => {
    if (hits.length > 0) rest.push({ kind: 'hits', rows: hits })
    hits = []
  }
  const flushNotes = () => {
    const note = notes.join('\n').trim()
    if (note) rest.push({ kind: 'text', text: note })
    notes = []
  }
  for (const line of lines) {
    const m = HIT.exec(line)
    if (m) {
      flushNotes()
      const path = m[1] ?? ''
      const line = m[3] ?? ''
      const note = SYMBOL_NOTE.exec(line)
      // Tabs expanded and trailing whitespace trimmed: drawing measures the code width from the body
      const body = (note ? line.slice(0, note.index) : line).replace(/\t/g, '    ').trimEnd()
      hits.push({ loc: `${path}:${m[2] ?? ''}`, path, body, note: note?.[1] ?? '' })
      found = true
    } else {
      flushHits()
      notes.push(line)
    }
  }
  flushHits()
  flushNotes()
  return found ? { summary, rest } : null
}
