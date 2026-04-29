/** @vitest-environment jsdom */
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import DesignTokensKitchenSink from '../DesignTokensKitchenSink';

describe('DesignTokensKitchenSink', () => {
  afterEach(() => {
    cleanup();
  });

  it('uses the Designer wordmark in the dev visual reference', () => {
    render(
      <MemoryRouter>
        <DesignTokensKitchenSink />
      </MemoryRouter>,
    );

    expect(screen.getByText('Wordmark — font-logo')).not.toBeNull();
    expect(screen.getAllByText('Designer').length).toBeGreaterThan(0);
    expect(screen.queryByText(`${'Auto'}${'Designer'}`)).toBeNull();
  });
});
