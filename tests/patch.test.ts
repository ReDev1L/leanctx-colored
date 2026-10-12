import { describe, expect, test } from 'claude-code/testing'

import { textOf } from '../hooks/model'
import { diffRows, patchView, splitPatchOutput, splitSummary } from '../hooks/patch'
import { ADDED_BODY, DIFF, OUTPUT, SUMMARY } from './fixtures'

describe('splitPatchOutput', () => {
  test('keeps an empty context line at the end of the diff', () => {
    const source = '@@ -1,2 +1,2 @@\n-a\n+b\n '
    expect(splitPatchOutput('```diff\n' + source + '\n```')).toEqual([{ kind: 'diff', source }])
  })

  test('several diff blocks (ops[] across several files)', () => {
    const two = '```diff\n+++ a.py\n@@ -1 +1 @@\n-x\n+y\n```\n```diff\n+++ b.py\n@@ -1 +1 @@\n-x\n+y\n```'
    expect(splitPatchOutput(two)).toEqual([
      { kind: 'diff', source: '+++ a.py\n@@ -1 +1 @@\n-x\n+y' },
      { kind: 'diff', source: '+++ b.py\n@@ -1 +1 @@\n-x\n+y' },
    ])
  })
})

describe('splitSummary', () => {
  test('the [path] line before the summary of anchored edits goes to the rest', () => {
    const diff = { kind: 'diff' as const, source: '@@ -1 +1 @@\n-a\n+b' }
    expect(splitSummary([{ kind: 'text', text: '[/a/b.py]\n✓ b.py: 1 anchored edit\npreimage: x' }, diff])).toEqual({
      summary: '✓ b.py: 1 anchored edit',
      rest: [{ kind: 'text', text: '[/a/b.py]\npreimage: x' }, diff],
    })
  })
})

describe('diffRows', () => {
  test('file header, hunk, context and addition; path from the header', () => {
    expect(diffRows(DIFF)).toEqual({
      path: 'exceptions.py',
      rows: [
        { kind: 'file', gutter: ' ', marker: '', body: '--- exceptions.py' },
        { kind: 'file', gutter: ' ', marker: '', body: '+++ exceptions.py' },
        { kind: 'hunk', gutter: ' ', marker: '', body: '@@ -1,3 +1,4 @@' },
        { kind: 'ctx', gutter: '1', marker: ' ', body: '"""' },
        { kind: 'add', gutter: '2', marker: '+', body: ADDED_BODY },
        { kind: 'ctx', gutter: '3', marker: ' ', body: '' },
        { kind: 'ctx', gutter: '4', marker: ' ', body: 'from typing import Any' },
      ],
    })
  })

  test('a removed line takes the old file number, the column fits the longest number', () => {
    const { path, rows } = diffRows('@@ -9,3 +9,2 @@\n-a\n-b\n+c\n d\n\\ No newline at end of file')
    expect(path).toBeUndefined()
    expect(rows.map(r => [r.kind, r.gutter, r.marker, r.body])).toEqual([
      ['hunk', '  ', '', '@@ -9,3 +9,2 @@'],
      ['del', ' 9', '-', 'a'],
      ['del', '10', '-', 'b'],
      ['add', ' 9', '+', 'c'],
      ['ctx', '10', ' ', 'd'],
      ['meta', '  ', '', '\\ No newline at end of file'],
    ])
  })

  test('--- and +++ inside a hunk are content, not a header or a path', () => {
    const { path, rows } = diffRows('+++ a.py\n@@ -1 +1 @@\n--- x\n+++ y')
    expect(path).toBe('a.py')
    expect(rows.map(r => r.kind)).toEqual(['file', 'hunk', 'del', 'add'])
  })

  test('an empty context line without a space gets a space marker and an empty body', () => {
    expect(diffRows('@@ -1,2 +1,2 @@\n\n-a\n+b').rows[1]).toEqual({ kind: 'ctx', gutter: '1', marker: ' ', body: '' })
  })
})

describe('patchView', () => {
  test('summary apart, diff split into rows (``` inside a line keeps the block), text in order', () => {
    expect(patchView(OUTPUT)).toEqual({
      summary: SUMMARY,
      rest: [
        { kind: 'text', text: 'preimage: bytes=11843\n\nevidence (diff, redacted, bounded):' },
        { kind: 'diff', ...diffRows(DIFF) },
        { kind: 'text', text: 'brace-balance: ok (matched)' },
      ],
    })
    expect(patchView('✓ created a.py')).toBeNull()
    expect(patchView('')).toBeNull()
  })
})

describe('textOf', () => {
  test('content blocks, McpToolResult and a string; non-text blocks are skipped', () => {
    expect(textOf([{ type: 'text', text: 'a' }, { type: 'image' }, { type: 'text', text: 'b' }])).toBe('a\nb')
    expect(textOf({ content: [{ type: 'text', text: 'c' }], isError: false })).toBe('c')
    expect(textOf('x')).toBe('x')
    expect(textOf(undefined)).toBe('')
  })
})
