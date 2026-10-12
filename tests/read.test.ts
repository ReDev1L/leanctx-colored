import { describe, expect, test } from 'claude-code/testing'

import { readView } from '../hooks/read'
import { READ_LINES } from './fixtures'

const ANCHOR_HEADER = '[anchored: N:hh|line → edit via ctx_patch]'

describe('readView: numbered modes', () => {
  test('lines: header is the summary, rows are code with start line and indents, service lines are text', () => {
    const text = `${READ_LINES}\n[lean-ctx gateway: 1 secret(s) redacted]`
    expect(readView(text, { path: '/src/box.py', mode: 'lines:10-12' })).toEqual({
      summary: 'box.py 120L lines:10-12',
      rest: [
        { kind: 'code', path: '/src/box.py', source: 'def f(x):\n    return x\n', startLine: 10 },
        { kind: 'text', text: '[lean-ctx gateway: 1 secret(s) redacted]' },
      ],
    })
  })

  test('anchored: the hash is dropped; without call input the path comes from the header', () => {
    const text = `register.tsx 204L lines:22-23 ${ANCHOR_HEADER}\n22:40d0|from logger import logger\n23:af13|`
    expect(readView(text, undefined)?.rest).toEqual([
      { kind: 'code', path: 'register.tsx', source: 'from logger import logger\n', startLine: 22 },
    ])
  })

  test('a numbering gap (lines:1-2,10-10) gives separate code blocks', () => {
    const text = 'a.py 50L lines:1-2,10-10\n   1| x = 1\n   2| y = 2\n  10| z = 3'
    expect(readView(text, { path: 'a.py' })?.rest.map(p => (p.kind === 'code' ? p.startLine : p.kind))).toEqual([1, 10])
  })

  test('signatures and other modes without numbered rows give null', () => {
    expect(readView('wg.py 503L\n deps a,b\nclass pub X @L31-32', { path: 'wg.py', mode: 'signatures' })).toBeNull()
  })
})

describe('readView: bare code', () => {
  test('full: the whole response is code from line 1, lean-ctx truncation is text', () => {
    const footer = '[… truncated at ~4048 of 5026 tokens — use ctx_read with lines= parameter to see specific sections]'
    expect(readView(`"""doc"""\n\nimport os\n${footer}`, { path: '/src/utils.py', mode: 'full' })).toEqual({
      summary: 'utils.py 3L',
      rest: [
        { kind: 'code', path: '/src/utils.py', source: '"""doc"""\n\nimport os', startLine: 1 },
        { kind: 'text', text: footer },
      ],
    })
  })

  test('a read error in full and headerless text in other modes give null', () => {
    expect(readView('Cannot read file: /x.md: No such file', { path: '/x.md', mode: 'full' })).toBeNull()
    expect(readView('import os\nimport sys', { path: 'a.py', mode: 'aggressive' })).toBeNull()
    expect(readView('import os\nimport sys', { path: 'a.py' })).toBeNull()
  })
})

describe('readView: several files', () => {
  test('anchored: summary is `Read N files`, each file has a header and code', () => {
    const text = [
      `a.ts 2L ${ANCHOR_HEADER}`,
      '1:aaaa|const a = 1',
      '2:bbbb|export { a }',
      '---',
      `b.ts 1L ${ANCHOR_HEADER}`,
      "1:cccc|import { a } from './a'",
      '---',
      'Read 2 files',
    ].join('\n')
    expect(readView(text, { paths: ['/p/a.ts', '/p/b.ts'], mode: 'anchored' })).toEqual({
      summary: 'Read 2 files',
      rest: [
        { kind: 'text', text: `a.ts 2L ${ANCHOR_HEADER}` },
        { kind: 'code', path: '/p/a.ts', source: 'const a = 1\nexport { a }', startLine: 1 },
        { kind: 'text', text: `b.ts 1L ${ANCHOR_HEADER}` },
        { kind: 'code', path: '/p/b.ts', source: "import { a } from './a'", startLine: 1 },
      ],
    })
  })

  test('full: the file header is built from the name; `---` inside code cancels parsing', () => {
    const ok = 'import os\nx = 1\n---\nimport sys\ny = 2\n---\nRead 2 files'
    expect(readView(ok, { paths: ['/p/a.py', '/p/b.py'], mode: 'full' })?.rest.filter(p => p.kind === 'text')).toEqual([
      { kind: 'text', text: 'a.py 2L' },
      { kind: 'text', text: 'b.py 2L' },
    ])
    const hr = 'title\n---\nbody\n---\nimport sys\ny = 2\n---\nRead 2 files'
    expect(readView(hr, { paths: ['/p/a.md', '/p/b.py'], mode: 'full' })).toBeNull()
  })

  test('truncated response: no tail, the last file is incomplete, the summary is the truncation line', () => {
    const cut = '[… truncated at ~4066 of 4250 tokens — use ctx_read with lines= parameter to see specific sections]'
    const text = `import os\nx = 1\n→ kernel context unchanged (ref:3d0ff3fa), already in context\n---\nimport sys\ny = 2\n${cut}`
    const view = readView(text, { paths: ['/p/a.py', '/p/b.py', '/p/c.py'], mode: 'full' })
    expect(view?.summary).toBe(cut)
    expect(view?.rest.map(p => (p.kind === 'code' ? p.source : p.kind === 'text' ? p.text : p.kind))).toEqual([
      'a.py 2L',
      'import os\nx = 1',
      '→ kernel context unchanged (ref:3d0ff3fa), already in context',
      'b.py 2L',
      'import sys\ny = 2',
    ])
  })
})
