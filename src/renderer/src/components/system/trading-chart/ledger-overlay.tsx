import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function ChartLedgerOverlay({
  ariaLabel,
  children,
  onClose,
  panelClassName,
  ...props
}: {
  ariaLabel: string;
  children: ReactNode;
  onClose: () => void;
  panelClassName?: string;
} & Omit<ComponentProps<'div'>, 'aria-label' | 'children' | 'role'>) {
  return (
    <div
      aria-label={ariaLabel}
      aria-modal="true"
      className="fixed inset-0 z-50 p-4"
      role="dialog"
      {...props}
    >
      <button
        aria-label="Close expanded chart overlay"
        className="absolute inset-0 bg-[rgba(29,20,12,0.46)] backdrop-blur-sm"
        onClick={onClose}
        type="button"
      />
      <div className={cn('relative z-10 flex h-full min-h-0 w-full min-w-0', panelClassName)}>
        {children}
      </div>
    </div>
  );
}
