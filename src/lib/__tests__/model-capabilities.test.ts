import { describe, it, expect } from 'vitest';
import { supportsReasoningModel } from '../model-capabilities';

describe('supportsReasoningModel', () => {
  it('matches OpenAI o-series models', () => {
    expect(supportsReasoningModel('o1')).toBe(true);
    expect(supportsReasoningModel('o1-mini')).toBe(true);
    expect(supportsReasoningModel('o3')).toBe(true);
    expect(supportsReasoningModel('o4-mini')).toBe(true);
    expect(supportsReasoningModel('openai/o1')).toBe(true);
    expect(supportsReasoningModel('openai/o3-mini')).toBe(true);
  });

  it('matches Anthropic Claude 3.5 / 3.7 / 4', () => {
    expect(supportsReasoningModel('claude-3.5-sonnet')).toBe(true);
    expect(supportsReasoningModel('claude-3-5-sonnet-20241022')).toBe(true);
    expect(supportsReasoningModel('claude-3.7-sonnet')).toBe(true);
    expect(supportsReasoningModel('claude-4-opus')).toBe(true);
    expect(supportsReasoningModel('anthropic/claude-3.5-sonnet')).toBe(true);
    expect(supportsReasoningModel('anthropic/claude-4-sonnet')).toBe(true);
  });

  it('matches DeepSeek reasoning models', () => {
    expect(supportsReasoningModel('deepseek-r1')).toBe(true);
    expect(supportsReasoningModel('deepseek-r1-distill-qwen-32b')).toBe(true);
    expect(supportsReasoningModel('deepseek-reasoner')).toBe(true);
    expect(supportsReasoningModel('deepseek/deepseek-r1')).toBe(true);
  });

  it('matches every DeepSeek V4 model, including the pinned default', () => {
    // Verified against OpenRouter's catalog: every `deepseek/deepseek-v4*`
    // advertises `reasoning` + `reasoning_effort` and emits reasoning tokens.
    // This is the current default model, so a miss here silently disables
    // thinking levels for every task.
    expect(supportsReasoningModel('deepseek/deepseek-v4.1-flash')).toBe(true);
    expect(supportsReasoningModel('deepseek/deepseek-v4-flash')).toBe(true);
    expect(supportsReasoningModel('deepseek/deepseek-v4-pro')).toBe(true);
    expect(supportsReasoningModel('deepseek/deepseek-v4-pro-0813')).toBe(true);
    expect(supportsReasoningModel('deepseek/deepseek-v4-flash-vision-exp')).toBe(true);
  });

  it('still treats non-reasoning DeepSeek chat models as non-reasoning', () => {
    // V3 chat models do not advertise reasoning; the V4 pattern must not sweep
    // them in.
    expect(supportsReasoningModel('deepseek/deepseek-chat')).toBe(false);
    expect(supportsReasoningModel('deepseek/deepseek-chat-v3-0324')).toBe(false);
  });

  it('matches MiniMax M2.7', () => {
    expect(supportsReasoningModel('minimax/minimax-m2.7')).toBe(true);
    expect(supportsReasoningModel('MiniMax/MiniMax-M2.7')).toBe(true);
  });

  it('matches QwQ and Qwen3', () => {
    expect(supportsReasoningModel('qwq-32b')).toBe(true);
    expect(supportsReasoningModel('qwen3-235b')).toBe(true);
    expect(supportsReasoningModel('qwen/qwen3-coder')).toBe(true);
  });

  it('matches -thinking suffix models', () => {
    expect(supportsReasoningModel('some-model-thinking')).toBe(true);
  });

  it('does not match non-reasoning models', () => {
    expect(supportsReasoningModel('gpt-4o')).toBe(false);
    expect(supportsReasoningModel('gpt-4o-mini')).toBe(false);
    expect(supportsReasoningModel('claude-3-opus')).toBe(false);
    expect(supportsReasoningModel('claude-3-haiku')).toBe(false);
    expect(supportsReasoningModel('llama-3-8b')).toBe(false);
    expect(supportsReasoningModel('mistral-7b')).toBe(false);
    expect(supportsReasoningModel('gemini-pro')).toBe(false);
    expect(supportsReasoningModel('minimax/minimax-m2.5')).toBe(false);
    expect(supportsReasoningModel('qwen2-72b')).toBe(false);
    expect(supportsReasoningModel('deepseek-v2')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(supportsReasoningModel('Claude-3.5-Sonnet')).toBe(true);
    expect(supportsReasoningModel('DEEPSEEK-R1')).toBe(true);
    expect(supportsReasoningModel('QWQ-32B')).toBe(true);
  });
});
