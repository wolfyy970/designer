/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import SettingsModal from '../SettingsModal';

const appConfigState = vi.hoisted(() => ({
  autoImprove: false,
}));

vi.mock('../../../hooks/useAppConfig', () => ({
  useAppConfig: () => ({
    data: { autoImprove: appConfigState.autoImprove },
  }),
}));

describe('SettingsModal', () => {
  afterEach(() => {
    cleanup();
    appConfigState.autoImprove = false;
  });

  it('hides evaluator settings when Auto-improve is disabled', () => {
    render(<SettingsModal open onClose={() => {}} initialTab="evaluator" />);

    expect(screen.queryByRole('tab', { name: /Evaluator defaults/i })).toBeNull();
    expect(screen.queryByText('Evaluator defaults')).toBeNull();
    expect(screen.queryByText('Evaluator')).toBeNull();
    expect(screen.queryByText('Reasoning (thinking)')).not.toBeNull();
  });

  it('shows the section tabs when Auto-improve is enabled', () => {
    appConfigState.autoImprove = true;

    render(<SettingsModal open onClose={() => {}} />);

    expect(screen.queryByRole('tab', { name: /General/i })).not.toBeNull();
    expect(screen.queryByRole('tab', { name: /Evaluator defaults/i })).not.toBeNull();
    expect(screen.queryByText('Evaluator')).not.toBeNull();
  });
});
