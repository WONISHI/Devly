import { expect, it } from 'vitest'
import { parseTap, commandRecord, stackTrace } from '../src/main/agent/validation'
it('does not claim tests ran based on an exit code or an unstructured success sentence', () => {
  expect(parseTap('all tests passed', 0, 'completed').state).toBe('unreported')
})
it('accepts only complete, sequential TAP results and distinguishes failures and exit/report conflicts', () => {
  const tap = 'TAP version 13\n1..3\nok 1 - adds\nnot ok 2 - fails\nok 3 - ignored # SKIP\n'
  expect(parseTap(tap, 1, 'failed')).toMatchObject({
    state: 'complete',
    total: 3,
    passed: 1,
    failed: 1,
    skipped: 1,
  })
  expect(parseTap(tap, 0, 'completed').state).toBe('conflict')
  expect(parseTap(tap, 1, 'cancelled').state).toBe('incomplete')
  expect(parseTap('TAP version 13\n1..2\nok 1 - only first\n', 0, 'completed').state).toBe(
    'incomplete',
  )
  expect(parseTap('TAP version 13\n1..1\nok 2 - wrong number\n', 0, 'completed').state).toBe(
    'incomplete',
  )
})
it('normalizes actual Python traceback frames and preserves bounded process output separately', () => {
  const stderr =
    'Traceback (most recent call last):\n  File "/project/src/check.py", line 12, in test_add\n    self.assertEqual(2,3)\nAssertionError: 2 != 3\n'
  expect(stackTrace('', stderr)).toContain('at test_add (/project/src/check.py:12:1)')
  const record = commandRecord(
    { state: 'failed', exitCode: 1, signal: null, stdout: 'x'.repeat(5000), stderr },
    12.4,
  )
  expect(record.stdout).toHaveLength(4096)
  expect(record.previewTruncated).toBe(true)
  expect(record.exitCode).toBe(1)
  expect(record.durationMs).toBe(12)
})
