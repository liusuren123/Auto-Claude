import { describe, it, expect } from 'vitest';
import { buildThinkingProviderOptions, buildPromptCacheOptions } from '../types';
import type { ThinkingLevel } from '../types';

describe('buildThinkingProviderOptions', () => {
  it('should return Anthropic thinking options for Claude models', () => {
    const result = buildThinkingProviderOptions('claude-sonnet-4-6', 'high');
    expect(result).toEqual({
      anthropic: {
        thinking: { type: 'enabled', budgetTokens: 16384 },
      },
    });
  });

  it('should handle Anthropic adaptive thinking models', () => {
    const result = buildThinkingProviderOptions('claude-opus-4-6', 'high');
    expect(result).toBeDefined();
    expect(result?.anthropic?.thinking).toBeDefined();
  });

  it('should return OpenAI reasoning options for o-series models', () => {
    const result = buildThinkingProviderOptions('o3-mini', 'medium');
    expect(result).toEqual({
      openai: { reasoningEffort: 'medium' },
    });
  });

  it('should map xhigh to high for OpenAI', () => {
    const result = buildThinkingProviderOptions('o4-mini', 'xhigh');
    expect(result).toEqual({
      openai: { reasoningEffort: 'high' },
    });
  });

  it('should return Google thinking options for Gemini models', () => {
    const result = buildThinkingProviderOptions('gemini-2.5-pro', 'medium');
    expect(result).toEqual({
      google: { thinkingConfig: { thinkingBudget: 4096 } },
    });
  });

  it('should return undefined for non-reasoning OpenAI models', () => {
    const result = buildThinkingProviderOptions('gpt-4o', 'high');
    expect(result).toBeUndefined();
  });

  it('should return OpenAI-compatible thinking options for MiniMax models', () => {
    // MiniMax M3 / M3.1 share the same { thinking: { type: 'enabled' } } shape that
    // Z.AI and DeepSeek use on their OpenAI-compatible endpoints. The provider options
    // are merged into the request body by @ai-sdk/openai-compatible.
    const result = buildThinkingProviderOptions('MiniMax-M3', 'medium');
    expect(result).toEqual({ openaiCompatible: { thinking: { type: 'enabled' } } });

    const result31 = buildThinkingProviderOptions('MiniMax-M3.1-Flash-Preview', 'high');
    expect(result31).toEqual({ openaiCompatible: { thinking: { type: 'enabled' } } });

    const resultM27 = buildThinkingProviderOptions('MiniMax-M2.7', 'low');
    expect(resultM27).toEqual({ openaiCompatible: { thinking: { type: 'enabled' } } });
  });

  it('should return undefined for providers without thinking support', () => {
    expect(buildThinkingProviderOptions('mistral-large', 'high')).toBeUndefined();
    expect(buildThinkingProviderOptions('llama-3.1-70b', 'high')).toBeUndefined();
  });

  it('should return undefined for unknown model IDs', () => {
    expect(buildThinkingProviderOptions('unknown-model', 'high')).toBeUndefined();
  });

  it('should use correct budget for each thinking level', () => {
    const levels: ThinkingLevel[] = ['low', 'medium', 'high', 'xhigh'];
    const budgets = [1024, 4096, 16384, 32768];

    for (let i = 0; i < levels.length; i++) {
      const result = buildThinkingProviderOptions('claude-sonnet-4-6', levels[i]);
      expect((result?.anthropic?.thinking as { budgetTokens: number })?.budgetTokens).toBe(budgets[i]);
    }
  });
});

describe('buildPromptCacheOptions', () => {
  it('returns undefined for non-Anthropic models', () => {
    expect(buildPromptCacheOptions('gpt-5.3-codex')).toBeUndefined();
    expect(buildPromptCacheOptions('o3-mini')).toBeUndefined();
    expect(buildPromptCacheOptions('gemini-2.5-pro')).toBeUndefined();
    expect(buildPromptCacheOptions('MiniMax-M3')).toBeUndefined();
    expect(buildPromptCacheOptions('deepseek-v4-pro')).toBeUndefined();
    expect(buildPromptCacheOptions('llama-3.1-70b')).toBeUndefined();
  });

  it('returns an Anthropic ephemeral cacheControl for claude- models', () => {
    expect(buildPromptCacheOptions('claude-opus-4-6')).toEqual({
      anthropic: { cacheControl: { type: 'ephemeral' } },
    });
    expect(buildPromptCacheOptions('claude-sonnet-4-6')).toEqual({
      anthropic: { cacheControl: { type: 'ephemeral' } },
    });
    expect(buildPromptCacheOptions('claude-haiku-4-5-20251001')).toEqual({
      anthropic: { cacheControl: { type: 'ephemeral' } },
    });
  });
});
