/**
 * Tests for listModelsForProvider.
 *
 * Mock the global fetch so each test exercises one provider's adapter without
 * making real network requests.
 */

import { describe, expect, it, vi, afterEach } from 'vitest';
import { listModelsForProvider } from '../list-models';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function makeJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  mockFetch.mockReset();
});

describe('listModelsForProvider — OpenAI-compatible adapters', () => {
  it('parses the standard OpenAI /v1/models payload for MiniMax', async () => {
    mockFetch.mockResolvedValueOnce(
      makeJsonResponse({
        object: 'list',
        data: [
          { id: 'MiniMax-M3', object: 'model', created: 1, owned_by: 'minimaxi' },
          { id: 'MiniMax-M3.1-Flash-Preview', object: 'model', created: 2, owned_by: 'minimaxi' },
          { id: 'MiniMax-M2.7', object: 'model', created: 3, owned_by: 'minimaxi' },
        ],
      }),
    );

    const result = await listModelsForProvider('minimax', {
      apiKey: 'test-key',
      baseURL: 'https://api.minimaxi.com/v1',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.models.map(m => m.id)).toEqual([
      'MiniMax-M3',
      'MiniMax-M3.1-Flash-Preview',
      'MiniMax-M2.7',
    ]);
    expect(result.models[0].ownedBy).toBe('minimaxi');
    // Default MiniMax base URL should be used when caller didn't pass one.
    const called = mockFetch.mock.calls[0]?.[0] as string;
    expect(called).toBe('https://api.minimaxi.com/v1/models');
  });

  it('sends the Authorization: Bearer header', async () => {
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ data: [] }));

    await listModelsForProvider('deepseek', { apiKey: 'sk-ds-xxx' });

    const init = mockFetch.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer sk-ds-xxx');
  });

  it('passes through OpenRouter context_length into contextWindow', async () => {
    mockFetch.mockResolvedValueOnce(
      makeJsonResponse({
        data: [
          { id: 'anthropic/claude-sonnet-4-6', context_length: 200000 },
          { id: 'meta-llama/llama-3.1-70b', context_length: 131072 },
        ],
      }),
    );

    const result = await listModelsForProvider('openrouter', { apiKey: 'or-key' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.models[0].contextWindow).toBe(200000);
    expect(result.models[1].contextWindow).toBe(131072);
  });
});

describe('listModelsForProvider — Anthropic adapter', () => {
  it('parses /v1/models with id + display_name and sends x-api-key', async () => {
    mockFetch.mockResolvedValueOnce(
      makeJsonResponse({
        data: [
          { id: 'claude-opus-4-6', display_name: 'Claude Opus 4.6', type: 'model' },
        ],
      }),
    );

    const result = await listModelsForProvider('anthropic', {
      apiKey: 'sk-ant-xxx',
      baseURL: 'https://api.anthropic.com',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.models[0]).toEqual({
      id: 'claude-opus-4-6',
      label: 'Claude Opus 4.6',
      ownedBy: undefined,
      contextWindow: undefined,
    });

    const init = mockFetch.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('sk-ant-xxx');
    expect(headers['anthropic-version']).toBe('2023-06-01');
  });
});

describe('listModelsForProvider — Google Gemini adapter', () => {
  it('strips the models/ prefix and surfaces inputTokenLimit', async () => {
    mockFetch.mockResolvedValueOnce(
      makeJsonResponse({
        models: [
          {
            name: 'models/gemini-2.5-pro',
            displayName: 'Gemini 2.5 Pro',
            inputTokenLimit: '1048576',
            supportedGenerationMethods: ['generateContent', 'countTokens'],
          },
        ],
      }),
    );

    const result = await listModelsForProvider('google', { apiKey: 'goog-key' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.models[0].id).toBe('gemini-2.5-pro');
    expect(result.models[0].contextWindow).toBe(1048576);
    expect(result.models[0].supportsTools).toBe(true);
  });
});

describe('listModelsForProvider — Ollama adapter', () => {
  it('surfaces context_length from details', async () => {
    mockFetch.mockResolvedValueOnce(
      makeJsonResponse({
        models: [
          { name: 'llama3.1:8b', details: { context_length: 131072 } },
          { name: 'qwen2.5-coder:7b' },
        ],
      }),
    );

    const result = await listModelsForProvider('ollama', { baseURL: 'http://localhost:11434' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.models[0].contextWindow).toBe(131072);
    expect(result.models[1].contextWindow).toBeUndefined();
  });
});

describe('listModelsForProvider — error handling', () => {
  it('returns ok=false with the HTTP status message on a 4xx response', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Unauthorized', { status: 401, statusText: 'Unauthorized' }),
    );

    const result = await listModelsForProvider('openai', { apiKey: 'bad-key' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('401');
  });

  it('returns ok=false on network errors without throwing', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNRESET'));

    const result = await listModelsForProvider('minimax', { apiKey: 'k' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe('ECONNRESET');
  });

  it('returns empty models (not an error) for providers with no public list endpoint', async () => {
    const result = await listModelsForProvider('amazon-bedrock', { apiKey: 'aws-key' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.models).toEqual([]);
    // No fetch should be issued.
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

describe('listModelsForProvider — env-var reference expansion', () => {
  it('expands ${VAR} against process.env before issuing the request', async () => {
    process.env.MINI_TEST_LM_KEY = 'real-secret-from-env';
    mockFetch.mockResolvedValueOnce(makeJsonResponse({ data: [] }));

    await listModelsForProvider('minimax', { apiKey: '${MINI_TEST_LM_KEY}' });

    const init = mockFetch.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer real-secret-from-env');
    delete process.env.MINI_TEST_LM_KEY;
  });

  it('returns ok=false with a clear message when the referenced env var is unset', async () => {
    delete process.env.MINI_TEST_LM_KEY;
    const result = await listModelsForProvider('minimax', { apiKey: '${MINI_TEST_LM_KEY}' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('MINI_TEST_LM_KEY');
    // No fetch should be attempted.
    expect(mockFetch).not.toHaveBeenCalled();
  });
});