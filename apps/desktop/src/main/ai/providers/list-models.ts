/**
 * Provider model list resolution.
 *
 * Fetches the canonical model catalogue from each provider's API rather than
 * relying solely on the static ALL_AVAILABLE_MODELS list. The static catalog
 * stays as the offline / cold-start fallback and as the source of capability
 * metadata (contextWindow, capabilities.thinking/vision/tools). The live list
 * is the source of truth for which model IDs the provider currently exposes.
 *
 * Adapter shape is intentionally small: each provider returns a list of
 * `NormalizedModel` records with only the fields the API actually exposes.
 * The renderer merges live + catalog before display.
 */

import type { BuiltinProvider } from '../../../shared/types/provider-account';
import { resolveEnvVarReference } from '../auth/resolver';

export interface NormalizedModel {
  /** Canonical model id used at request time (e.g. "MiniMax-M3", "claude-opus-4-6") */
  id: string;
  /** Display name when the API provides one */
  label?: string;
  /** Context window in tokens, if the API exposes it */
  contextWindow?: number;
  /** Native multimodal input (text/image/video) per provider metadata */
  supportsVision?: boolean;
  /** Tool use supported per provider metadata */
  supportsTools?: boolean;
  /** Provider-side "thinking" / reasoning supported */
  supportsThinking?: boolean;
  /**
   * Raw provider slug that surfaced this model — useful for de-duplication
   * across OpenAI-compatible endpoints (custom proxy, OpenRouter, etc.).
   */
  ownedBy?: string;
}

export type ListModelsResult =
  | { ok: true; models: NormalizedModel[] }
  | { ok: false; error: string };

interface ListArgs {
  baseURL?: string;
  apiKey?: string;
  /** Per-provider headers (e.g. x-api-key for Anthropic) */
  headers?: Record<string, string>;
  /** 8s default; pass lower for tight UI flows */
  timeoutMs?: number;
}

// ============================================
// HTTP helpers
// ============================================

async function fetchJson(url: string, init: RequestInit, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url;
}

function normalizeBaseUrl(baseURL: string | undefined, fallback: string): string {
  return stripTrailingSlash(baseURL && baseURL.length > 0 ? baseURL : fallback);
}

// ============================================
// Per-provider adapters
// ============================================

/**
 * OpenAI-compatible /v1/models endpoint. Used by OpenAI, DeepSeek, MiniMax,
 * Z.AI, Groq, Mistral (with their own URLs), OpenRouter, and any
 * openai-compatible custom endpoint.
 */
function parseOpenAIListModels(payload: unknown): NormalizedModel[] {
  if (!payload || typeof payload !== 'object') return [];
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  return data
    .filter((entry): entry is { id: string; owned_by?: string } =>
      typeof entry === 'object' && entry !== null && typeof (entry as { id?: unknown }).id === 'string',
    )
    .map((entry) => ({
      id: entry.id,
      ownedBy: entry.owned_by,
    }));
}

/**
 * Anthropic /v1/models returns { data: [{ id, display_name, type, ... }] }.
 * Anthropic doesn't publish context_window or capability flags in the list
 * endpoint, so we only emit id + label.
 */
function parseAnthropicListModels(payload: unknown): NormalizedModel[] {
  if (!payload || typeof payload !== 'object') return [];
  const data = (payload as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  return data
    .filter((entry): entry is { id: string; display_name?: string } =>
      typeof entry === 'object' && entry !== null && typeof (entry as { id?: unknown }).id === 'string',
    )
    .map((entry) => ({ id: entry.id, label: entry.display_name }));
}

/**
 * Google Gemini /v1beta/models returns { models: [{ name, displayName,
 * supportedGenerationMethods, inputTokenLimit, outputTokenLimit }] }.
 * Strip "models/" prefix from name.
 */
function parseGoogleListModels(payload: unknown): NormalizedModel[] {
  if (!payload || typeof payload !== 'object') return [];
  const models = (payload as { models?: unknown }).models;
  if (!Array.isArray(models)) return [];
  return models
    .filter((entry): entry is {
      name: string;
      displayName?: string;
      inputTokenLimit?: string | number;
      supportedGenerationMethods?: string[];
    } => typeof entry === 'object' && entry !== null && typeof (entry as { name?: unknown }).name === 'string',
    )
    .map((entry) => {
      const id = entry.name.replace(/^models\//, '');
      const inputLimit = typeof entry.inputTokenLimit === 'string'
        ? parseInt(entry.inputTokenLimit, 10)
        : entry.inputTokenLimit;
      return {
        id,
        label: entry.displayName,
        contextWindow: typeof inputLimit === 'number' && Number.isFinite(inputLimit) ? inputLimit : undefined,
        supportsTools: Array.isArray(entry.supportedGenerationMethods)
          ? entry.supportedGenerationMethods.includes('generateContent')
          : undefined,
      };
    });
}

/**
 * Ollama /api/tags returns { models: [{ name, model, details: {...} }] }.
 * Pull context window out of details.context_length (Ollama 0.10+).
 */
function parseOllamaListModels(payload: unknown): NormalizedModel[] {
  if (!payload || typeof payload !== 'object') return [];
  const models = (payload as { models?: unknown }).models;
  if (!Array.isArray(models)) return [];
  return models
    .filter((entry): entry is { name: string; details?: { context_length?: number } } =>
      typeof entry === 'object' && entry !== null && typeof (entry as { name?: unknown }).name === 'string',
    )
    .map((entry) => ({
      id: entry.name,
      contextWindow: entry.details?.context_length,
    }));
}

// ============================================
// Dispatcher
// ============================================

const DEFAULT_TIMEOUT_MS = 8_000;

export async function listModelsForProvider(
  provider: BuiltinProvider,
  args: ListArgs,
): Promise<ListModelsResult> {
  const { baseURL, headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS } = args;

  // Expand `${VAR}` / `$VAR` references so users who stored an env-var
  // pointer in their ProviderAccount still get a real key here. A reference
  // that points to an unset var is a config error, not a network error —
  // surface it as such instead of letting MiniMax reject us with a 401.
  let apiKey = args.apiKey;
  const envRef = resolveEnvVarReference(apiKey ?? '');
  if (envRef.isRef) {
    if (!envRef.resolved) {
      return { ok: false, error: `Environment variable ${envRef.refName} is not set in the shell` };
    }
    apiKey = envRef.resolved;
  }

  try {
    switch (provider) {
      case 'anthropic': {
        const url = `${normalizeBaseUrl(baseURL, 'https://api.anthropic.com')}/v1/models`;
        // Anthropic accepts both Authorization: Bearer and x-api-key. Prefer the
        // explicit header the caller passed (e.g. via resolveAuth) and fall back
        // to a Bearer token if only an apiKey was supplied.
        const requestHeaders: Record<string, string> = { ...headers };
        if (apiKey && !('x-api-key' in requestHeaders)) {
          requestHeaders['x-api-key'] = apiKey;
          requestHeaders['anthropic-version'] = '2023-06-01';
        }
        const payload = await fetchJson(url, { headers: requestHeaders }, timeoutMs);
        return { ok: true, models: parseAnthropicListModels(payload) };
      }

      case 'openai': {
        const url = `${normalizeBaseUrl(baseURL, 'https://api.openai.com/v1')}/models`;
        const payload = await fetchJson(
          url,
          { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} },
          timeoutMs,
        );
        return { ok: true, models: parseOpenAIListModels(payload) };
      }

      case 'google': {
        const url = `${normalizeBaseUrl(baseURL, 'https://generativelanguage.googleapis.com')}/v1beta/models?key=${encodeURIComponent(apiKey ?? '')}`;
        const payload = await fetchJson(url, {}, timeoutMs);
        return { ok: true, models: parseGoogleListModels(payload) };
      }

      case 'deepseek': {
        const url = `${normalizeBaseUrl(baseURL, 'https://api.deepseek.com')}/models`;
        const payload = await fetchJson(
          url,
          { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} },
          timeoutMs,
        );
        return { ok: true, models: parseOpenAIListModels(payload) };
      }

      case 'minimax': {
        // MiniMax exposes both OpenAI-compatible (/v1/models) and Anthropic-compatible
        // (/anthropic/v1/models) lists. Prefer the OpenAI-compatible one since the
        // app talks to the same URL via @ai-sdk/openai-compatible.
        const url = `${normalizeBaseUrl(baseURL, 'https://api.minimaxi.com/v1')}/models`;
        const payload = await fetchJson(
          url,
          { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} },
          timeoutMs,
        );
        return { ok: true, models: parseOpenAIListModels(payload) };
      }

      case 'zai': {
        const url = `${normalizeBaseUrl(baseURL, 'https://api.z.ai/api/paas/v4')}/models`;
        const payload = await fetchJson(
          url,
          { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} },
          timeoutMs,
        );
        return { ok: true, models: parseOpenAIListModels(payload) };
      }

      case 'groq': {
        const url = `${normalizeBaseUrl(baseURL, 'https://api.groq.com/openai/v1')}/models`;
        const payload = await fetchJson(
          url,
          { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} },
          timeoutMs,
        );
        return { ok: true, models: parseOpenAIListModels(payload) };
      }

      case 'mistral': {
        const url = `${normalizeBaseUrl(baseURL, 'https://api.mistral.ai/v1')}/models`;
        const payload = await fetchJson(
          url,
          { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} },
          timeoutMs,
        );
        return { ok: true, models: parseOpenAIListModels(payload) };
      }

      case 'xai': {
        const url = `${normalizeBaseUrl(baseURL, 'https://api.x.ai/v1')}/models`;
        const payload = await fetchJson(
          url,
          { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} },
          timeoutMs,
        );
        return { ok: true, models: parseOpenAIListModels(payload) };
      }

      case 'openrouter': {
        // OpenRouter includes context_length and per-model metadata — pass it
        // through so the UI can show real context numbers.
        const url = `${normalizeBaseUrl(baseURL, 'https://openrouter.ai/api/v1')}/models`;
        const payload = await fetchJson(
          url,
          { headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {} },
          timeoutMs,
        );
        const models = parseOpenAIListModels(payload);
        const data = (payload as { data?: Array<{ id: string; context_length?: number; top_provider?: { max_completion_tokens?: number } }> } | undefined)?.data;
        if (Array.isArray(data)) {
          for (let i = 0; i < models.length; i++) {
            const meta = data.find((entry) => entry?.id === models[i].id);
            if (meta?.context_length) models[i].contextWindow = meta.context_length;
          }
        }
        return { ok: true, models };
      }

      case 'ollama': {
        const url = `${normalizeBaseUrl(baseURL, 'http://localhost:11434')}/api/tags`;
        const payload = await fetchJson(url, {}, timeoutMs);
        return { ok: true, models: parseOllamaListModels(payload) };
      }

      case 'amazon-bedrock': {
        // Bedrock doesn't have a single list-models endpoint the SDK can hit
        // without AWS credentials. The static catalog is the only source for now.
        return { ok: true, models: [] };
      }

      case 'azure': {
        // Azure deployments are user-defined; the static catalog cannot
        // enumerate them. Surfacing empty allows the UI to fall back to
        // custom-model-id entry.
        return { ok: true, models: [] };
      }
    }
    // Exhaustiveness guard — BuiltinProvider is a closed union, so the
    // compiler should never reach here. Return empty rather than throw so
    // a future provider addition can't bring down the picker.
    return { ok: true, models: [] };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to list models';
    return { ok: false, error: message };
  }
}