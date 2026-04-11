import { describe, it, expect } from 'vitest';
import { filledOrEmpty, processingOrFilled, previewNodeStatus } from '../node-status';
import { NODE_STATUS } from '../../constants/canvas';

describe('filledOrEmpty', () => {
  it('returns FILLED when hasContent is true', () => {
    expect(filledOrEmpty(true)).toBe(NODE_STATUS.FILLED);
  });

  it('returns EMPTY when hasContent is false', () => {
    expect(filledOrEmpty(false)).toBe(NODE_STATUS.EMPTY);
  });
});

describe('processingOrFilled', () => {
  it('returns PROCESSING when isProcessing is true', () => {
    expect(processingOrFilled(true)).toBe(NODE_STATUS.PROCESSING);
  });

  it('returns FILLED when isProcessing is false', () => {
    expect(processingOrFilled(false)).toBe(NODE_STATUS.FILLED);
  });
});

describe('previewNodeStatus', () => {
  it('returns DIMMED when isArchived regardless of other flags', () => {
    expect(previewNodeStatus({ isArchived: true, isError: true, isGenerating: true, hasCode: true }))
      .toBe(NODE_STATUS.DIMMED);
    expect(previewNodeStatus({ isArchived: true, isError: false, isGenerating: false, hasCode: false }))
      .toBe(NODE_STATUS.DIMMED);
  });

  it('returns ERROR when isError (and not archived)', () => {
    expect(previewNodeStatus({ isArchived: false, isError: true, isGenerating: true, hasCode: true }))
      .toBe(NODE_STATUS.ERROR);
  });

  it('returns PROCESSING when isGenerating (and not archived/error)', () => {
    expect(previewNodeStatus({ isArchived: false, isError: false, isGenerating: true, hasCode: false }))
      .toBe(NODE_STATUS.PROCESSING);
    expect(previewNodeStatus({ isArchived: false, isError: false, isGenerating: true, hasCode: true }))
      .toBe(NODE_STATUS.PROCESSING);
  });

  it('returns FILLED when hasCode (and not archived/error/generating)', () => {
    expect(previewNodeStatus({ isArchived: false, isError: false, isGenerating: false, hasCode: true }))
      .toBe(NODE_STATUS.FILLED);
  });

  it('returns EMPTY when no code and not active', () => {
    expect(previewNodeStatus({ isArchived: false, isError: false, isGenerating: false, hasCode: false }))
      .toBe(NODE_STATUS.EMPTY);
  });

  it('priority order: archived > error > generating > filled > empty', () => {
    expect(previewNodeStatus({ isArchived: true, isError: true, isGenerating: true, hasCode: true }))
      .toBe(NODE_STATUS.DIMMED);
    expect(previewNodeStatus({ isArchived: false, isError: true, isGenerating: true, hasCode: true }))
      .toBe(NODE_STATUS.ERROR);
    expect(previewNodeStatus({ isArchived: false, isError: false, isGenerating: true, hasCode: true }))
      .toBe(NODE_STATUS.PROCESSING);
  });
});
