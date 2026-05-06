import type { ComponentProps } from 'react';
import type { AppLanguage } from '@shared/inventory';
import type { SenaLeadTimeVariabilityClass } from '@shared/sena';
import { deriveLeadTimeFromVariabilityClass, leadTimeVariabilityOptions } from '@shared/sena-lead-time';
import { NumberStepperInput } from '@/components/ui/number-stepper-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  customLeadTimeVariabilityValue,
  leadTimeVariabilityPlaceholderValue,
  shouldShowLeadTimeVariabilityPlaceholder,
} from '@/lib/lead-time-variability-select';
import { translateLeadTimeVariabilityLabel } from '@/lib/localized-display';
import { translateUiLiteral } from '@/lib/translations';
import { cn } from '@/lib/utils';

export type LeadTimeVariabilityDraftMode = 'class' | 'std';

function formatDerivedDays(language: AppLanguage, days: number | null) {
  if (days == null || !Number.isFinite(days)) {
    return translateUiLiteral(language, 'Set mean days first');
  }
  const roundedDays = Math.round(days * 10) / 10;
  return translateUiLiteral(language, '±{days} days', { days: roundedDays });
}

export function derivedStdDaysDraft(
  meanDays: number | null,
  variabilityClass: SenaLeadTimeVariabilityClass | '',
) {
  const stdDays = deriveLeadTimeFromVariabilityClass(meanDays, variabilityClass || null).stdDays;
  return stdDays == null ? '' : String(stdDays);
}

export function LeadTimeVariabilityField({
  customInputClassName,
  customStdDays,
  language,
  meanDays,
  mode,
  numberInputVariant,
  placeholder,
  selectContentAlign = 'start',
  selectContentPosition,
  selectTriggerClassName,
  value,
  onCustomStdDaysChange,
  onModeChange,
  onValueChange,
}: {
  customInputClassName: string;
  customStdDays: string;
  language: AppLanguage;
  meanDays: number | null;
  mode: LeadTimeVariabilityDraftMode;
  numberInputVariant?: ComponentProps<typeof NumberStepperInput>['variant'];
  placeholder: string;
  selectContentAlign?: 'start' | 'center' | 'end';
  selectContentPosition?: 'item-aligned' | 'popper';
  selectTriggerClassName: string;
  value: SenaLeadTimeVariabilityClass | '';
  onCustomStdDaysChange: (value: string) => void;
  onModeChange: (mode: LeadTimeVariabilityDraftMode) => void;
  onValueChange: (value: SenaLeadTimeVariabilityClass | '') => void;
}) {
  const selectedValue =
    mode === 'std'
      ? customLeadTimeVariabilityValue
      : value || leadTimeVariabilityPlaceholderValue;
  const selectedDerivedDays =
    mode === 'class' && value ? deriveLeadTimeFromVariabilityClass(meanDays, value).stdDays : null;

  return (
    <div className="grid gap-3">
      <Select
        value={selectedValue}
        onValueChange={(nextValue) => {
          if (nextValue === customLeadTimeVariabilityValue) {
            onModeChange('std');
            return;
          }
          onModeChange('class');
          if (nextValue === leadTimeVariabilityPlaceholderValue) {
            onValueChange('');
            return;
          }
          const nextClass = nextValue as SenaLeadTimeVariabilityClass;
          onValueChange(nextClass);
        }}
      >
        <SelectTrigger
          aria-label={translateUiLiteral(language, 'Lead time variability')}
          className={selectTriggerClassName}
        >
          <SelectValue placeholder={placeholder}>
            {mode === 'std' ? (
              translateUiLiteral(language, 'Custom')
            ) : value ? (
              <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
                <span className="truncate">{translateLeadTimeVariabilityLabel(language, value)}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatDerivedDays(language, selectedDerivedDays)}
                </span>
              </span>
            ) : undefined}
          </SelectValue>
        </SelectTrigger>
        <SelectContent align={selectContentAlign} position={selectContentPosition}>
          {shouldShowLeadTimeVariabilityPlaceholder(value) && mode !== 'std' ? (
            <SelectItem value={leadTimeVariabilityPlaceholderValue}>
              {placeholder}
            </SelectItem>
          ) : null}
          {leadTimeVariabilityOptions().map((option) => {
            const derivedDays = deriveLeadTimeFromVariabilityClass(meanDays, option).stdDays;
            return (
              <SelectItem
                className="[&_[data-slot=select-item-text]]:pr-40"
                key={option}
                trailing={
                  <span className="text-xs text-muted-foreground">
                    {formatDerivedDays(language, derivedDays)}
                  </span>
                }
                value={option}
              >
                {translateLeadTimeVariabilityLabel(language, option)}
              </SelectItem>
            );
          })}
          <SelectItem value={customLeadTimeVariabilityValue}>
            {translateUiLiteral(language, 'Custom')}
          </SelectItem>
        </SelectContent>
      </Select>
      {mode === 'std' ? (
        <NumberStepperInput
          aria-label={translateUiLiteral(language, 'Custom uncertainty ± days')}
          autoFocus
          className={cn(customInputClassName)}
          min="0"
          placeholder={translateUiLiteral(language, 'Custom uncertainty ± days')}
          step="0.1"
          variant={numberInputVariant}
          value={customStdDays}
          onChange={(event) => onCustomStdDaysChange(event.target.value)}
        />
      ) : null}
    </div>
  );
}
