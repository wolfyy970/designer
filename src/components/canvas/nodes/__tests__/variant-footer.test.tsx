/** @vitest-environment jsdom */
/**
 * The footer's model label is per-result history, and the UI used to render it
 * with no indication of that. A `v1` card reading `minimax/minimax-m2.5` looked
 * like a statement about current configuration, when it meant "this version was
 * built when MiniMax was the default". These tests pin the disambiguation.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';

import VariantFooter from '../VariantFooter';
import { useTaskConfigStore } from '../../../../stores/task-config-store';
import { DEFAULT_MODEL_ID } from '../../../../test-support/model-fixtures';
import { GENERATION_STATUS } from '../../../../constants/generation';
import type { GenerationResult } from '../../../../types/provider';

function result(model: string | undefined): GenerationResult {
  return {
    id: 'r1',
    strategyId: 'vs-1',
    providerId: 'openrouter',
    modelId: model ?? 'unknown',
    status: GENERATION_STATUS.COMPLETE,
    runId: 'run-1',
    runNumber: 1,
    metadata: model ? { model } : {},
  } as GenerationResult;
}

beforeEach(() => {
  // No user override: the effective model is the shipped default.
  useTaskConfigStore.setState({ overrides: {} } as never);
});

afterEach(() => cleanup());

describe('VariantFooter — model label provenance', () => {
  it('shows the current default plainly, with no "older run" marker', () => {
    render(<VariantFooter result={result(DEFAULT_MODEL_ID)} />);

    expect(screen.getByText(DEFAULT_MODEL_ID)).toBeTruthy();
    expect(screen.queryByText('(older run)')).toBeNull();
  });

  it('marks a result built by a model that is no longer the default', () => {
    // The exact reported case: a v1 built under the previous default.
    render(<VariantFooter result={result('minimax/minimax-m2.5')} />);

    expect(screen.getByText('minimax/minimax-m2.5')).toBeTruthy();
    expect(screen.getByText('(older run)')).toBeTruthy();
  });

  it('explains the marker in a tooltip naming both models', () => {
    render(<VariantFooter result={result('minimax/minimax-m2.5')} />);

    const label = screen.getByText('minimax/minimax-m2.5');
    const title = label.getAttribute('title') ?? '';
    expect(title).toContain('minimax/minimax-m2.5');
    expect(title).toContain(DEFAULT_MODEL_ID);
  });

  it('follows a stored override when deciding what is current', () => {
    useTaskConfigStore.setState({
      overrides: { design: { providerId: 'openrouter', modelId: 'minimax/minimax-m2.5' } },
    } as never);
    // With the override in place the historically-labelled result IS current.
    render(<VariantFooter result={result('minimax/minimax-m2.5')} />);

    expect(screen.queryByText('(older run)')).toBeNull();
  });

  it('renders nothing model-related when the result has no model recorded', () => {
    render(<VariantFooter result={result(undefined)} />);

    expect(screen.queryByText('(older run)')).toBeNull();
  });

  it('still shows the version badge and timing', () => {
    const r = { ...result(DEFAULT_MODEL_ID), metadata: { model: DEFAULT_MODEL_ID, durationMs: 12_500 } };
    render(<VariantFooter result={r} />);

    expect(screen.getByText('v1')).toBeTruthy();
    expect(screen.getByText('12.5s')).toBeTruthy();
  });
});
