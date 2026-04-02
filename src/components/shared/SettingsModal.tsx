import { useState, useEffect, useRef } from 'react';
import { STORAGE_KEYS } from '../../lib/storage-keys';
import Modal from './Modal';
import PromptEditor from './PromptEditor';
import type { PromptKey } from '../../stores/prompt-store';

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
  /** When the modal opens, switch to this tab once per open cycle */
  initialTab?: 'general' | 'prompts';
  /** Prompt Studio key (used with prompts tab) */
  initialPromptKey?: PromptKey;
}

type Tab = 'general' | 'prompts';

const KEYS_STORAGE = STORAGE_KEYS.API_KEYS;

function loadKeys(): { openrouter: string } {
  const raw = localStorage.getItem(KEYS_STORAGE);
  if (!raw) return { openrouter: '' };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { openrouter: '' };
    const obj = parsed as Record<string, unknown>;
    return { openrouter: typeof obj.openrouter === 'string' ? obj.openrouter : '' };
  } catch {
    return { openrouter: '' };
  }
}

function saveKeys(keys: { openrouter: string }) {
  localStorage.setItem(KEYS_STORAGE, JSON.stringify(keys));
}

export default function SettingsModal({
  open,
  onClose,
  initialTab,
  initialPromptKey,
}: SettingsModalProps) {
  const [tab, setTab] = useState<Tab>('general');
  const [openrouterKey, setOpenrouterKey] = useState(() => loadKeys().openrouter);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (open && !wasOpenRef.current && initialTab) setTab(initialTab);
    wasOpenRef.current = open;
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) return;

    const keys = loadKeys();
    setOpenrouterKey((prev) => {
      const newValue = keys.openrouter;
      return prev !== newValue ? newValue : prev;
    });
  }, [open]);

  const handleSave = () => {
    saveKeys({ openrouter: openrouterKey });
    onClose();
  };

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
        <div className="space-y-4">
          <p className="text-xs text-fg-secondary">
            All API calls go through OpenRouter. One key for everything — compiler
            and generation. Set it here or in{' '}
            <code className="text-xs">.env.local</code> as{' '}
            <code className="text-xs">VITE_OPENROUTER_API_KEY</code>.
          </p>

          <div>
            <label className="mb-1 block text-xs font-medium text-fg-secondary">
              OpenRouter API Key
            </label>
            <input
              type="password"
              value={openrouterKey}
              onChange={(e) => setOpenrouterKey(e.target.value)}
              placeholder="sk-or-..."
              className="w-full rounded-md border border-border px-3 py-2 text-sm input-focus"
            />
            <p className="mt-1 text-xs text-fg-muted">
              Get one at openrouter.ai — gives access to Claude, GPT-4o, Gemini,
              and more.
            </p>
          </div>

          <button
            type="button"
            onClick={handleSave}
            className="w-full rounded-md bg-fg px-4 py-2 text-sm font-medium text-bg hover:bg-fg/90 pointer"
          >
            Save
          </button>
        </div>
      )}

      {tab === 'prompts' && <PromptEditor initialPromptKey={initialPromptKey} />}
    </Modal>
  );
}
