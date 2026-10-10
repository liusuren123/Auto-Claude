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
- 其他：anthropic / openai / google / bedrock / azure / mistral / groq / xai / openrouter / ollama。

### ⚠️ 已知缺口：`openai-compatible`（Custom Endpoint）运行时未接线
UI 里可选（`AddAccountDialog` 有 baseUrl + 自定义模型列表），但主进程跑不通：
1. `BUILTIN_TO_SUPPORTED` **没有** `openai-compatible` 键 → `if (!supportedProvider) continue;` → 账号被**静默跳过**（不报错）。
2. `factory.ts` / `registry.ts` 的 switch 无该分支 → 若走到会抛 `Unsupported provider`。
3. `src/main/ai/providers/registry.ts`（`buildRegistry`/`resolveModel`）**无人引用，是死代码**。
4. 另有前缀守卫：`detectProviderFromModel` 认不出自定义模型名时也会跳过（`ollama` 有豁免，`openai-compatible` 没有）。

结论：DeepSeek / MiniMax（均为 OpenAI 兼容 API）当前**接不上**，需补上述接线。

## 运行环境坑（Windows 本机）
- 必须清 `ELECTRON_RUN_AS_NODE`（CLI 环境注入），否则 Electron 退化成 Node，报 `does not provide an export named 'BrowserWindow'`。
- 无 GPU 虚拟机需加 `--disable-gpu --disable-gpu-compositing --no-sandbox`，否则 `FATAL: GPU process isn't usable`。
- Node 的 `/tmp/x` 在 Windows 会落到当前盘符根（cwd 在 D: → `D:\tmp\x`）。
