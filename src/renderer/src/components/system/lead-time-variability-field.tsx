import { useEffect, useState, type ComponentProps } from 'react';
import type { AppLanguage } from '@shared/inventory';
import type { SenaLeadTimeVariabilityClass } from '@shared/sena';
import {
  deriveLeadTimeFromVariabilityClass,
  leadTimeVariabilityOptions,
} from '@shared/sena-lead-time';
import { NumberStepperInput } from '@/components/ui/number-stepper-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  customLeadTimeVariabilityValue,
  leadTimeVariabilityPlaceholderValue,
  shouldShowLeadTimeVariabilityPlaceholder,
} from '@/lib/lead-time-variability-select';
import { parseEditableNumberWithCommas } from '@/lib/format';
import { translateLeadTimeVariabilityLabel } from '@/lib/localized-display';
import { translateUiLiteral } from '@/lib/translations';
import { cn } from '@/lib/utils';

export type LeadTimeVariabilityDraftMode = 'class' | 'std';

function formatHours(value: number) {
  return value.toFixed(1);
}

export function etaVariationPartsFromDays(days: number | null) {
  if (days == null || !Number.isFinite(days)) {
    return null;
  }
  const totalHours = Math.max(0, Math.round(days * 24 * 10) / 10);
  const wholeDays = Math.floor(totalHours / 24);
  const hours = Math.round((totalHours - wholeDays * 24) * 10) / 10;
  if (hours >= 24) {
    return { wholeDays: wholeDays + 1, hours: 0 };
  }
  return { wholeDays, hours };
}

export function etaVariationDaysFromParts(wholeDaysDraft: string, hoursDraft: string) {
  const wholeDays = wholeDaysDraft.trim()
    ? Math.max(0, Math.floor(parseEditableNumberWithCommas(wholeDaysDraft)))
    : 0;
  const hours = hoursDraft.trim() ? Math.max(0, parseEditableNumberWithCommas(hoursDraft)) : 0;
  if (!Number.isFinite(wholeDays) || !Number.isFinite(hours)) {
    return null;
  }
  return wholeDays + hours / 24;
}

function formatDerivedEtaVariation(language: AppLanguage, days: number | null) {
  const parts = etaVariationPartsFromDays(days);
  if (!parts) {
    return translateUiLiteral(language, 'Set mean days first');
  }
  if (parts.wholeDays <= 0) {
    return translateUiLiteral(language, '± {hours} hr', { hours: formatHours(parts.hours) });
  }
  return translateUiLiteral(language, '± {days} d & {hours} hr', {
    days: parts.wholeDays,
    hours: formatHours(parts.hours),
  });
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
  const [customWholeDays, setCustomWholeDays] = useState('');
  const [customHours, setCustomHours] = useState('');
  useEffect(() => {
    const customParts = etaVariationPartsFromDays(customStdDays.trim() ? parseEditableNumberWithCommas(customStdDays) : null);
    setCustomWholeDays(customParts ? String(customParts.wholeDays) : '');
    setCustomHours(customParts ? formatHours(customParts.hours) : '');
  }, [customStdDays]);
  const updateCustomParts = (nextWholeDays: string, nextHours: string) => {
    setCustomWholeDays(nextWholeDays);
    setCustomHours(nextHours);
    if (
      (!nextWholeDays.trim() && !nextHours.trim()) ||
      (parseEditableNumberWithCommas(nextWholeDays) === 0 && !nextHours.trim())
    ) {
      onCustomStdDaysChange('');
      return;
    }
    const nextDays = etaVariationDaysFromParts(nextWholeDays, nextHours);
    onCustomStdDaysChange(nextDays == null ? '' : String(nextDays));
  };

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
          aria-label={translateUiLiteral(language, 'ETA variation')}
          className={selectTriggerClassName}
        >
          <SelectValue placeholder={placeholder}>
            {mode === 'std' ? (
              translateUiLiteral(language, 'Custom')
            ) : value ? (
              <span className="flex min-w-0 flex-1 items-center justify-between gap-3">
                <span className="truncate">{translateLeadTimeVariabilityLabel(language, value)}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatDerivedEtaVariation(language, selectedDerivedDays)}
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
                    {formatDerivedEtaVariation(language, derivedDays)}
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
        <div aria-label={translateUiLiteral(language, 'Custom ETA variation')} className="grid gap-3 sm:grid-cols-2">
          <NumberStepperInput
            aria-label={translateUiLiteral(language, 'Custom ETA variation days')}
            className={cn(customInputClassName)}
            min="0"
            placeholder={translateUiLiteral(language, 'Days')}
            inputSuffix={translateUiLiteral(language, 'd')}
            step="1"
            variant={numberInputVariant}
            value={customWholeDays}
            onChange={(event) => updateCustomParts(event.target.value, customHours)}
          />
          <NumberStepperInput
            aria-label={translateUiLiteral(language, 'Custom ETA variation hours')}
            className={cn(customInputClassName)}
            min="0"
            max="23.9"
            placeholder={translateUiLiteral(language, 'Hours')}
            inputSuffix={translateUiLiteral(language, 'hr')}
            step="0.1"
            variant={numberInputVariant}
            value={customHours}
            onChange={(event) => updateCustomParts(customWholeDays, event.target.value)}
          />
        </div>
      ) : null}
    </div>
  );
}
