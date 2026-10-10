# Aperant — 项目长期记忆

## 仓库结构
- Electron + React + TS 桌面应用，`apps/desktop` 下运行（根 `node_modules` 为 hoisted，无 `apps/desktop/node_modules/.bin`，直接调 `../../node_modules/.bin/<tool>`）。
- `package.json` 为 `"type": "module"` → 主进程产物是 ESM（`out/main/index.js`）；Electron 40。
- PR target 为 `develop`。

## AI Provider 接入架构（2026-10-10 调研）
链路：`ProviderAccount`（设置里添加）→ `BUILTIN_TO_SUPPORTED` 映射 → `createProvider()`/`createProviderInstance()` switch → `LanguageModel`。

关键文件：
- `src/shared/constants/providers.ts` — `PROVIDER_REGISTRY`（设置 UI 的 provider 列表）
- `src/shared/types/provider-account.ts` — `BuiltinProvider`（含 `openai-compatible`）、`customModels`
- `src/main/ai/auth/resolver.ts` — `BUILTIN_TO_SUPPORTED`（`Record<string, SupportedProvider>`，**类型宽松，缺键不报错**）、`resolveAuthFromQueue`
- `src/main/ai/providers/types.ts` — `SupportedProvider` 枚举
- `src/main/ai/providers/factory.ts` / `registry.ts` — provider 实例化 switch
- `src/main/ai/config/types.ts` — `MODEL_PROVIDER_MAP`（模型前缀 → provider）

### 已内置可用
- **GLM / Z.AI**：`zai` provider，走 `createOpenAICompatible`。默认端点 `https://api.z.ai/api/paas/v4`；订阅制走 `/api/coding/paas/v4`（`resolveZaiBaseUrl`）。模型目录含 `glm-5`/`glm-4.7`/`glm-4.6v`/`glm-4.5-flash`。另有 API profile 预设 `zai-global`(api.z.ai) 与 `zai-cn`(open.bigmodel.cn)。
- 其他：anthropic / openai / google / bedrock / azure / mistral / groq / xai / openrouter / deepseek / minimax / openai-compatible / ollama。

### OpenAI-compatible 提供商：DeepSeek / MiniMax / 自定义端点（2026-10-10 已接通）
三种 provider 现均为**一等公民**：
- `deepseek` — 默认端点 `https://api.deepseek.com/v1`，模型 `deepseek-v4-pro` / `deepseek-v4-flash`
- `minimax` — 默认端点 `https://api.minimaxi.com/v1`，模型 `MiniMax-M2.7` / `MiniMax-M2.7-highspeed`
- `openai-compatible`（Custom Endpoint）— baseURL **必填**，模型由用户在设置里自定义
- `zai`（GLM）— 默认端点 `https://api.z.ai/api/paas/v4`（订阅制走 `/api/coding/paas/v4`）

接线点（新增 provider 时必须同步的位置）：
1. `shared/types/provider-account.ts` → `BuiltinProvider`
2. `shared/constants/providers.ts` → `PROVIDER_REGISTRY`（这里是设置页 provider 列表的数据源）
3. `main/ai/providers/types.ts` → `SupportedProvider` 枚举
4. `main/ai/auth/types.ts` → `PROVIDER_ENV_VARS`（**`Record<SupportedProvider,...>` 穷尽类型，漏了 typecheck 会报错**）
5. `main/ai/providers/factory.ts` + `registry.ts` → switch（**用 `never` 做穷尽检查**）
6. `main/ai/auth/resolver.ts` → `BUILTIN_TO_SUPPORTED`（**漏了会被静默 `continue` 跳过，不报错**）+ `FLEXIBLE_MODEL_PROVIDERS`
7. `main/ai/config/types.ts` → `MODEL_PROVIDER_MAP` 前缀
8. `shared/constants/models.ts` → `ALL_AVAILABLE_MODELS`、`DEFAULT_MODEL_EQUIVALENCES`、`PROVIDER_PRESET_DEFINITIONS`
9. `renderer/.../AddAccountDialog.tsx` → `needsBaseUrl` + 默认 baseUrl + placeholder
10. 3 处 `PROVIDER_BADGE_COLORS`（AuthStatusIndicator / UsageIndicator / AccountPriorityList）、2 处 `PROVIDER_I18N_KEYS`（前两者）
11. `shared/i18n/locales/{en,zh,fr}/common.json` → `usage.provider*`

关键语义：
- `FLEXIBLE_MODEL_PROVIDERS`（ollama / openai-compatible / deepseek / minimax）允许未识别前缀的模型名通过；但若模型明显属于别家（如 `claude-*`）仍会拒绝。
- `DEFAULT_MODEL_EQUIVALENCES` 必须给新 provider 补条目，否则用户请求 `sonnet` 之类的简写时该账号会被跳过。
- DeepSeek 的思考开关走 `providerOptions.openaiCompatible.thinking = {type:'enabled'}`（与 zai 同一套路，`buildThinkingProviderOptions`）。

## 运行环境坑（Windows 本机）
- 必须清 `ELECTRON_RUN_AS_NODE`（CLI 环境注入），否则 Electron 退化成 Node，报 `does not provide an export named 'BrowserWindow'`。
- 无 GPU 虚拟机需加 `--disable-gpu --disable-gpu-compositing --no-sandbox`，否则 `FATAL: GPU process isn't usable`。
- Node 的 `/tmp/x` 在 Windows 会落到当前盘符根（cwd 在 D: → `D:\tmp\x`）。
