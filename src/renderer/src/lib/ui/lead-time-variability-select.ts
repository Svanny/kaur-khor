import type { SenaLeadTimeVariabilityClass } from '@shared/sena';

export const leadTimeVariabilityPlaceholderValue = '__none__';
export const customLeadTimeVariabilityValue = '__custom__';

export function shouldShowLeadTimeVariabilityPlaceholder(
  value: SenaLeadTimeVariabilityClass | '',
) {
  return value === '';
}
