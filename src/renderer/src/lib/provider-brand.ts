import catalog from '../assets/provider-icons/catalog.json'

export type BrandMetadata = { name: string; baseUrl: string; model: string }
export type BrandMatch = {
  id: string
  label: string
  color: boolean
  matchedBy: 'host' | 'name' | 'model'
}
const normalize = (value: string) =>
  value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '')
const brands = new Map(catalog.map((brand) => [brand.id, brand]))
const names = new Map<string, string>()
for (const brand of catalog) {
  names.set(normalize(brand.id), brand.id)
  if (!names.has(normalize(brand.label))) names.set(normalize(brand.label), brand.id)
}
const aliases: Record<string, string[]> = {
  deepseek: ['深度求索', 'DeepSeek API'],
  openai: ['ChatGPT', 'OpenAI API'],
  anthropic: ['Anthropic API'],
  claude: ['克劳德'],
  gemini: ['Google Gemini'],
  qwen: ['通义千问', '千问', '阿里通义', 'DashScope'],
  bailian: ['阿里云百炼', '百炼'],
  moonshot: ['月之暗面', 'Moonshot AI'],
  kimi: ['Kimi AI'],
  zhipu: ['智谱', '智谱AI', '智谱清言', 'GLM', 'BigModel'],
  zai: ['Z AI'],
  baidu: ['百度'],
  wenxin: ['文心一言', '文心'],
  baiducloud: ['百度千帆', '千帆'],
  doubao: ['豆包'],
  volcengine: ['火山引擎', '火山方舟', 'Volces'],
  hunyuan: ['混元', '腾讯混元'],
  tencentcloud: ['腾讯云'],
  minimax: ['MiniMax AI'],
  hailuo: ['海螺AI'],
  siliconcloud: ['SiliconFlow', '硅基流动'],
  stepfun: ['阶跃星辰'],
  yi: ['零一万物'],
  baichuan: ['百川', '百川智能'],
  spark: ['讯飞星火', '星火'],
  sensenova: ['商汤', '商汤日日新'],
  azure: ['Azure OpenAI', 'Microsoft Azure'],
  bedrock: ['Amazon Bedrock', 'AWS Bedrock'],
  ollama: ['Ollama 本地'],
  lmstudio: ['LM Studio 本地'],
  xai: ['xAI'],
}
for (const [id, values] of Object.entries(aliases))
  for (const name of values) names.set(normalize(name), id)

// Endpoint identity wins over a hosted model's family. Only exact domains/subdomains match.
const hosts: Record<string, string[]> = {
  deepseek: ['deepseek.com'],
  openai: ['openai.com'],
  anthropic: ['anthropic.com'],
  gemini: ['generativelanguage.googleapis.com'],
  vertexai: ['aiplatform.googleapis.com'],
  qwen: ['dashscope.aliyuncs.com', 'dashscope-intl.aliyuncs.com', 'dashscope-us.aliyuncs.com'],
  moonshot: ['moonshot.cn', 'moonshot.ai'],
  kimi: ['kimi.com'],
  zhipu: ['bigmodel.cn'],
  zai: ['z.ai'],
  baiducloud: ['qianfan.baidubce.com', 'aip.baidubce.com'],
  volcengine: ['volces.com', 'volcengineapi.com'],
  hunyuan: ['hunyuan.cloud.tencent.com'],
  minimax: ['minimax.io', 'minimax.chat', 'minimaxi.com'],
  siliconcloud: ['siliconflow.cn', 'siliconflow.com'],
  stepfun: ['stepfun.com', 'stepfun.ai'],
  yi: ['lingyiwanwu.com'],
  baichuan: ['baichuan-ai.com'],
  spark: ['spark-api-open.xf-yun.com'],
  openrouter: ['openrouter.ai'],
  groq: ['groq.com'],
  together: ['together.ai', 'together.xyz'],
  mistral: ['mistral.ai'],
  cohere: ['cohere.com', 'cohere.ai'],
  perplexity: ['perplexity.ai'],
  xai: ['x.ai'],
  deepinfra: ['deepinfra.com'],
  fireworks: ['fireworks.ai'],
  cerebras: ['cerebras.ai'],
  sambanova: ['sambanova.ai'],
  huggingface: ['huggingface.co'],
  replicate: ['replicate.com'],
  novita: ['novita.ai'],
  nebius: ['studio.nebius.com'],
  chutes: ['chutes.ai'],
  nvidia: ['integrate.api.nvidia.com'],
  azure: ['openai.azure.com', 'services.ai.azure.com', 'models.ai.azure.com'],
  ollama: ['ollama.com'],
  aihubmix: ['aihubmix.com'],
  ai302: ['302.ai'],
  modelscope: ['api-inference.modelscope.cn'],
  vercel: ['ai-gateway.vercel.sh'],
}
const domainRules = Object.entries(hosts)
  .flatMap(([id, domains]) => domains.map((domain) => ({ id, domain })))
  .sort((a, b) => b.domain.length - a.domain.length)
const modelRules: [RegExp, string][] = [
  [/^deepseek(?:[-.:]|$)/i, 'deepseek'],
  [/^(?:gpt[-.]|chatgpt[-.]|o[134](?:[-.]|$)|codex(?:[-.]|$))/i, 'openai'],
  [/^claude(?:[-.]|$)/i, 'claude'],
  [/^gemini(?:[-.]|$)/i, 'gemini'],
  [/^gemma(?:[-.\d]|$)/i, 'gemma'],
  [/^qwen(?:[-.\d]|$)|^qwq(?:[-.]|$)/i, 'qwen'],
  [/^(?:glm|chatglm)(?:[-.\d]|$)/i, 'zhipu'],
  [/^kimi(?:[-.]|$)/i, 'kimi'],
  [/^moonshot(?:[-.]|$)/i, 'moonshot'],
  [/^doubao(?:[-.]|$)/i, 'doubao'],
  [/^hunyuan(?:[-.]|$)/i, 'hunyuan'],
  [/^(?:minimax|abab)(?:[-.\d]|$)/i, 'minimax'],
  [/^ernie(?:[-.]|$)/i, 'wenxin'],
  [/^(?:llama|meta-llama)(?:[-.\d]|$)/i, 'meta'],
  [/^(?:mistral|mixtral|codestral|devstral|magistral)(?:[-.]|$)/i, 'mistral'],
  [/^grok(?:[-.]|$)/i, 'xai'],
  [/^(?:command|c4ai-aya)(?:[-.]|$)/i, 'cohere'],
  [/^step(?:[-.\d]|$)/i, 'stepfun'],
  [/^yi(?:[-.]|$)/i, 'yi'],
  [/^jamba(?:[-.]|$)/i, 'ai21'],
  [/^baichuan(?:[-.\d]|$)/i, 'baichuan'],
]

export function resolveProviderBrand(metadata: BrandMetadata): BrandMatch | null {
  const match = (id: string, matchedBy: BrandMatch['matchedBy']): BrandMatch | null => {
    const brand = brands.get(id)
    return brand ? { ...brand, matchedBy } : null
  }
  try {
    const url = new URL(metadata.baseUrl)
    if (url.protocol === 'https:' || url.protocol === 'http:') {
      const host = url.hostname.toLowerCase().replace(/\.$/, '')
      const rule = domainRules.find(({ domain }) => host === domain || host.endsWith(`.${domain}`))
      if (rule) return match(rule.id, 'host')
      if (/^bedrock(?:-runtime)?\.[a-z0-9-]+\.amazonaws\.com(?:\.cn)?$/.test(host))
        return match('bedrock', 'host')
    }
  } catch {
    /* An incomplete editor draft must not break rendering. */
  }
  const name = names.get(normalize(metadata.name))
  if (name) return match(name, 'name')
  const model = metadata.model.trim().split('/').at(-1) || ''
  const rule = modelRules.find(([pattern]) => pattern.test(model))
  return rule ? match(rule[1], 'model') : null
}
