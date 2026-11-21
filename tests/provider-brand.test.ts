import { describe, expect, it } from 'vitest'
import { resolveProviderBrand } from '../src/renderer/src/lib/provider-brand'
import catalog from '../src/renderer/src/assets/provider-icons/catalog.json'
const identify = (baseUrl: string, name = '自定义', model = 'unknown') =>
  resolveProviderBrand({ baseUrl, name, model })
describe('provider brand identification (cosmetic only)', () => {
  it('resolves the screenshot provider and keeps domain identity ahead of a hosted model', () => {
    expect(
      identify('https://api.deepseek.com/v1', 'DeepSeek', 'deepseek-v4-1-flash-261017'),
    ).toMatchObject({ id: 'deepseek', matchedBy: 'host' })
    expect(
      identify('https://openrouter.ai/api/v1', 'DeepSeek', 'deepseek/deepseek-r1'),
    ).toMatchObject({ id: 'openrouter', matchedBy: 'host' })
    expect(
      identify('https://api.siliconflow.cn/v1', 'DeepSeek', 'deepseek-ai/DeepSeek-V3'),
    ).toMatchObject({ id: 'siliconcloud', matchedBy: 'host' })
  })
  it('matches subdomains, case, ports and a trailing DNS dot, never hostname substrings', () => {
    expect(identify('https://API.DEEPSEEK.COM.:8443/v1')?.id).toBe('deepseek')
    for (const host of [
      'deepseek.com.evil.invalid',
      'notdeepseek.com',
      'openrouter.ai.evil.invalid',
    ])
      expect(identify(`https://${host}/v1`)).toBeNull()
    expect(identify('https://custom.invalid/deepseek.com')).toBeNull()
    expect(identify('https://custom.invalid/?deepseek.com')).toBeNull()
    expect(identify('file://api.deepseek.com/v1')).toBeNull()
  })
  it('supports Chinese aliases and exact normalized catalog names, without substring guessing', () => {
    expect(identify('https://proxy.invalid', '硅基流动')?.id).toBe('siliconcloud')
    expect(identify('https://proxy.invalid', '通义千问')?.id).toBe('qwen')
    expect(identify('https://proxy.invalid', 'LM Studio')?.id).toBe('lmstudio')
    expect(identify('https://proxy.invalid', 'not-deepseek')).toBeNull()
    expect(identify('https://proxy.invalid', 'OpenAI-compatible Chat Completions')).toBeNull()
  })
  it('uses bounded model-family fallback for arbitrarily named proxies and handles invalid drafts', () => {
    for (const [model, id] of Object.entries({
      'deepseek-v4-1-flash-261017': 'deepseek',
      'anthropic/claude-sonnet-4': 'claude',
      'Qwen/Qwen3-32B': 'qwen',
      'glm-4.5': 'zhipu',
      'gpt-4.1': 'openai',
      'kimi-k2': 'kimi',
      'gemini-2.5-pro': 'gemini',
      'grok-4': 'xai',
    }))
      expect(identify('not a URL', '兔子', model)).toMatchObject({ id, matchedBy: 'model' })
    expect(identify('', '', 'notdeepseek')).toBeNull()
    expect(identify('http://localhost:11434', '自定义', 'unknown')).toBeNull()
    expect(identify('https://proxy.invalid', 'Ollama', 'deepseek-r1')).toMatchObject({
      id: 'ollama',
      matchedBy: 'name',
    })
  })
  it('every host/name/model rule produces a catalog asset and all catalog IDs are addressable', () => {
    for (const brand of catalog) expect(identify('', brand.id)?.id).toBe(brand.id)
    expect(new Set(catalog.map((brand) => brand.id)).size).toBe(357)
    for (const host of [
      'openai.azure.com',
      'bedrock-runtime.us-east-1.amazonaws.com',
      'generativelanguage.googleapis.com',
      'dashscope-intl.aliyuncs.com',
    ])
      expect(identify(`https://api.${host}`) || identify(`https://${host}`)).not.toBeNull()
  })
})
