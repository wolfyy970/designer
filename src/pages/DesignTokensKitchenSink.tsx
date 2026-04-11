import { useEffect, useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { X } from 'lucide-react';

type Swatch = {
  name: string;
  /** Tailwind bg-* utility when background is the token */
  swatchClass: string;
  /** Use fg-colored label on dark swatches */
  labelOnDark?: boolean;
};

const NEUTRAL_SWATCHES: Swatch[] = [
  { name: '--color-bg', swatchClass: 'bg-bg', labelOnDark: true },
  { name: '--color-surface', swatchClass: 'bg-surface', labelOnDark: true },
  { name: '--color-surface-raised', swatchClass: 'bg-surface-raised', labelOnDark: true },
  { name: '--color-surface-note', swatchClass: 'bg-surface-note', labelOnDark: true },
  { name: '--color-border', swatchClass: 'bg-border', labelOnDark: true },
  { name: '--color-border-subtle', swatchClass: 'bg-border-subtle', labelOnDark: true },
  { name: '--color-fg', swatchClass: 'bg-fg', labelOnDark: false },
  { name: '--color-fg-secondary', swatchClass: 'bg-fg-secondary', labelOnDark: true },
  { name: '--color-fg-muted', swatchClass: 'bg-fg-muted', labelOnDark: true },
  { name: '--color-fg-faint', swatchClass: 'bg-fg-faint', labelOnDark: true },
];

const ACCENT_SWATCHES: Swatch[] = [
  { name: '--color-accent', swatchClass: 'bg-accent', labelOnDark: true },
  { name: '--color-accent-hover', swatchClass: 'bg-accent-hover', labelOnDark: true },
  { name: '--color-accent-subtle', swatchClass: 'bg-accent-subtle', labelOnDark: true },
  { name: '--color-accent-glow', swatchClass: 'bg-accent-glow', labelOnDark: true },
  { name: '--color-accent-focus-hairline', swatchClass: 'bg-accent-focus-hairline', labelOnDark: true },
  { name: '--color-accent-ring-muted', swatchClass: 'bg-accent-ring-muted', labelOnDark: true },
  { name: '--color-accent-ring-muted-hover', swatchClass: 'bg-accent-ring-muted-hover', labelOnDark: true },
  { name: '--color-accent-edge-strong', swatchClass: 'bg-accent-edge-strong', labelOnDark: true },
];

const STATUS_SWATCHES: Swatch[] = [
  { name: '--color-error', swatchClass: 'bg-error', labelOnDark: true },
  { name: '--color-error-subtle', swatchClass: 'bg-error-subtle', labelOnDark: true },
  { name: '--color-warning', swatchClass: 'bg-warning', labelOnDark: true },
  { name: '--color-warning-subtle', swatchClass: 'bg-warning-subtle', labelOnDark: true },
  { name: '--color-success', swatchClass: 'bg-success', labelOnDark: true },
  { name: '--color-success-subtle', swatchClass: 'bg-success-subtle', labelOnDark: true },
  { name: '--color-info', swatchClass: 'bg-info', labelOnDark: true },
  { name: '--color-info-subtle', swatchClass: 'bg-info-subtle', labelOnDark: true },
];

const FILE_SWATCHES: Swatch[] = [
  { name: '--color-file-html (accent)', swatchClass: 'bg-file-html', labelOnDark: true },
  { name: '--color-file-css (info)', swatchClass: 'bg-file-css', labelOnDark: true },
  { name: '--color-file-script (warning)', swatchClass: 'bg-file-script', labelOnDark: true },
  { name: '--color-file-data (success)', swatchClass: 'bg-file-data', labelOnDark: true },
];

/** Derived semantic UI (single source — do not use `bg-accent/NN` / `border-error/NN` in product JSX). */
const SEMANTIC_UI_SWATCHES: Swatch[] = [
  { name: '--color-surface-nested', swatchClass: 'bg-surface-nested', labelOnDark: true },
  { name: '--color-surface-ghost-backdrop', swatchClass: 'bg-surface-ghost-backdrop', labelOnDark: true },
  { name: '--color-surface-floating', swatchClass: 'bg-surface-floating', labelOnDark: true },
  { name: '--color-surface-floating-strong', swatchClass: 'bg-surface-floating-strong', labelOnDark: true },
  { name: '--color-header-scrim', swatchClass: 'bg-header-scrim', labelOnDark: true },
  { name: '--color-surface-meta-chip', swatchClass: 'bg-surface-meta-chip', labelOnDark: true },
  { name: '--color-accent-highlight', swatchClass: 'bg-accent-highlight', labelOnDark: true },
  { name: '--color-accent-surface', swatchClass: 'bg-accent-surface', labelOnDark: true },
  { name: '--color-accent-surface-hover', swatchClass: 'bg-accent-surface-hover', labelOnDark: true },
  { name: '--color-accent-border-muted', swatchClass: 'bg-accent-border-muted', labelOnDark: true },
  { name: '--color-error-border', swatchClass: 'bg-error-border', labelOnDark: true },
  { name: '--color-error-surface-hover', swatchClass: 'bg-error-surface-hover', labelOnDark: true },
  { name: '--color-success-highlight', swatchClass: 'bg-success-highlight', labelOnDark: true },
  { name: '--color-success-surface', swatchClass: 'bg-success-surface', labelOnDark: true },
  { name: '--color-preview-canvas', swatchClass: 'bg-preview-canvas', labelOnDark: false },
];

function SwatchCard({ item }: { item: Swatch }) {
  const utility = item.swatchClass;
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div
        className={`relative flex h-14 items-end px-2 py-1 ${item.swatchClass} ${
          item.labelOnDark ? 'text-fg' : 'text-bg'
        }`}
      >
        <span className="text-pico font-mono opacity-90">{utility}</span>
      </div>
      <p className="border-t border-border-subtle px-2 py-1.5 text-nano text-fg-muted">{item.name}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="h4 border-b border-border-subtle pb-2">{title}</h2>
      {children}
    </section>
  );
}

export function DesignTokensKitchenSinkContent({ embedded = false }: { embedded?: boolean }) {
  const [successComputed, setSuccessComputed] = useState('');
  const [fontSans, setFontSans] = useState('');
  const [fontMono, setFontMono] = useState('');
  const [fontLogo, setFontLogo] = useState('');
  const inputId = useId();

  useEffect(() => {
    const root = document.documentElement;
    const style = getComputedStyle(root);
    setSuccessComputed(style.getPropertyValue('--color-success').trim() || '(empty)');
    setFontSans(style.getPropertyValue('--font-sans').trim() || '(empty)');
    setFontMono(style.getPropertyValue('--font-mono').trim() || '(empty)');
    setFontLogo(style.getPropertyValue('--font-logo').trim() || '(empty)');
  }, []);

  return (
    <div className="mx-auto max-w-4xl space-y-10">
      <header
        className={`space-y-2 pb-4 ${embedded ? 'border-b border-border-subtle' : 'border-b border-border'}`}
      >
        {!embedded && (
          <>
            <p className="label">Development only (full page)</p>
            <h1 className="h1">Design tokens kitchen sink</h1>
          </>
        )}
        <p className="body-text">
          Swatches reflect <code className="rounded bg-surface px-1 font-mono text-micro">src/index.css</code>{' '}
          <code className="rounded bg-surface px-1 font-mono text-micro">@theme</code>. Product chrome should use these
          utilities—not ad hoc hex or raw Tailwind palette colors.
        </p>
        <p className="text-micro text-fg-secondary">
          Runtime <span className="font-mono text-fg-muted">--color-success</span>:{' '}
          <span className="font-mono text-success">{successComputed}</span> (expect <span className="font-mono">#36cfa3</span>)
        </p>
        {!embedded && (
          <Link
            to="/canvas"
            className="inline-block rounded-md border border-border px-3 py-1.5 text-micro font-medium text-fg-secondary hover:bg-surface"
          >
            Back to canvas
          </Link>
        )}
      </header>

        <Section title="Neutrals">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {NEUTRAL_SWATCHES.map((item) => (
              <SwatchCard key={item.name} item={item} />
            ))}
          </div>
        </Section>

        <Section title="Accent and derived emphasis">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {ACCENT_SWATCHES.map((item) => (
              <SwatchCard key={item.name} item={item} />
            ))}
          </div>
        </Section>

        <Section title="Status">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {STATUS_SWATCHES.map((item) => (
              <SwatchCard key={item.name} item={item} />
            ))}
          </div>
        </Section>

        <Section title="File-type icon aliases">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {FILE_SWATCHES.map((item) => (
              <SwatchCard key={item.name} item={item} />
            ))}
          </div>
        </Section>

        <Section title="Semantic UI (fills and rails)">
          <p className="mb-2 text-nano text-fg-secondary">
            Prefer these named tokens over slash opacity on semantic colors (e.g. avoid{' '}
            <code className="rounded bg-surface px-1 font-mono text-micro">bg-accent/15</code>,{' '}
            <code className="rounded bg-surface px-1 font-mono text-micro">border-error/35</code>). Adjust
            oklch mixes only in <code className="font-mono text-micro">src/index.css</code> <code className="font-mono text-micro">@theme</code>.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {SEMANTIC_UI_SWATCHES.map((item) => (
              <SwatchCard key={item.name} item={item} />
            ))}
          </div>
        </Section>

        <Section title="Fonts">
          <p className="text-nano text-fg-secondary">
            Body/UI is the default (<code className="font-mono">font-sans</code>). Use{' '}
            <code className="font-mono">font-mono</code> for code blocks, eval streams, and tabular data.{' '}
            <code className="font-mono">font-logo</code> is for the canvas header wordmark only.
          </p>
          <div className="space-y-4 rounded-lg border border-border bg-surface p-4">
            <div>
              <p className="label mb-1">Body / UI — font-sans</p>
              <p className="font-sans text-sm text-fg">
                The quick brown fox jumps over the lazy dog — Space Grotesk (Latin subset) + system fallback.
              </p>
              <p className="mt-1 text-nano text-fg-muted">
                <span className="font-mono">--font-sans:</span> {fontSans}
              </p>
            </div>
            <div>
              <p className="label mb-1">Code — font-mono</p>
              <p className="font-mono text-sm text-fg">
                const theme = &apos;dark&apos;; — JetBrains Mono
              </p>
              <p className="mt-1 text-nano text-fg-muted">
                <span className="font-mono">--font-mono:</span> {fontMono}
              </p>
            </div>
            <div>
              <p className="label mb-1">Wordmark — font-logo</p>
              <p className="font-logo text-base font-medium tracking-wide text-fg">AutoDesigner</p>
              <p className="mt-1 text-nano text-fg-muted">
                <span className="font-mono">--font-logo:</span> {fontLogo}
              </p>
            </div>
          </div>
        </Section>

        <Section title="Typography scale">
          <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
            <p className="text-nano font-medium uppercase tracking-wide text-fg-muted">
              Component classes (index.css @layer components)
            </p>
            <div className="h1">Heading 1 — .h1</div>
            <div className="h2">Heading 2 — .h2</div>
            <div className="h3">Heading 3 — .h3</div>
            <div className="h4">Heading 4 — .h4</div>
            <p className="body-text">.body-text — default paragraph / explanatory copy.</p>
            <p className="caption">.caption — secondary meta line.</p>
            <p className="label">.label — uppercase small label</p>
            <p className="mt-4 text-nano font-medium uppercase tracking-wide text-fg-muted">
              Dense @theme scale (canvas, variant-run, toolbars)
            </p>
            <p className="text-pico text-fg-secondary">text-pico — 8px, very dense labels (sparingly)</p>
            <p className="text-badge text-fg-secondary">text-badge — 9px chips / uppercase labels</p>
            <p className="text-nano text-fg-secondary">text-nano — 10px secondary lines in tight panels</p>
            <p className="text-micro text-fg-secondary">text-micro — 11px slightly larger dense UI</p>
            <p className="mt-4 text-nano font-medium uppercase tracking-wide text-fg-muted">
              Standard Tailwind (modals, forms, node chrome)
            </p>
            <p className="text-xs text-fg-secondary">text-xs — common control and node copy</p>
            <p className="text-sm text-fg-secondary">text-sm — slightly emphasis copy</p>
            <p className="text-base text-fg-secondary">text-base — larger modal / header lines</p>
          </div>
        </Section>

        <Section title="Buttons">
          <p className="text-nano text-fg-secondary">
            Product uses raw <code className="font-mono">button</code> + Tailwind recipes (no shared Button
            component). Each row: label, default, disabled.
          </p>
          <div className="space-y-4 rounded-lg border border-border bg-surface p-4">
            <div className="flex flex-wrap items-center gap-3 border-b border-border-subtle pb-3">
              <span className="min-w-[var(--width-kitchen-sink-label)] text-nano font-medium text-fg-muted">Solid primary</span>
              <button
                type="button"
                className="rounded-md bg-fg px-3 py-2 text-xs font-medium text-bg hover:bg-fg-on-primary-hover"
              >
                Generate
              </button>
              <button
                type="button"
                disabled
                className="cursor-not-allowed rounded-md bg-fg px-3 py-2 text-xs font-medium text-bg opacity-50"
              >
                Disabled
              </button>
              <code className="text-pico text-fg-muted">bg-fg text-bg</code>
            </div>
            <div className="flex flex-wrap items-center gap-3 border-b border-border-subtle pb-3">
              <span className="min-w-[var(--width-kitchen-sink-label)] text-nano font-medium text-fg-muted">Accent solid</span>
              <button
                type="button"
                className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
              >
                Export
              </button>
              <button
                type="button"
                disabled
                className="cursor-not-allowed rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white opacity-50"
              >
                Disabled
              </button>
              <code className="text-pico text-fg-muted">bg-accent text-white</code>
            </div>
            <div className="flex flex-wrap items-center gap-3 border-b border-border-subtle pb-3">
              <span className="min-w-[var(--width-kitchen-sink-label)] text-nano font-medium text-fg-muted">Primary muted</span>
              <button type="button" className="ds-btn-primary-muted">
                Save to library
              </button>
              <button type="button" disabled className="ds-btn-primary-muted cursor-not-allowed opacity-50">
                Disabled
              </button>
              <code className="text-pico text-fg-muted">.ds-btn-primary-muted</code>
            </div>
            <div className="flex flex-wrap items-center gap-3 border-b border-border-subtle pb-3">
              <span className="min-w-[var(--width-kitchen-sink-label)] text-nano font-medium text-fg-muted">Ghost / secondary</span>
              <button
                type="button"
                className="rounded-md border border-border px-3 py-1.5 text-xs text-fg-secondary hover:bg-surface"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled
                className="cursor-not-allowed rounded-md border border-border px-3 py-1.5 text-xs text-fg-secondary opacity-50"
              >
                Disabled
              </button>
              <code className="text-pico text-fg-muted">border-border hover:bg-surface</code>
            </div>
            <div className="flex flex-wrap items-center gap-3 border-b border-border-subtle pb-3">
              <span className="min-w-[var(--width-kitchen-sink-label)] text-nano font-medium text-fg-muted">Destructive</span>
              <button
                type="button"
                className="rounded-lg border border-error-border bg-error-subtle px-3 py-1.5 text-nano font-semibold text-error hover:bg-error-surface-hover"
              >
                Delete permanently
              </button>
              <button
                type="button"
                disabled
                className="cursor-not-allowed rounded-lg border border-error-border bg-error-subtle px-3 py-1.5 text-nano font-semibold text-error opacity-50"
              >
                Disabled
              </button>
              <code className="text-pico text-fg-muted">error-subtle border</code>
            </div>
            <div>
              <p className="mb-2 text-nano font-medium text-fg-muted">Icon-only</p>
              <div className="flex flex-wrap items-center gap-4">
                <span className="text-pico text-fg-muted">sm</span>
                <button
                  type="button"
                  aria-label="Close"
                  className="rounded p-0.5 text-fg-muted hover:bg-surface-raised hover:text-fg-secondary"
                >
                  <X size={12} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  disabled
                  aria-label="Close disabled"
                  className="cursor-not-allowed rounded p-0.5 text-fg-muted opacity-40"
                >
                  <X size={12} strokeWidth={2} />
                </button>
                <span className="text-pico text-fg-muted">md</span>
                <button
                  type="button"
                  aria-label="Close"
                  className="rounded p-1 text-fg-muted hover:bg-surface-raised hover:text-fg-secondary"
                >
                  <X size={14} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  disabled
                  aria-label="Close disabled"
                  className="cursor-not-allowed rounded p-1 text-fg-muted opacity-40"
                >
                  <X size={14} strokeWidth={2} />
                </button>
                <span className="text-pico text-fg-muted">lg</span>
                <button
                  type="button"
                  aria-label="Close"
                  className="rounded p-1.5 text-fg-muted hover:bg-surface-raised hover:text-fg-secondary"
                >
                  <X size={16} strokeWidth={2} />
                </button>
                <span className="text-pico text-fg-muted">destructive hover</span>
                <button
                  type="button"
                  aria-label="Remove"
                  className="rounded p-1 text-fg-muted hover:bg-error-subtle hover:text-error"
                >
                  <X size={14} strokeWidth={2} />
                </button>
              </div>
            </div>
          </div>
        </Section>

        <Section title="Segmented controls">
          <p className="text-nano text-fg-secondary">
            Tab pills and level toggles: outer chrome + selected <code className="font-mono">bg-fg text-bg</code>.
          </p>
          <div className="rounded-lg border border-border bg-surface p-4">
            <div className="flex w-fit gap-0.5 rounded border border-border bg-surface p-0.5">
              <button type="button" className="rounded px-2.5 py-1 text-xs text-fg-muted hover:text-fg-secondary">
                Direct
              </button>
              <button type="button" className="rounded bg-fg px-2.5 py-1 text-xs font-medium text-bg">
                Agentic
              </button>
              <button type="button" className="rounded px-2.5 py-1 text-xs text-fg-muted hover:text-fg-secondary">
                Batch
              </button>
            </div>
          </div>
        </Section>

        <Section title="Selects and dropdowns">
          <div className="space-y-6 rounded-lg border border-border bg-surface p-4">
            <div>
              <p className="label mb-2">Native select — full-width (ProviderSelector-style)</p>
              <select
                className="w-full max-w-md rounded-md border border-border bg-bg px-3 py-2 text-xs text-fg-secondary input-focus"
                defaultValue="b"
              >
                <option value="a">Option A</option>
                <option value="b">Option B</option>
                <option value="c">Option C</option>
              </select>
            </div>
            <div>
              <p className="label mb-2">Native select — compact (node chrome)</p>
              <select
                className="rounded border border-border bg-surface px-1.5 py-0.5 text-nano text-fg"
                defaultValue="1"
              >
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
              </select>
            </div>
            <div>
              <p className="label mb-2">Custom searchable list (ModelSelector pattern — static mock)</p>
              <p className="mb-2 text-nano text-fg-muted">
                Trigger is an input; options are an absolutely positioned list. Real component:{' '}
                <code className="font-mono">ModelSelector.tsx</code>.
              </p>
              <div className="relative max-w-md">
                <input
                  type="text"
                  readOnly
                  value="anthropic/claude-3-5-sonnet"
                  className="w-full cursor-default rounded-md border border-border bg-bg py-2 pl-2.5 pr-7 text-xs text-fg-secondary"
                  aria-label="Model (mock)"
                />
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-fg-muted">▾</span>
                <ul className="relative z-10 mt-1 max-h-48 overflow-y-auto rounded-md border border-border bg-bg py-1 shadow-lg">
                  <li className="cursor-default px-2.5 py-1.5 text-xs text-fg-secondary">openai/gpt-4o</li>
                  <li className="bg-accent-highlight px-2.5 py-1.5 text-xs font-medium text-fg">
                    anthropic/claude-3-5-sonnet (highlight)
                  </li>
                  <li className="cursor-default px-2.5 py-1.5 text-xs text-fg-secondary">meta/llama-3.1</li>
                </ul>
              </div>
            </div>
          </div>
        </Section>

        <Section title="Composition classes (ds-*)">
          <div className="space-y-4 rounded-lg border border-border bg-surface p-4">
            <div className="ds-callout-note" role="note">
              Neutral callout (.ds-callout-note) — local-storage style notice.
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="ds-btn-primary-muted">
                .ds-btn-primary-muted
              </button>
              <button
                type="button"
                className="rounded-md border border-border px-3 py-1.5 text-xs text-fg-secondary hover:bg-surface-raised"
              >
                Ghost sibling
              </button>
            </div>
            <div className="space-y-1">
              <p className="mb-2 text-nano text-fg-muted">
                List rows — idle vs current selection (used in Spec Manager, canvas library panels)
              </p>
              <div className="ds-list-row">
                <div className="min-w-0 flex-1">
                  <span className="text-sm text-fg-secondary">Homepage redesign</span>
                </div>
                <span className="text-nano text-fg-muted">2 variants</span>
              </div>
              <div className="ds-list-row ds-list-row-current">
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-medium text-fg">Onboarding flow</span>
                  <span className="ds-chip-current">Active</span>
                </div>
                <span className="text-nano text-fg-muted">4 variants</span>
              </div>
              <div className="ds-list-row">
                <div className="min-w-0 flex-1">
                  <span className="text-sm text-fg-secondary">Settings panel</span>
                </div>
                <span className="text-nano text-fg-muted">1 variant</span>
              </div>
            </div>
            <div>
              <label htmlFor={inputId} className="mb-1 block text-nano text-fg-muted">
                .input-focus
              </label>
              <input
                id={inputId}
                type="text"
                placeholder="Focus me"
                className="input-focus w-full max-w-md rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-fg"
              />
            </div>
          </div>
        </Section>

        <Section title="Status dots (reference)">
          <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-surface p-4">
            <span className="inline-flex items-center gap-2 text-micro text-fg-secondary">
              <span className="inline-block size-2 rounded-full bg-success" /> bg-success (complete / pass)
            </span>
            <span className="inline-flex items-center gap-2 text-micro text-fg-secondary">
              <span className="inline-block size-2 rounded-full bg-accent animate-pulse" /> bg-accent pulse (in progress)
            </span>
          </div>
        </Section>
    </div>
  );
}

export default function DesignTokensKitchenSink() {
  return (
    <div className="min-h-screen bg-bg px-4 py-6 text-fg md:px-8">
      <DesignTokensKitchenSinkContent />
    </div>
  );
}
