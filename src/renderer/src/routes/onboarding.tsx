import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import type { AppCurrency, AppLanguage } from '@shared/inventory';
import { DEFAULT_DESKTOP_SEEN_UNLOCKED_NAV_ITEMS } from '@shared/ipc';
import {
  getInterfaceVisibilityForPreset,
  isPresetViewMode,
  type InterfaceViewMode,
} from '@shared/interface-view';
import { ActionContinueIcon } from '@icons/actions';
import { NavigationBackIcon } from '@icons/navigation';
import { InterfaceViewModeCards } from '@/components/system/interface-view-cards';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { translateUiLiteral } from '@/lib/translations';
import { cn } from '@/lib/utils';
import { usePreferences } from '@/state/preferences';

const selectTriggerClassName =
  'h-14 w-full rounded-2xl border border-border bg-background px-4 text-base shadow-none data-[size=default]:h-14';
const onboardingCopyEnglishAnimationName = 'kaur-khor-onboarding-copy-english';
const onboardingCopyKhmerAnimationName = 'kaur-khor-onboarding-copy-khmer';
const onboardingCopyCycleMs = 9000;
type OnboardingStep = 'preferences' | 'interface';

function onboardingCopy(englishText: string) {
  const khmerByEnglishText: Record<string, string> = {
    Welcome: 'សូមស្វាគមន៍',
    'Set up Kaur Khor': 'រៀបចំ កខ',
    'Choose the basic language and currency first. You can fine-tune individual controls later in Settings.':
      'ជ្រើសរើសភាសា និងរូបិយប័ណ្ណមូលដ្ឋានជាមុនសិន។ អ្នកអាចកែសម្រួលការគ្រប់គ្រងនីមួយៗនៅពេលក្រោយក្នុងការកំណត់។',
    'Choose interface view': 'ជ្រើសរើសទិដ្ឋភាពចំណុចប្រទាក់',
    'Pick how much guidance and status detail Kaur Khor keeps visible in your workspace.':
      'ជ្រើសរើសថាតើ កខ ត្រូវបង្ហាញការណែនាំ និងសេចក្តីលម្អិតស្ថានភាពច្រើនប៉ុណ្ណានៅក្នុងកន្លែងធ្វើការ។',
    Language: 'ភាសា',
    Currency: 'រូបិយប័ណ្ណ',
    'Interface view': 'ទិដ្ឋភាពចំណុចប្រទាក់',
    Back: 'ត្រឡប់ក្រោយ',
    Continue: 'បន្ត',
    'Could not save setup. Check the app connection and try again.':
      'មិនអាចរក្សាទុកការរៀបចំបានទេ។ ពិនិត្យការតភ្ជាប់អេប ហើយព្យាយាមម្តងទៀត។',
  };

  return {
    en: englishText,
    km: khmerByEnglishText[englishText] ?? translateUiLiteral('km', englishText),
  } satisfies Record<AppLanguage, string>;
}

function OptionPrefixLabel({
  fixedPrefixWidth = false,
  language,
  prefix,
  label,
}: {
  fixedPrefixWidth?: boolean;
  language: AppLanguage;
  prefix: string;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-3">
      <span
        className={cn(
          'text-xs font-semibold text-muted-foreground',
          language === 'km' ? 'tracking-normal' : 'font-mono uppercase tracking-[0.18em]',
          fixedPrefixWidth ? 'w-4 shrink-0 text-left' : null,
        )}
      >
        {prefix}
      </span>
      <span>{label}</span>
    </span>
  );
}

function CyclingOnboardingCopy({
  className,
  english,
  khmer,
  itemClassName,
  khmerItemClassName,
  reducedMotion = false,
  reserveWidthFor,
  stableLanguage,
}: {
  className?: string;
  english: ReactNode;
  khmer: ReactNode;
  itemClassName?: string;
  khmerItemClassName?: string;
  reducedMotion?: boolean;
  reserveWidthFor?: ReactNode[];
  stableLanguage: AppLanguage;
}) {
  const itemClassNames = cn('flex h-full items-center will-change-transform', itemClassName);
  const stableContent = stableLanguage === 'km' ? khmer : english;
  const stableBaseClassName = cn('flex h-full items-center', itemClassName);
  const stableClassName = stableLanguage === 'km'
    ? cn(stableBaseClassName, 'normal-case tracking-normal', khmerItemClassName)
    : stableBaseClassName;

  if (reducedMotion) {
    return (
      <span aria-hidden="true" className={cn('relative grid overflow-hidden', className)}>
        <span className={stableClassName}>
          {stableContent}
        </span>
      </span>
    );
  }

  return (
    <span aria-hidden="true" className={cn('relative grid overflow-hidden', className)}>
      {reserveWidthFor?.map((reservedContent, index) => (
        <span
          key={`reserved-${index}`}
          className={cn('invisible col-start-1 row-start-1', itemClassNames)}
        >
          {reservedContent}
        </span>
      ))}
      <span className="relative col-start-1 row-start-1 block h-full overflow-hidden">
        <span
          className={cn('absolute inset-0', itemClassNames)}
          style={{
            animation: `${onboardingCopyEnglishAnimationName} ${onboardingCopyCycleMs}ms linear infinite`,
          }}
        >
          {english}
        </span>
        <span
          className={cn('absolute inset-0', itemClassNames, 'normal-case tracking-normal', khmerItemClassName)}
          style={{
            animation: `${onboardingCopyKhmerAnimationName} ${onboardingCopyCycleMs}ms linear infinite`,
          }}
        >
          {khmer}
        </span>
      </span>
    </span>
  );
}

function LocalizedOnboardingCopy({
  className,
  copy,
  language,
}: {
  className?: string;
  copy: Record<AppLanguage, string>;
  language: AppLanguage;
}) {
  return <span className={className}>{copy[language]}</span>;
}

function getPrefersReducedMotion() {
  return typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(getPrefersReducedMotion);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = () => {
      setPrefersReducedMotion(mediaQuery.matches);
    };

    handleChange();

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
      return () => {
        mediaQuery.removeEventListener('change', handleChange);
      };
    }

    mediaQuery.addListener(handleChange);
    return () => {
      mediaQuery.removeListener(handleChange);
    };
  }, []);

  return prefersReducedMotion;
}

export function OnboardingRoute({ allowCompleted = false }: { allowCompleted?: boolean } = {}) {
  const navigate = useNavigate();
  const {
    currency,
    isHydrated,
    language,
    onboardingCompletedAt,
    savePreferences,
  } = usePreferences();
  const [selectedLanguage, setSelectedLanguage] = useState<AppLanguage>(language);
  const [selectedCurrency, setSelectedCurrency] = useState<AppCurrency>(currency);
  const [selectedViewMode, setSelectedViewMode] = useState<InterfaceViewMode>('default');
  const [step, setStep] = useState<OnboardingStep>('preferences');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const seededPreferencesRef = useRef(false);
  const prefersReducedMotion = usePrefersReducedMotion();
  const copy = useMemo(() => ({
    welcome: onboardingCopy('Welcome'),
    preferencesTitle: onboardingCopy('Set up Kaur Khor'),
    preferencesDescription: onboardingCopy(
      'Choose the basic language and currency first. You can fine-tune individual controls later in Settings.',
    ),
    interfaceTitle: onboardingCopy('Choose interface view'),
    interfaceDescription: onboardingCopy(
      'Pick how much guidance and status detail Kaur Khor keeps visible in your workspace.',
    ),
    language: onboardingCopy('Language'),
    currency: onboardingCopy('Currency'),
    english: onboardingCopy('English'),
    khmer: onboardingCopy('Khmer'),
    interfaceView: onboardingCopy('Interface view'),
    back: onboardingCopy('Back'),
    continue: onboardingCopy('Continue'),
    saveError: onboardingCopy('Could not save setup. Check the app connection and try again.'),
  }), []);
  const activeTitle = step === 'preferences' ? copy.preferencesTitle : copy.interfaceTitle;
  const activeDescription = step === 'preferences' ? copy.preferencesDescription : copy.interfaceDescription;
  const interfaceLanguage = selectedLanguage;

  useEffect(() => {
    if (!isHydrated || seededPreferencesRef.current) {
      return;
    }

    setSelectedLanguage(language);
    setSelectedCurrency(currency);
    seededPreferencesRef.current = true;
  }, [currency, isHydrated, language]);

  if (!isHydrated) {
    return (
      <div className="flex min-h-svh items-center justify-center px-6">
        <div className="hero-mesh editorial-panel w-full max-w-md rounded-[32px] p-8 text-center">
          <p className="text-base font-semibold leading-none tracking-normal text-primary/80">
            KAUR KHOR
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
            {translateUiLiteral(language, 'Loading preferences…')}
          </h1>
        </div>
      </div>
    );
  }

  if (onboardingCompletedAt && !allowCompleted) {
    return <Navigate replace to="/" />;
  }

  async function handleContinue() {
    if (step === 'preferences') {
      setSaveError(false);
      setStep('interface');
      return;
    }

    setSaveError(false);
    setIsSaving(true);
    try {
      const selectedVisibility = getInterfaceVisibilityForPreset(
        isPresetViewMode(selectedViewMode) ? selectedViewMode : 'default',
      );
      await savePreferences({
        language: selectedLanguage,
        currency: selectedCurrency,
        displayViewMode: selectedViewMode,
        ...selectedVisibility,
        customShowExplanatoryTooltips: selectedVisibility.showExplanatoryTooltips,
        customShowFloatingTitleActions: selectedVisibility.showFloatingTitleActions,
        customShowRightRailCards: selectedVisibility.showRightRailCards,
        customShowOverviewTaskTabs: selectedVisibility.showOverviewTaskTabs,
        customShowAutomationsPage: selectedVisibility.showAutomationsPage,
        customShowAnalysisPage: selectedVisibility.showAnalysisPage,
        customShowPerformanceCompareToggle: selectedVisibility.showPerformanceCompareToggle,
        customShowPerformanceTimelineCard: selectedVisibility.showPerformanceTimelineCard,
        customShowLogsViewToggle: selectedVisibility.showLogsViewToggle,
        customShowHeartbeatRibbons: selectedVisibility.showHeartbeatRibbons,
        onboardingCompletedAt: new Date().toISOString(),
        seenUnlockedNavItems: DEFAULT_DESKTOP_SEEN_UNLOCKED_NAV_ITEMS,
      });
      navigate('/', { replace: true });
    } catch {
      setSaveError(true);
    } finally {
      setIsSaving(false);
    }
  }

  function handleBack() {
    setSaveError(false);
    setStep('preferences');
  }

  return (
    <div className="flex min-h-svh items-center justify-center px-6 py-10">
      <div className="hero-mesh editorial-panel w-full max-w-4xl rounded-[2rem] p-8 md:p-10">
        <style>{`
          @keyframes ${onboardingCopyEnglishAnimationName} {
            0%, 44% {
              transform: translateY(0%);
              animation-timing-function: ease-in;
            }
            46.5%, 96.5% {
              transform: translateY(-125%);
              animation-timing-function: step-end;
            }
            96.51% {
              transform: translateY(125%);
              animation-timing-function: ease-out;
            }
            100% {
              transform: translateY(0%);
            }
          }
          @keyframes ${onboardingCopyKhmerAnimationName} {
            0%, 46.5% {
              transform: translateY(125%);
              animation-timing-function: ease-out;
            }
            49.5%, 94% {
              transform: translateY(0%);
              animation-timing-function: ease-in;
            }
            96.5%, 100% {
              transform: translateY(-125%);
            }
          }
        `}</style>
        <p
          aria-label={step === 'preferences' ? copy.welcome[selectedLanguage] : copy.welcome[interfaceLanguage]}
          className={cn(
            'text-xs font-semibold text-primary/80',
            (step === 'preferences' ? selectedLanguage : interfaceLanguage) === 'km'
              ? 'tracking-normal'
              : 'uppercase tracking-[0.24em]',
          )}
        >
          {step === 'preferences' ? (
            <CyclingOnboardingCopy
              className="h-[1.35rem]"
              english={copy.welcome.en}
              itemClassName="uppercase tracking-[0.24em]"
              khmer={copy.welcome.km}
              reducedMotion={prefersReducedMotion}
              stableLanguage={selectedLanguage}
            />
          ) : (
            <LocalizedOnboardingCopy
              className="block h-[1.35rem]"
              copy={copy.welcome}
              language={interfaceLanguage}
            />
          )}
        </p>
        <h1
          aria-label={step === 'preferences' ? activeTitle[selectedLanguage] : activeTitle[interfaceLanguage]}
          className={cn(
            'mt-3 text-4xl font-semibold text-foreground',
            (step === 'preferences' ? selectedLanguage : interfaceLanguage) === 'km'
              ? 'tracking-normal'
              : 'tracking-[-0.05em]',
          )}
        >
          {step === 'preferences' ? (
            <CyclingOnboardingCopy
              className="h-[3.25rem] md:h-[3.6rem]"
              english={activeTitle.en}
              itemClassName="text-balance"
              khmer={activeTitle.km}
              reducedMotion={prefersReducedMotion}
              stableLanguage={selectedLanguage}
            />
          ) : (
            <LocalizedOnboardingCopy
              className="block text-balance"
              copy={activeTitle}
              language={interfaceLanguage}
            />
          )}
        </h1>
        <p aria-label={step === 'preferences' ? activeDescription[selectedLanguage] : activeDescription[interfaceLanguage]} className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">
          {step === 'preferences' ? (
            <CyclingOnboardingCopy
              className="h-[5.5rem] md:h-[4rem]"
              english={activeDescription.en}
              itemClassName="items-start"
              khmer={activeDescription.km}
              reducedMotion={prefersReducedMotion}
              stableLanguage={selectedLanguage}
            />
          ) : (
            <LocalizedOnboardingCopy
              className="block"
              copy={activeDescription}
              language={interfaceLanguage}
            />
          )}
        </p>

        {step === 'preferences' ? (
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            <div className="grid gap-2">
              <label aria-label={copy.language[selectedLanguage]} className="text-sm font-semibold text-foreground" htmlFor="onboarding-language">
                <CyclingOnboardingCopy
                  className="h-[1.6rem]"
                  english={copy.language.en}
                  khmer={copy.language.km}
                  reducedMotion={prefersReducedMotion}
                  stableLanguage={selectedLanguage}
                />
              </label>
              <Select value={selectedLanguage} onValueChange={(value) => setSelectedLanguage(value as AppLanguage)}>
                <SelectTrigger id="onboarding-language" className={selectTriggerClassName} aria-label={copy.language[selectedLanguage]}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">
                    <OptionPrefixLabel language={selectedLanguage} prefix={selectedLanguage === 'km' ? 'អង់' : 'abc'} label={copy.english[selectedLanguage]} />
                  </SelectItem>
                  <SelectItem value="km">
                    <OptionPrefixLabel language={selectedLanguage} prefix="កខគ" label={copy.khmer[selectedLanguage]} />
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <label aria-label={copy.currency[selectedLanguage]} className="text-sm font-semibold text-foreground" htmlFor="onboarding-currency">
                <CyclingOnboardingCopy
                  className="h-[1.6rem]"
                  english={copy.currency.en}
                  khmer={copy.currency.km}
                  reducedMotion={prefersReducedMotion}
                  stableLanguage={selectedLanguage}
                />
              </label>
              <Select value={selectedCurrency} onValueChange={(value) => setSelectedCurrency(value as AppCurrency)}>
                <SelectTrigger id="onboarding-currency" className={selectTriggerClassName} aria-label={copy.currency[selectedLanguage]}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">
                    <OptionPrefixLabel fixedPrefixWidth language={selectedLanguage} prefix="$" label="USD" />
                  </SelectItem>
                  <SelectItem value="KHR">
                    <OptionPrefixLabel fixedPrefixWidth language={selectedLanguage} prefix="៛" label="KHR" />
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        ) : (
          <div className="mt-8 grid gap-3">
            <p aria-label={copy.interfaceView[interfaceLanguage]} className="text-sm font-semibold text-foreground">
              <LocalizedOnboardingCopy
                className="block h-[1.6rem]"
                copy={copy.interfaceView}
                language={interfaceLanguage}
              />
            </p>
            <InterfaceViewModeCards
              displayViewMode={selectedViewMode}
              language={selectedLanguage}
              modes={['default', 'minimal', 'maximal']}
              onDisplayViewModeChange={setSelectedViewMode}
            />
          </div>
        )}

        {saveError ? (
          <p className="mt-6 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive" role="alert">
            {copy.saveError[interfaceLanguage]}
          </p>
        ) : null}

        <div className="mt-8 flex items-center justify-between">
          {step === 'interface' ? (
            <Button
              className="inline-grid w-fit min-w-0 grid-cols-[auto_auto] items-center gap-2 px-5"
              disabled={isSaving}
              type="button"
              variant="outline"
              aria-label={copy.back[interfaceLanguage]}
              onClick={handleBack}
            >
              <NavigationBackIcon className="size-4" />
              <LocalizedOnboardingCopy
                className="block h-[1.35rem]"
                copy={copy.back}
                language={interfaceLanguage}
              />
            </Button>
          ) : (
            <span />
          )}
          <Button
            className="inline-grid w-fit min-w-0 grid-cols-[auto_auto] items-center gap-2 px-5"
            disabled={isSaving}
            type="button"
            aria-label={isSaving ? translateUiLiteral(selectedLanguage, 'Saving') : step === 'preferences' ? copy.continue[selectedLanguage] : copy.continue[interfaceLanguage]}
            onClick={handleContinue}
          >
            {isSaving ? (
              translateUiLiteral(selectedLanguage, 'Saving…')
            ) : step === 'preferences' ? (
              <>
                <CyclingOnboardingCopy
                  className="h-[1.35rem]"
                  english={copy.continue.en}
                  itemClassName="justify-center"
                  khmer={copy.continue.km}
                  reducedMotion={prefersReducedMotion}
                  reserveWidthFor={[copy.continue.en, copy.continue.km]}
                  stableLanguage={selectedLanguage}
                />
                <ActionContinueIcon className="size-4" />
              </>
            ) : (
              <>
                <LocalizedOnboardingCopy
                  className="block h-[1.35rem]"
                  copy={copy.continue}
                  language={interfaceLanguage}
                />
                <ActionContinueIcon className="size-4" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
