import { ActionConfirmIcon } from '@icons/actions';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface StepWizardStep {
  id: string;
  title: string;
  description?: string;
  complete?: boolean;
}

export function StepWizard({
  className,
  currentStepId,
  onStepSelect,
  percentComplete,
  steps,
  unlockedStepCount,
}: {
  className?: string;
  currentStepId: string;
  onStepSelect: (stepId: string) => void;
  percentComplete: number;
  steps: StepWizardStep[];
  unlockedStepCount: number;
}) {
  const currentIndex = Math.max(steps.findIndex((step) => step.id === currentStepId), 0);
  const clampedUnlockedCount = Math.min(Math.max(unlockedStepCount, 1), steps.length);
  const clampedPercentComplete = Math.min(Math.max(percentComplete, 0), 100);

  return (
    <div className={cn('grid gap-4', className)}>
      <div className="grid gap-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <p className="font-medium text-foreground">
            Step {currentIndex + 1} of {steps.length}
          </p>
        </div>
        <div
          aria-label="Wizard progress"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={Math.round(clampedPercentComplete)}
          className="h-2 overflow-hidden rounded-full bg-border/60"
          role="progressbar"
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-200 ease-out"
            style={{ width: `${clampedPercentComplete}%` }}
          />
        </div>
      </div>

      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
      >
        {steps.map((step, index) => {
          const isCurrent = step.id === currentStepId;
          const isUnlocked = index < clampedUnlockedCount;
          const isComplete = Boolean(step.complete) && index <= currentIndex;

          return (
            <WizardStepButton
              key={step.id}
              complete={isComplete}
              current={isCurrent}
              description={step.description}
              disabled={!isUnlocked}
              index={index}
              title={step.title}
              onClick={() => {
                if (isUnlocked) {
                  onStepSelect(step.id);
                }
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

function WizardStepButton({
  complete,
  current,
  description,
  disabled,
  index,
  onClick,
  title,
}: {
  complete: boolean;
  current: boolean;
  description?: ReactNode;
  disabled: boolean;
  index: number;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      aria-current={current ? 'step' : undefined}
      className={cn(
        'grid min-w-0 gap-2 rounded-[1.2rem] border px-3 py-3 text-left transition-colors md:px-4',
        current && 'border-primary/60 bg-primary/[0.08]',
        !current && !disabled && 'border-border/70 bg-background/65 hover:border-border hover:bg-background/85',
        disabled && 'cursor-not-allowed border-border/40 bg-background/35 text-muted-foreground/70',
      )}
      disabled={disabled}
      type="button"
      onClick={onClick}
    >
      <span className="flex min-w-0 items-start gap-3">
        <span
          className={cn(
            'flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
            complete && 'border-primary bg-primary text-primary-foreground',
            !complete && current && 'border-primary/60 text-primary',
            !complete && !current && !disabled && 'border-border/70 text-foreground',
            disabled && 'border-border/50 text-muted-foreground/80',
          )}
        >
          {complete ? <ActionConfirmIcon className="size-4" /> : index + 1}
        </span>
        <span className="min-w-0">
          <span className="block text-wrap break-words font-medium leading-5 text-foreground">{title}</span>
          {description ? <span className="mt-0.5 block text-wrap break-words text-xs leading-5 text-muted-foreground">{description}</span> : null}
        </span>
      </span>
    </button>
  );
}
