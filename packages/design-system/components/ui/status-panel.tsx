import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { StatusDot, type StatusDotProps } from './status-dot';

export type StatusPanelTone = NonNullable<StatusDotProps['tone']>;

export type StatusPanelProps = HTMLAttributes<HTMLDivElement> & {
  title: ReactNode;
  status?: ReactNode;
  tone?: StatusPanelTone;
  animated?: boolean;
  density?: 'default' | 'compact';
  actions?: ReactNode;
};

/**
 * Compact status row for dense panel and node chrome. Use when an object has a
 * short label, a current state, and optional actions.
 */
const StatusPanel = forwardRef<HTMLDivElement, StatusPanelProps>(
  (
    {
      className,
      title,
      status,
      tone = 'neutral',
      animated = false,
      density = 'default',
      actions,
      children,
      ...props
    },
    ref,
  ) => {
    const compact = density === 'compact';
    const hasStatus = status !== undefined && status !== null && status !== false && status !== '';
    return (
      <div
        ref={ref}
        className={cn(
          'rounded-md border border-border-subtle bg-surface',
          compact ? 'min-h-8 px-2 py-1.5' : 'px-2.5 py-2',
          className,
        )}
        {...props}
      >
        <div className={cn('flex items-center justify-between', compact ? 'gap-1.5' : 'gap-2')}>
          <div className={cn('min-w-0', compact ? 'flex items-center gap-2' : undefined)}>
            <div className="truncate text-nano font-medium text-fg-secondary">{title}</div>
            <div
              className={cn(
                'inline-flex items-center gap-1.5 text-nano text-fg-muted',
                compact ? 'shrink-0' : 'mt-0.5',
              )}
            >
              <StatusDot tone={tone} animated={animated} aria-hidden />
              {hasStatus ? <span>{status}</span> : null}
            </div>
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
        </div>
        {children ? <div className="mt-1 text-nano text-fg-muted">{children}</div> : null}
      </div>
    );
  },
);
StatusPanel.displayName = 'StatusPanel';

export { StatusPanel };
