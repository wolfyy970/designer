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
  group: 'input' | 'processing' | 'output';
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
  { type: 'hypothesis', label: 'Hypothesis', icon: <Lightbulb size={14} />, group: 'output' },
];

const GROUP_LABELS: Record<string, string> = {
  input: 'Input',
  processing: 'Processing',
  output: 'Output',
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

  function handleClick(type: CanvasNodeType) {
    if (onAdd) {
      onAdd(type, position);
    } else {
      addNode(type, position);
    }
  }

  const groups = ['input', 'processing', 'output'] as const;

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
              const disabled = isSingleton(entry.type) && isOnCanvas(entry.type);
              return (
                <button
                  key={entry.type}
                  onClick={() => handleClick(entry.type)}
                  disabled={disabled}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-fg-secondary transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span className="text-fg-muted">{entry.icon}</span>
                  {entry.label}
                  {disabled && (
                    <span className="ml-auto text-nano text-fg-faint">added</span>
                  )}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
