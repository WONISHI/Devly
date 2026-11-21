# 供应商品牌图标

更新：2026-11-21；对应 P02 界面补充、LOG-035。设置页供应商名称左侧（截图 1 号位置）以及首页模型选择按钮/选项复用 ProviderBrandIcon。

## 收集范围与来源

固定使用 [Lobe Icons](https://github.com/lobehub/lobe-icons/tree/5c966bad55cda839d0db663e02a2df169003ff4e) 的 @lobehub/icons-static-svg **1.104.0**。从该 npm 包提取 **357 个品牌标识**，每个选彩色图标，缺彩色版时使用单色版，不引入文字横标和重复变体。集合包括供应商、模型品牌、AI 应用/基础设施，并不等同全世界所有 AI 公司；新增品牌随明确版本更新补充。

- 包含 DeepSeek、OpenAI、Anthropic/Claude、Google/Gemini、Qwen、Moonshot/Kimi、智谱/Z.ai、MiniMax、豆包/火山、混元、文心、阶跃、百川、OpenRouter、SiliconFlow、Groq、Mistral、Cohere 等。
- [完整目录](../src/renderer/src/assets/provider-icons/catalog.json)记录 ID、原标识名和是否彩色；[来源清单](../resources/vendor/provider-icons.json)记录 tarball SHA-512、固定提交及各 SVG SHA-256。
- [MIT 原文](../resources/vendor/lobe-icons.LICENSE)随打包应用分发至 licenses/lobe-icons.LICENSE。品牌权利属于相应持有人，集合的代码许可证不代表取得品牌背书。
- 本地静态资源不增加 npm 依赖，不安装 @lobehub/ui 或新的 React UI 框架。原版 AI Elements 文件不改动，未使用其远程 ModelSelectorLogo URL。

## 自动识别

顺序为 **Base URL 主机名 → 供应商名称 → 模型系列 → 通用图标**。这只是展示规则，不修改 Base URL、协议、Key、模型或能力检测结果。

| 输入 | 显示 | 原因 |
| --- | --- | --- |
| api.deepseek.com，名称 DeepSeek，deepseek-v4-1-flash-261017 | DeepSeek | 匹配域名 |
| openrouter.ai，模型 deepseek/deepseek-r1 | OpenRouter | 网关身份优先于所托管模型 |
| api.siliconflow.cn，模型 DeepSeek-V3 | SiliconCloud | 硅基流动域名 |
| 自定义地址，名称“通义千问” | Qwen | 中文别名 |
| 自定义地址，名称“兔子”，模型 claude-sonnet-4 | Claude | 模型系列；悬停标明“模型系列” |
| 自定义地址、名称、未知模型 | 通用方块图标 | 不猜测供应商 |

名称支持目录 ID/名称的大小写、空格/标点归一化及常见中文别名；不做任意子串猜测。域名只匹配完整主机名或带点边界的子域名，不从路径、查询字符串寻找品牌，例如 deepseek.com.evil.invalid 不按官方域名匹配。未收录的网关仍可能按名称或模型系列展示，模型回退并不证明网关是模型原厂；无认证/localhost 也不自动判为 Ollama。

设置列表使用 30×30 CSS 像素图标与 12px 文字间隔；选择按钮为 16px、选择项为 24px。彩色图标保持原色，单色图标在深色主题反转，浅色主题恢复原样。图标不接收凭据、不请求 CDN/favicon/供应商接口，离线可显示。

## 验证与更新

```bash
pnpm verify:icons
pnpm test
pnpm verify:provider-icons
DEVLY_EXECUTABLE=release/mac-arm64/Devly.app/Contents/MacOS/Devly pnpm verify:provider-icons
```

verify:icons 已纳入 pnpm check：离线核对目录、全部 SVG、许可证 SHA-256，以及可执行/外部引用 SVG 内容；不自动下载、不重写哈希。实际 Electron 检查使用临时 userData，验证域名/中文/模型/未知回退、图标加载和尺寸、深浅主题、网关优先、编辑后更新、模型选择器和零外部请求，不使用用户已有配置或 Key。

升级先评估目标版本、许可证、SVG 内容和品牌变更，再调整 scripts/provider-icons.mjs 中固定版本/完整性信息；下载和解包固定 tarball 到 .cache/provider-icons，保存固定源码提交的 LICENSE 后显式执行 node scripts/provider-icons.mjs --import，审查 SVG/目录/清单差异，再运行以上检查与生产打包。不要为通过检查单独重写清单哈希。正常构建和 CI 不执行导入流程。
