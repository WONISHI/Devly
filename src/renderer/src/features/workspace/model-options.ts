import type { Provider, Settings } from '@shared/data-contracts'

export function modelOptions(
  providers: Provider[],
  settings: Pick<Settings, 'defaultProviderId' | 'defaultModel'>,
) {
  return providers.flatMap((provider) => {
    const models = new Set([provider.model.trim()])
    if (settings.defaultProviderId === provider.id) models.add(settings.defaultModel.trim())
    models.delete('')
    return [...(models.size ? models : [''])].map((model) => ({
      key: JSON.stringify([provider.id, model]),
      providerId: provider.id,
      providerName: provider.name,
      host: new URL(provider.baseUrl).host,
      model,
      disabled: !model,
      hint: !model ? '请先填写模型 ID' : provider.hasCredential ? '' : '未设置密钥',
    }))
  })
}
