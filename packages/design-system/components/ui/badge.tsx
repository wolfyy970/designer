import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';
import { badgeVariants, type BadgeVariantProps } from './badge-variants';

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & BadgeVariantProps;

const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, shape, tone, ...props }, ref) => {
    return (
      <span
        className={cn(badgeVariants({ shape, tone }), className)}
        ref={ref}
        {...props}
      />
    );
  },
);
Badge.displayName = 'Badge';

export { Badge };
