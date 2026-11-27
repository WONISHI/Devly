import type { CommandRecord, ValidationRecord } from '../../shared/execution-records'
export function parseTap(text: string, exitCode: number | null, state: string): ValidationRecord {
  const empty: ValidationRecord = {
    state: 'unreported',
    framework: null,
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    tests: [],
    truncated: false,
  }
  // Only an actual structured TAP report is a test report. Exit code zero alone is not one.
  // Strip only ANSI SGR before reading structured report lines.
  // eslint-disable-next-line no-control-regex
  const clean = text.replace(/\r/g, '').replace(/\u001b\[[0-9;]*m/g, '')
  if (!/^TAP version 13\s*$/m.test(clean)) return empty
  const plans = [...clean.matchAll(/^1\.\.(\d+)(?:\s+#.*)?$/gm)],
    matches = [...clean.matchAll(/^(not )?ok\s+(\d+)(?:\s+-?\s*(.*))?$/gm)]
  const tests = matches.map((match) => ({
    name: (match[3] || `Test ${match[2]}`).slice(0, 300),
    status: /#\s*(?:SKIP|TODO)\b/i.test(match[3] ?? '')
      ? ('skipped' as const)
      : match[1]
        ? ('failed' as const)
        : ('passed' as const),
  }))
  const total = plans.length === 1 ? Number(plans[0][1]) : tests.length,
    passed = tests.filter((t) => t.status === 'passed').length,
    failed = tests.filter((t) => t.status === 'failed').length,
    skipped = tests.length - passed - failed
  const valid =
    plans.length === 1 &&
    total === tests.length &&
    matches.every((match, index) => Number(match[2]) === index + 1) &&
    Number.isSafeInteger(total) &&
    total <= 1000000 &&
    !/^Bail out!/m.test(clean)
  let status: ValidationRecord['state'] = 'incomplete'
  if (valid && exitCode !== null && ['completed', 'failed'].includes(state))
    status = failed > 0 === (exitCode !== 0) ? 'complete' : 'conflict'
  return {
    state: status,
    framework: 'tap',
    total: Number.isSafeInteger(total) && total <= 1000000 ? total : tests.length,
    passed,
    failed,
    skipped,
    tests: tests.slice(0, 100),
    truncated: tests.length > 100,
  }
}
export function stackTrace(stdout: string, stderr: string): string {
  const text = stderr + '\n' + stdout
  if (/^\s*at .+:\d+:\d+\)?\s*$/m.test(text)) return text.slice(-4096)
  // Normalize actual Python traceback frames for the original StackTrace display; raw output remains available.
  const frames = [...text.matchAll(/^\s*File "([^"\n]+)", line (\d+)(?:, in ([^\n]+))?/gm)]
  if (!frames.length) return ''
  const error =
    [...text.matchAll(/^(?:[A-Za-z]+Error|Error):[^\n]*$/gm)].at(-1)?.[0] ??
    'Error: execution traceback'
  return (
    error +
    '\n' +
    frames.map((frame) => `    at ${frame[3] || '<module>'} (${frame[1]}:${frame[2]}:1)`).join('\n')
  ).slice(0, 4096)
}
export function commandRecord(
  result: {
    state: CommandRecord['state']
    exitCode: number | null
    signal: string | null
    stdout: string
    stderr: string
  },
  durationMs: number,
): CommandRecord {
  return {
    ...result,
    durationMs: Math.max(0, Math.round(durationMs)),
    stdout: result.stdout.slice(0, 4096),
    stderr: result.stderr.slice(0, 4096),
    previewTruncated: result.stdout.length > 4096 || result.stderr.length > 4096,
    trace: stackTrace(result.stdout, result.stderr),
    validation: parseTap(result.stdout, result.exitCode, result.state),
  }
}
