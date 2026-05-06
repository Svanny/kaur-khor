import type { AppCurrency, AppLanguage } from '@shared/inventory';
import { kmUiCopy, translateEnglishLiteralToKhmer } from './km-ui-copy';
import { activeEnUiCopy, enUiCopyV1 } from './ui-copy-map';

export type TranslationKey = keyof typeof enUiCopyV1;
export type TranslationVariables = Record<string, string | number | null | undefined>;

export const translations: Record<AppLanguage, Partial<Record<TranslationKey, string>>> = {
  en: activeEnUiCopy as Partial<Record<TranslationKey, string>>,
  km: kmUiCopy,
};

export function getTranslation(
  language: AppLanguage,
  key: TranslationKey,
  variables?: TranslationVariables,
): string {
  const template = translations[language][key] ?? activeEnUiCopy[key] ?? String(key);
  return interpolateTranslation(template, variables);
}

export function translateUiLiteral(
  language: AppLanguage,
  englishTemplate: string,
  variables?: TranslationVariables,
): string {
  const template =
    language === 'km' ? translateEnglishLiteralToKhmer(englishTemplate) : englishTemplate;
  return interpolateTranslation(template, variables);
}

function interpolateTranslation(template: string, variables?: TranslationVariables): string {
  if (!variables) {
    return template;
  }

  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (_, variableName: string) => {
    const value = variables[variableName];
    return value == null ? `{${variableName}}` : String(value);
  });
}

export function currencyLabel(language: AppLanguage, currency: AppCurrency): string {
  return getTranslation(language, currency === 'KHR' ? 'currencyKhr' : 'currencyUsd');
}
