import { describe, expect, it } from 'vitest'
import { projectPathSchema } from '../src/shared/contracts'
describe('project IPC contract', () => {
  it('rejects invalid paths before reaching filesystem services', () => {
    for (const value of ['', null, 42, '../'.repeat(5000)])
      expect(projectPathSchema.safeParse(value).success).toBe(false)
    expect(projectPathSchema.parse('/tmp/sample')).toBe('/tmp/sample')
  })
})
