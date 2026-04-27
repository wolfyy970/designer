import { cva, type VariantProps } from 'class-variance-authority';

/**
 * cva factory separated from the component file so `react-refresh/only-export-components`
 * stays green — the component file can export only the component.
 */
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-100 disabled:shadow-none',
  {
    variants: {
      variant: {
        primary:
          'rounded-md border border-transparent bg-accent text-white hover:bg-accent-hover disabled:border-border-subtle disabled:bg-surface disabled:text-fg-faint disabled:hover:bg-surface',
        secondary:
          'rounded-md border border-border bg-surface-raised text-fg-secondary hover:border-accent disabled:border-border-subtle disabled:bg-transparent disabled:text-fg-faint disabled:hover:border-border-subtle disabled:hover:bg-transparent',
        destructive:
          'rounded-md border border-error-border-soft bg-transparent text-error hover:border-error-border-medium hover:bg-error-subtle disabled:border-border-subtle disabled:bg-transparent disabled:text-fg-faint disabled:hover:border-border-subtle disabled:hover:bg-transparent',
        ghost:
          'text-fg-secondary hover:bg-surface disabled:text-fg-faint disabled:hover:bg-transparent',
        link:
          'text-accent underline-offset-4 hover:underline disabled:text-fg-faint disabled:hover:no-underline',
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
