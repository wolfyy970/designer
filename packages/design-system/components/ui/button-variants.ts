import { cva, type VariantProps } from 'class-variance-authority';

/**
 * cva factory separated from the component file so `react-refresh/only-export-components`
 * stays green — the component file can export only the component.
 */
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'rounded-md bg-accent text-white hover:bg-accent-hover',
        secondary:
          'rounded-md border border-border bg-surface-raised text-fg-secondary hover:border-accent',
        destructive:
          'rounded-md border border-border bg-surface-raised text-error hover:border-error-border hover:bg-error-subtle',
        ghost: 'text-fg-secondary hover:bg-surface',
        link: 'text-accent underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-7 px-2 text-xs',
        md: 'h-8 px-3 text-xs',
        lg: 'h-9 px-4 text-sm',
        icon: 'size-8',
        iconSm: 'size-5 p-0.5',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export type ButtonVariantProps = VariantProps<typeof buttonVariants>;
