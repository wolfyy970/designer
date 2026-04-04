import { useState, useEffect, useRef } from 'react';
import Modal from './Modal';
import PromptEditor from './PromptEditor';
import type { PromptKey } from '../../stores/prompt-store';
import { useCanvasStore } from '../../stores/canvas-store';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  /** When the modal opens, switch to this tab once per open cycle */
  initialTab?: 'general' | 'prompts';
  /** Prompt Studio key (used with prompts tab) */
  initialPromptKey?: PromptKey;
}

type Tab = 'general' | 'prompts';

export default function SettingsModal({
  open,
  onClose,
  initialTab,
  initialPromptKey,
}: SettingsModalProps) {
  const [tab, setTab] = useState<Tab>('general');
  const autoLayout = useCanvasStore((s) => s.autoLayout);
  const toggleAutoLayout = useCanvasStore((s) => s.toggleAutoLayout);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current && initialTab) setTab(initialTab);
    wasOpenRef.current = open;
  }, [open, initialTab]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Settings"
      size={tab === 'prompts' ? 'xl' : 'md'}
    >
      <div className="-mx-5 -mt-4 mb-4 flex border-b border-border px-5">
        <button
          type="button"
          onClick={() => setTab('general')}
          className={`border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
            tab === 'general'
              ? 'border-fg text-fg'
              : 'border-transparent text-fg-secondary hover:text-fg-secondary'
          }`}
        >
          General
        </button>
        <button
          type="button"
          onClick={() => setTab('prompts')}
          className={`border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
            tab === 'prompts'
              ? 'border-fg text-fg'
              : 'border-transparent text-fg-secondary hover:text-fg-secondary'
          }`}
        >
          Prompts
        </button>
      </div>

      {tab === 'general' && (
        <div className="rounded-md border border-border-subtle bg-surface/60 px-3 py-2.5">
          <label className="flex cursor-pointer items-start gap-2.5 select-none">
            <input
              type="checkbox"
              checked={autoLayout}
              onChange={toggleAutoLayout}
              className="accent-accent mt-0.5 shrink-0"
            />
            <span>
              <span className="block text-sm font-medium text-fg">Auto layout</span>
              <span className="mt-0.5 block text-xs text-fg-secondary">
                When on, nodes follow the graph layout automatically and are not draggable.
                Updates after compile, generate, and connection changes.
              </span>
            </span>
          </label>
        </div>
      )}

      {tab === 'prompts' && <PromptEditor initialPromptKey={initialPromptKey} />}
    </Modal>
  );
}
