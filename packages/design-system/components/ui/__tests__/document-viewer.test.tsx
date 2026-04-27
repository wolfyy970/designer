import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { DocumentViewer } from '../document-viewer';

describe('DocumentViewer', () => {
  it('renders metadata and document content', () => {
    render(
      <DocumentViewer
        metadata={<div>Generated: today</div>}
        content="# Context\nAudience notes"
      />,
    );

    expect(screen.getByText('Generated: today')).toBeTruthy();
    expect(screen.getByText(/Audience notes/)).toBeTruthy();
  });

  it('renders an empty message when content is blank', () => {
    render(<DocumentViewer content=" " emptyMessage="Nothing yet" />);

    expect(screen.getByText('Nothing yet')).toBeTruthy();
  });
});
