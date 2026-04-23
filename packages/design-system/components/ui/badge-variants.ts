import { cva, type VariantProps } from 'class-variance-authority';

/**
 * cva factory separated from the component file so `react-refresh/only-export-components`
 * stays green — the component file can export only the component.
 *
 * Shape semantics:
 *  • `pill`  — node-level **status** (needs input / filled / optional, hypothesis gating).
 *              Rounded-full, soft tonal wash, no border, sans text-nano. Reads as a tag.
 *  • `tab`   — secondary **meta chip** (archived, best current, tab counters).
 *              Rectangular with tight padding, flat tonal wash, text-badge. Recedes.
 */
export const badgeVariants = cva('inline-flex items-center shrink-0', {
  variants: {
    shape: {
      pill: 'rounded-full px-2 py-0.5 text-nano font-medium leading-tight',
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
    // pill: flat tonal wash — no border, no mono. Soft but legible.
    {
      shape: 'pill',
      tone: 'warning',
      class: 'bg-warning-subtle text-warning',
    },
    {
      shape: 'pill',
      tone: 'success',
      class: 'bg-success-subtle text-success',
    },
    {
      shape: 'pill',
      tone: 'accent',
      class: 'bg-accent-subtle text-accent',
    },
    {
      shape: 'pill',
      tone: 'neutral',
      class: 'bg-surface-meta-chip text-fg-muted',
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
