import { describe, expect, test } from 'claude-code/testing'

import { columns } from '../hooks/model'
import { searchView } from '../hooks/search'
import { SEARCH } from './fixtures'

describe('searchView', () => {
  test('the first line is the summary, consecutive hits form one block keeping indents', () => {
    expect(searchView(SEARCH)).toEqual({
      summary: '2 matches in 2 files',
      rest: [
        {
          kind: 'hits',
          rows: [
            { loc: 'a.py:2', path: 'a.py', body: 'import os', note: '' },
            { loc: 'b.ts:5', path: 'b.ts', body: '  const y = 1', note: '' },
          ],
        },
      ],
    })
  })

  test('service lines between hits are text, order is kept', () => {
    const text = '[Firewalled ctx_search output]\n--- head ---\n3 matches\na.py:1 x\n[∈ hint]\nb.py:2 y'
    expect(searchView(text)?.rest.map(p => p.kind)).toEqual(['text', 'hits', 'text', 'hits'])
  })

  test('the ∈symbol@L… note goes to note, tabs are expanded, trailing whitespace is trimmed', () => {
    const text = '1 match\nmain.go:7 \treturn err  \t ∈run@L3'
    expect(searchView(text)?.rest).toEqual([
      { kind: 'hits', rows: [{ loc: 'main.go:7', path: 'main.go', body: '    return err', note: '∈run@L3' }] },
    ])
  })

  test('no hits give null', () => {
    expect(searchView('0 matches in 0 files (scanned 913)')).toBeNull()
  })
})

describe('columns', () => {
  test('per grapheme: emoji and CJK take two columns, combining and invisible marks zero', () => {
    const chars = (...codes: number[]) => String.fromCodePoint(...codes)
    const cases: [string, number][] = [
      ['def f():', 8],
      ['привет', 6],
      ['名前 = 1', 8],
      ['x # 🙂', 6],
      ['✅ ok', 5],
      [`${chars(0x1f468, 0x200d, 0x1f4bb)} dev`, 6],
      [`e${chars(0x301)}`, 1],
      [`${chars(0xfeff)}x`, 1],
    ]
    expect(cases.map(([s]) => columns(s))).toEqual(cases.map(([, n]) => n))
  })
})
