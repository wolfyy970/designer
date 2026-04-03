import { filterNoisePrioritizedFixes, tryPrettyJson } from './eval-prioritized-fix-utils';

const HARD_FAIL_PREFIX = /^\[hard_fail:([^\]]+)\]\s*([\s\S]*)$/;
const SEVERITY_PREFIX = /^\[(high|medium|low)\]\s*([\s\S]*)$/;

function chipClasses(
  variant: 'hard_fail' | 'high' | 'medium' | 'low',
): string {
  switch (variant) {
    case 'hard_fail':
      return 'bg-error-subtle text-error ring-1 ring-inset ring-error/25';
    case 'high':
      return 'bg-error-subtle text-error ring-1 ring-inset ring-error/20';
    case 'medium':
      return 'bg-warning-subtle text-warning ring-1 ring-inset ring-warning/25';
    default:
      return 'bg-info-subtle text-info ring-1 ring-inset ring-info/25';
  }
}

function EvalPrioritizedFixRow({ text, dense }: { text: string; dense: boolean }) {
  let chip: { variant: 'hard_fail' | 'high' | 'medium' | 'low'; label: string } | null = null;
  let rest = text;
  const hm = text.match(HARD_FAIL_PREFIX);
  if (hm?.[1]) {
    chip = { variant: 'hard_fail', label: hm[1] };
    rest = hm[2] ?? '';
  } else {
    const sm = text.match(SEVERITY_PREFIX);
    if (sm?.[1] && (sm[1] === 'high' || sm[1] === 'medium' || sm[1] === 'low')) {
      chip = { variant: sm[1], label: sm[1] };
      rest = sm[2] ?? '';
    }
  }

  const trimmed = rest.trim();
  const jsonBlock = tryPrettyJson(trimmed);
  const preMax = dense ? 'max-h-28' : 'max-h-56';

  return (
    <div className="rounded-md border border-border-subtle/90 bg-bg/50 px-2 py-1.5">
      {chip && (
        <span
          className={`inline-block rounded px-1 py-px text-badge font-medium uppercase tracking-wide ${chipClasses(chip.variant)}`}
        >
          {chip.label}
        </span>
      )}
      {jsonBlock ? (
        <>
          {jsonBlock.label ? (
            <p className="mt-1 text-nano leading-snug text-fg-secondary">{jsonBlock.label}</p>
          ) : null}
          <pre
            className={`mt-1 overflow-auto rounded border border-border-subtle bg-surface p-2 font-mono text-badge leading-relaxed text-fg-secondary whitespace-pre-wrap break-words ${preMax}`}
          >
            {jsonBlock.json}
          </pre>
        </>
      ) : (
        <p className="mt-1 text-nano leading-relaxed text-fg-muted whitespace-pre-wrap break-words">
          {trimmed}
        </p>
      )}
    </div>
  );
}

export function EvalPrioritizedFixList({
  fixes,
  mode,
}: {
  fixes: string[];
  mode: 'compact' | 'panel';
}) {
  const filtered = filterNoisePrioritizedFixes(fixes);
  const list = mode === 'compact' ? filtered.slice(0, 4) : filtered;

  if (list.length === 0) {
    return (
      <p className="text-nano text-fg-faint italic">No findings after filtering noise signals.</p>
    );
  }

  return (
    <div className={mode === 'panel' ? 'flex flex-col gap-2' : 'flex flex-col gap-1'}>
      {list.map((f, i) => (
        <EvalPrioritizedFixRow key={`${i}-${f.slice(0, 48)}`} text={f} dense={mode === 'compact'} />
      ))}
    </div>
  );
}
