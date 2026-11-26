import { applyProjectPatch } from './patch-core'
import type { PatchRequest } from './patch-executor'

// This entry is only launched by Main inside Seatbelt; stdin is not a public renderer API.
let input = ''
for await (const buffer of process.stdin) {
  input += buffer.toString('utf8')
  if (Buffer.byteLength(input) > 1_048_576) process.exit(2)
}
try {
  const request = JSON.parse(input) as { root: string; patch: PatchRequest }
  const result = await applyProjectPatch(request.root, request.patch, new AbortController().signal)
  process.stdout.write(JSON.stringify(result))
} catch {
  process.stderr.write('PATCH_EXECUTION_FAILED')
  process.exitCode = 1
}
