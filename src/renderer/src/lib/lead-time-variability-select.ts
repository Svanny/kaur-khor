import type { SenaLeadTimeVariabilityClass } from '@shared/sena';

export const leadTimeVariabilityPlaceholderValue = '__none__';

export function shouldShowLeadTimeVariabilityPlaceholder(
  value: SenaLeadTimeVariabilityClass | '',
) {
  return value === '';
}
