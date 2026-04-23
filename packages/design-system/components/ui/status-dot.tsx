import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';
import { statusDotVariants, type StatusDotVariantProps } from './status-dot-variants';

export type StatusDotProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children'> &
  StatusDotVariantProps;

/**
 * Atomic tonal status dot. Replaces the repeated
 * `<span className="h-1.5 w-1.5 rounded-full bg-<tone>" />` pattern across
 * canvas chrome. Decorative only — pass `aria-hidden` at call site if needed.
 */
const StatusDot = forwardRef<HTMLSpanElement, StatusDotProps>(
  ({ className, tone, size, animated, ...props }, ref) => (
    <span
      ref={ref}
      className={cn(statusDotVariants({ tone, size, animated }), className)}
      {...props}
    />
  ),
);
StatusDot.displayName = 'StatusDot';

export { StatusDot };
