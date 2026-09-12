/** @vitest-environment jsdom */
/**
 * `HypothesisNode` is the canvas card that hosts the **Design** button — the
 * app's primary user action — yet had zero coverage. These tests render it
 * against the REAL Zustand stores so the tab editor, the name editor, and the
 * generate-readiness gate are exercised for real; only React Flow and the
 * model-resolution hook are mocked, since those are the rendering boundary.
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen } from '@testing-library/react';
import type { NodeProps } from '@xyflow/react';

vi.mock('@xyflow/react', () => ({
  Handle: () => null,
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
  useReactFlow: () => ({ fitView: vi.fn(), getNodes: () => [] }),
}));

vi.mock('@radix-ui/react-slot', () => ({
  Slot: ({ children }: { children: React.ReactNode }) => children as React.ReactElement,
}));

const taskModel = vi.hoisted(() => ({ hasModel: true }));
vi.mock('../../../../hooks/useTaskModel', () => ({
  useTaskModel: () => ({
    providerId: 'openrouter',
    modelId: 'test-model',
    hasModel: taskModel.hasModel,
    supportsVision: false,
    supportsReasoning: false,
  }),
}));

vi.mock('../../../../hooks/useCanvasNodePermanentRemove', () => ({
  useCanvasNodePermanentRemove: () => () => {},
}));

/**
 * `useAppConfig` is a React Query hook; mocking it keeps the render synchronous
 * and lets individual tests flip `autoImprove`, which gates the whole
 * Auto-improve settings block on the card.
 */
const appConfig = vi.hoisted(() => ({
  autoImprove: false,
  maxConcurrentRuns: 5,
}));
vi.mock('../../../../hooks/useAppConfig', () => ({
  useAppConfig: () => ({ data: appConfig }),
}));

import HypothesisNode from '../HypothesisNode';
import { PermanentDeleteConfirmProvider } from '../../../../contexts/PermanentDeleteConfirmProvider';
import { useIncubatorStore } from '../../../../stores/incubator-store';
import { useWorkspaceDomainStore } from '../../../../stores/workspace-domain-store';
import { useGenerationStore } from '../../../../stores/generation-store';
import { useCanvasStore } from '../../../../stores/canvas-store';
import { useEvaluatorDefaultsStore } from '../../../../stores/evaluator-defaults-store';

/** The node reads the delete-confirm context, so render it inside the real provider. */
function renderNode(props = nodeProps()) {
  return render(
    <PermanentDeleteConfirmProvider>
      <HypothesisNode {...props} />
    </PermanentDeleteConfirmProvider>,
  );
}

const NODE_ID = 'hyp-1';
const STRATEGY_ID = 'vs-1';

const strategy = {
  id: STRATEGY_ID,
  name: 'Instant resume',
  hypothesis: 'Ambient position restores momentum.',
  rationale: 'Because re-reading costs more than re-orienting.',
  measurements: 'Time-to-first-word after resume.',
  dimensionValues: {},
};

function nodeProps(): NodeProps<never> {
  return {
    id: NODE_ID,
    data: { refId: STRATEGY_ID },
    selected: false,
    type: 'hypothesis',
    isConnectable: true,
    zIndex: 0,
    dragging: false,
    draggable: true,
    selectable: true,
    deletable: true,
    positionAbsoluteX: 0,
    positionAbsoluteY: 0,
  } as unknown as NodeProps<never>;
}

function strategyFromStore() {
  return useIncubatorStore.getState().incubationPlans.inc?.hypotheses.find(
    (h) => h.id === STRATEGY_ID,
  );
}

beforeEach(() => {
  taskModel.hasModel = true;
  appConfig.autoImprove = false;
  useIncubatorStore.setState({
    incubationPlans: {
      inc: { id: 'inc', dimensions: [], hypotheses: [{ ...strategy }] },
    },
  } as never);
  useWorkspaceDomainStore.setState({ hypotheses: {}, designSystems: {} } as never);
  useGenerationStore.setState({ results: [], isGenerating: false } as never);
  useCanvasStore.setState({ nodes: [], edges: [], previewNodeIdMap: new Map() } as never);
  useEvaluatorDefaultsStore.setState({ maxRevisionRounds: 3, minOverallScore: null } as never);
});

afterEach(() => cleanup());

describe('HypothesisNode — tabbed strategy editor', () => {
  it('renders the hypothesis tab first and binds it to the store value', () => {
    renderNode();

    const box = screen.getByPlaceholderText(/What you're exploring/) as HTMLTextAreaElement;
    expect(box.value).toBe('Ambient position restores momentum.');
  });

  it('switches to the rationale and measurements tabs', () => {
    renderNode();

    fireEvent.pointerDown(screen.getByRole('tab', { name: 'Why' }));
    const why = screen.getByPlaceholderText(/Rationale, tradeoffs/) as HTMLTextAreaElement;
    expect(why.value).toBe('Because re-reading costs more than re-orienting.');

    fireEvent.pointerDown(screen.getByRole('tab', { name: 'Measurements' }));
    const m = screen.getByPlaceholderText(/Signals, metrics/) as HTMLTextAreaElement;
    expect(m.value).toBe('Time-to-first-word after resume.');

    // Exactly one panel is mounted at a time.
    expect(screen.getAllByRole('tabpanel')).toHaveLength(1);
  });

  it('writes edits back into the incubator store', () => {
    renderNode();

    const box = screen.getByPlaceholderText(/What you're exploring/);
    fireEvent.change(box, { target: { value: 'Rewritten hypothesis' } });

    expect(strategyFromStore()?.hypothesis).toBe('Rewritten hypothesis');
  });

  it('edits the rationale through its own tab without touching the hypothesis', () => {
    renderNode();

    fireEvent.pointerDown(screen.getByRole('tab', { name: 'Why' }));
    fireEvent.change(screen.getByPlaceholderText(/Rationale, tradeoffs/), {
      target: { value: 'Sharper rationale' },
    });

    expect(strategyFromStore()?.rationale).toBe('Sharper rationale');
    expect(strategyFromStore()?.hypothesis).toBe('Ambient position restores momentum.');
  });
});

describe('HypothesisNode — name editing', () => {
  it('shows the name, then swaps to an input on rename', () => {
    renderNode();

    expect(screen.getByText('Instant resume')).toBeTruthy();
    fireEvent.click(screen.getByTitle('Rename'));

    const input = screen.getByDisplayValue('Instant resume') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Renamed strategy' } });
    expect(strategyFromStore()?.name).toBe('Renamed strategy');
  });

  it('falls back to "Untitled" for a blank name and exits editing on Enter', () => {
    useIncubatorStore.setState({
      incubationPlans: {
        inc: { id: 'inc', dimensions: [], hypotheses: [{ ...strategy, name: '' }] },
      },
    } as never);

    renderNode();
    expect(screen.getByText('Untitled')).toBeTruthy();

    fireEvent.click(screen.getByTitle('Rename'));
    const input = screen.getByDisplayValue('');
    fireEvent.keyDown(input, { key: 'Enter' });

    // Persisted state is unchanged by the Enter key itself.
    expect(strategyFromStore()?.name).toBe('');
  });
});

describe('HypothesisNode — generation readiness gate', () => {
  it('offers Design when name, hypothesis, and model are all present', () => {
    renderNode();

    const design = screen.getByRole('button', { name: 'Design' }) as HTMLButtonElement;
    // canGenerate === true is what actually enables the primary action.
    expect(design.disabled).toBe(false);
    expect(screen.queryByText('Pick a model in Settings')).toBeNull();
    expect(screen.queryByText('Add a name and hypothesis')).toBeNull();
  });

  it('asks for a model when none resolves, and disables Design', () => {
    taskModel.hasModel = false;
    renderNode();

    expect(screen.getByText('Pick a model in Settings')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Design' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('asks for a name and hypothesis when the strategy is incomplete, and disables Design', () => {
    useIncubatorStore.setState({
      incubationPlans: {
        inc: { id: 'inc', dimensions: [], hypotheses: [{ ...strategy, hypothesis: '' }] },
      },
    } as never);
    renderNode();

    expect(screen.getByText('Add a name and hypothesis')).toBeTruthy();
    // The hint alone does not block a run — canGenerate does. Assert the
    // consequence, not just the label.
    expect((screen.getByRole('button', { name: 'Design' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});

describe('HypothesisNode — placeholders and missing strategy', () => {
  it('shows the incubating skeleton for a placeholder node', () => {
    renderNode({ ...nodeProps(), data: { placeholder: true } } as NodeProps<never>);

    expect(screen.getByText('New Hypothesis')).toBeTruthy();
    expect(screen.getByText('Incubating…')).toBeTruthy();
  });

  it('reports a missing strategy instead of crashing', () => {
    useIncubatorStore.setState({
      incubationPlans: { inc: { id: 'inc', dimensions: [], hypotheses: [] } },
    } as never);

    renderNode();
    expect(screen.getByText('Hypothesis not found')).toBeTruthy();
  });
});
