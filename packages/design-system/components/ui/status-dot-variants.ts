import { cva, type VariantProps } from 'class-variance-authority';

/**
 * Canonical tonal dot indicator. Use instead of inline
 * `<span className="h-1.5 w-1.5 rounded-full bg-<tone>" />` patterns.
 *
 *   tone:     accent | success | warning | info | neutral
 *   size:     sm  → 0.375rem (default; matches prior `h-1.5 w-1.5` usage)
 *             md  → 0.5rem
 *   animated: adds `animate-pulse` (in-flight / live state signal)
 */
export const statusDotVariants = cva(
  'inline-flex shrink-0 rounded-full align-middle',
  {
    variants: {
      tone: {
        accent: 'bg-accent',
        success: 'bg-success',
        warning: 'bg-warning',
        info: 'bg-info',
        error: 'bg-error',
        neutral: 'bg-fg-faint',
      },
      size: {
        sm: 'h-1.5 w-1.5',
        md: 'h-2 w-2',
      },
      animated: {
        true: 'animate-pulse',
        false: '',
      },
    },
    defaultVariants: {
      tone: 'accent',
      size: 'sm',
      animated: false,
    },
  },
);

export type StatusDotVariantProps = VariantProps<typeof statusDotVariants>;
