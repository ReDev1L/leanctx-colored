// Body of the added DIFF line; ``` inside a line must not close the block
export const ADDED_BODY = '# TEST ```diff inside a line'
export const DIFF = [
  '--- exceptions.py',
  '+++ exceptions.py',
  '@@ -1,3 +1,4 @@',
  ' """',
  `+${ADDED_BODY}`,
  ' ',
  ' from typing import Any',
].join('\n')
// ctx_patch response: summary, hashes, diff block and brace check
export const SUMMARY = '✓ exceptions.py: 1 replacement, +1 lines (16→28 tok)'
export const OUTPUT = [
  SUMMARY,
  'preimage: bytes=11843',
  '',
  'evidence (diff, redacted, bounded):',
  '```diff',
  DIFF,
  '```',
  'brace-balance: ok (matched)',
].join('\n')

// ctx_read response in the lines mode and a ctx_search response
export const READ_LINES = ['box.py 120L lines:10-12', '  10| def f(x):', '  11|     return x', '  12| '].join('\n')
export const SEARCH = ['2 matches in 2 files', 'a.py:2 import os', 'b.ts:5   const y = 1'].join('\n')

// An MCP tool response as the ToolUse row receives it
export const asMcp = (text: string) => [{ type: 'text', text }]
