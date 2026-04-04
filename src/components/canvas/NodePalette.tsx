import {
  FileText,
  Image,
  BookOpen,
  Target,
  ShieldCheck,
  Cpu,
  Bot,
  Lightbulb,
  SwatchBook,
} from 'lucide-react';
import {
  useCanvasStore,
  SECTION_NODE_TYPES,
  type CanvasNodeType,
} from '../../stores/canvas-store';

interface NodeEntry {
  type: CanvasNodeType;
  label: string;
  icon: React.ReactNode;
  group: 'input' | 'processing' | 'strategies';
}

const NODE_ENTRIES: NodeEntry[] = [
  { type: 'designBrief', label: 'Design Brief', icon: <FileText size={14} />, group: 'input' },
  { type: 'existingDesign', label: 'Existing Design', icon: <Image size={14} />, group: 'input' },
  { type: 'researchContext', label: 'Research & Context', icon: <BookOpen size={14} />, group: 'input' },
  { type: 'objectivesMetrics', label: 'Objectives & Metrics', icon: <Target size={14} />, group: 'input' },
  { type: 'designConstraints', label: 'Design Constraints', icon: <ShieldCheck size={14} />, group: 'input' },
  { type: 'model', label: 'Model', icon: <Bot size={14} />, group: 'processing' },
  { type: 'compiler', label: 'Incubator', icon: <Cpu size={14} />, group: 'processing' },
  { type: 'designSystem', label: 'Design System', icon: <SwatchBook size={14} />, group: 'processing' },
  { type: 'hypothesis', label: 'Hypothesis', icon: <Lightbulb size={14} />, group: 'strategies' },
];

const GROUP_LABELS: Record<string, string> = {
  input: 'Input',
  processing: 'Processing',
  strategies: 'Strategies',
};

interface NodePaletteProps {
  onAdd?: (type: CanvasNodeType, position?: { x: number; y: number }) => void;
  position?: { x: number; y: number };
}

export default function NodePalette({ onAdd, position }: NodePaletteProps) {
  const nodes = useCanvasStore((s) => s.nodes);
  const addNode = useCanvasStore((s) => s.addNode);

  function isSingleton(type: CanvasNodeType): boolean {
    // Sections are still singletons; compilers and designers can be multiple
    if (SECTION_NODE_TYPES.has(type)) return true;
    return false;
  }

  function isOnCanvas(type: CanvasNodeType): boolean {
    return nodes.some((n) => n.type === type);
  }

  const hasIncubator = nodes.some((n) => n.type === 'compiler');

  function handleClick(type: CanvasNodeType) {
    if (onAdd) {
      onAdd(type, position);
    } else {
      addNode(type, position);
    }
  }

  const groups = ['input', 'processing', 'strategies'] as const;

  return (
    <div className="w-palette rounded-lg border border-border bg-surface py-1 shadow-lg">
      {groups.map((group) => {
        const entries = NODE_ENTRIES.filter((e) => e.group === group);
        if (entries.length === 0) return null;
        return (
          <div key={group}>
            <div className="px-3 py-1.5 text-nano font-semibold uppercase tracking-wider text-fg-muted">
              {GROUP_LABELS[group]}
            </div>
            {entries.map((entry) => {
              const singletonTaken = isSingleton(entry.type) && isOnCanvas(entry.type);
              const needsIncubator = entry.type === 'hypothesis' && !hasIncubator;
              const disabled = singletonTaken || needsIncubator;
              let statusLabel: string | null = null;
              if (singletonTaken) statusLabel = 'added';
              else if (needsIncubator) statusLabel = 'needs Incubator';
              return (
                <button
                  key={entry.type}
                  type="button"
                  onClick={() => handleClick(entry.type)}
                  disabled={disabled}
                  title={
                    needsIncubator
                      ? 'Add an Incubator to the canvas first, then add hypotheses.'
                      : undefined
                  }
                  aria-label={
                    needsIncubator ? `${entry.label} (add an Incubator first)` : entry.label
                  }
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-fg-secondary transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span className="text-fg-muted">{entry.icon}</span>
                  {entry.label}
                  {statusLabel && (
                    <span className="ml-auto max-w-[7rem] truncate text-right text-nano text-fg-faint">
                      {statusLabel}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        );
      })}
      <p className="border-t border-border-subtle px-3 py-2 text-nano leading-snug text-fg-muted">
        Previews appear after you generate from a hypothesis.
      </p>
    </div>
  );
}
