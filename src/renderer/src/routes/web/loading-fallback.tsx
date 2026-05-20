import type { AppLanguage } from '@shared/inventory';
import { translateUiLiteral } from '@/lib/translations';

type WebLoadingFallbackProps = {
  embeddedMode: boolean;
  language: AppLanguage;
};

export function webLoadingFallbackTitle(embeddedMode: boolean, language: AppLanguage) {
  return translateUiLiteral(language, embeddedMode ? 'Loading workspace…' : 'Loading preferences…');
}

export function WebLoadingFallback({ embeddedMode, language }: WebLoadingFallbackProps) {
  return (
    <div className="grid min-h-svh place-items-center bg-background px-6 text-center text-foreground">
      <div>
        <p className="text-sm font-semibold text-primary">{translateUiLiteral(language, 'KAUR KHOR')}</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-normal">
          {webLoadingFallbackTitle(embeddedMode, language)}
        </h1>
      </div>
    </div>
  );
}
