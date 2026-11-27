import type { Provider } from '../../shared/data-contracts'
import type { ProviderAdapter } from '../../shared/provider-contracts'
import { ChatCompletionsAdapter } from './chat-completions'
import { ResponsesAdapter } from './responses'
import { AnthropicMessagesAdapter } from './anthropic-messages'
import { ProviderError } from './errors'
export function createAdapter(
  config: Pick<Provider, 'protocol' | 'baseUrl' | 'compatibility'>,
  key: string,
  fetcher: typeof fetch = fetch,
): ProviderAdapter {
  switch (config.protocol) {
    case 'chat-completions':
      return new ChatCompletionsAdapter(config.baseUrl, key, config.compatibility, fetcher)
    case 'responses':
      return new ResponsesAdapter(config.baseUrl, key, config.compatibility, fetcher)
    case 'anthropic-messages':
      return new AnthropicMessagesAdapter(config.baseUrl, key, config.compatibility, fetcher)
    default:
      throw new ProviderError('UNSUPPORTED')
  }
}
