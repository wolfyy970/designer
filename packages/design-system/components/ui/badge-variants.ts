import { cva, type VariantProps } from 'class-variance-authority';

/**
 * cva factory separated from the component file so `react-refresh/only-export-components`
 * stays green — the component file can export only the component.
 */
export const badgeVariants = cva('inline-flex items-center shrink-0', {
  variants: {
    shape: {
      pill: 'rounded-full border px-2 py-0.5 font-mono text-nano',
      tab: 'rounded px-1.5 py-px text-badge font-medium',
    },
    tone: {
      warning: '',
      success: '',
      accent: '',
      neutral: '',
    },
  },
  compoundVariants: [
    // pill: border + subtle bg + tonal text
    {
      shape: 'pill',
      tone: 'warning',
      class: 'border-warning-border bg-warning-subtle text-warning',
    },
    {
      shape: 'pill',
      tone: 'success',
      class: 'border-success-border-muted bg-success-subtle text-success',
    },
    {
      shape: 'pill',
      tone: 'accent',
      class: 'border-accent-border-muted bg-accent-subtle text-accent',
    },
    {
      shape: 'pill',
      tone: 'neutral',
      class: 'border-border bg-surface text-fg-muted',
    },
    // tab: no border, flat bg, tonal text
    {
      shape: 'tab',
      tone: 'warning',
      class: 'bg-warning-subtle text-warning',
    },
    {
      shape: 'tab',
      tone: 'success',
      class: 'bg-success-surface text-success',
    },
    {
      shape: 'tab',
      tone: 'accent',
      class: 'bg-accent-surface text-accent',
    },
    {
      shape: 'tab',
      tone: 'neutral',
      class: 'bg-surface-meta-chip text-fg-muted',
    },
  ],
  defaultVariants: {
    shape: 'pill',
    tone: 'neutral',
  },
});

export type BadgeVariantProps = VariantProps<typeof badgeVariants>;
