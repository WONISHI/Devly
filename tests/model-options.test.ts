import { expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { defaultCompatibility } from '../src/shared/provider-contracts'
import { defaultSettings, type Provider } from '../src/shared/data-contracts'
import { modelOptions } from '../src/renderer/src/features/workspace/model-options'

const provider = (overrides: Partial<Provider> = {}): Provider => ({
  id: randomUUID(),
  name: '供应商',
  protocol: 'chat-completions',
  baseUrl: 'https://example.invalid/v1',
  model: 'shared-model',
  hasCredential: false,
  revision: 1,
  compatibility: defaultCompatibility,
  report: null,
  ...overrides,
})
it('keeps equal model IDs from different providers independently selectable', () => {
  const options = modelOptions([provider(), provider()], defaultSettings)
  expect(new Set(options.map((option) => option.key)).size).toBe(2)
  expect(options.every((option) => !option.disabled)).toBe(true)
})
it('retains the explicitly selected model when the provider default is edited', () => {
  const a = provider({ model: 'new-model' }),
    b = provider({ model: 'other-model' })
  const options = modelOptions([a, b], { defaultProviderId: a.id, defaultModel: 'old-model' })
  expect(
    options.filter((option) => option.providerId === a.id).map((option) => option.model),
  ).toEqual(['new-model', 'old-model'])
  expect(
    options.filter((option) => option.providerId === b.id).map((option) => option.model),
  ).toEqual(['other-model'])
})
it('deduplicates a saved selection and refuses empty or unimplemented protocol options', () => {
  const a = provider(),
    empty = provider({ model: '' }),
    unsupported = provider({ protocol: 'responses' })
  const options = modelOptions([a, empty, unsupported], {
    defaultProviderId: a.id,
    defaultModel: a.model,
  })
  expect(options).toHaveLength(3)
  expect(options.filter((option) => option.disabled).map((option) => option.hint)).toEqual([
    '请先填写模型 ID',
    '协议暂未接入',
  ])
})
it('does not silently select a replacement provider after removal', () => {
  const a = provider(),
    b = provider()
  const options = modelOptions([b], { defaultProviderId: a.id, defaultModel: a.model })
  expect(options.some((option) => option.providerId === a.id)).toBe(false)
})
