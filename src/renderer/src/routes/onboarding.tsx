import { type ReactNode, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import type { AppCurrency, AppLanguage } from '@shared/inventory';
import { DEFAULT_DESKTOP_SEEN_UNLOCKED_NAV_ITEMS } from '@shared/ipc';
import { ActionContinueIcon } from '@icons/actions';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { translateUiLiteral } from '@/lib/translations';
import { cn } from '@/lib/utils';
import { usePreferences } from '@/state/preferences';

const selectTriggerClassName =
  'h-14 w-full rounded-2xl border border-border bg-background px-4 text-base shadow-none data-[size=default]:h-14';
const onboardingCopyEnglishAnimationName = 'banji-onboarding-copy-english';
const onboardingCopyKhmerAnimationName = 'banji-onboarding-copy-khmer';
const onboardingCopyCycleMs = 9000;

function onboardingCopy(englishText: string) {
  const khmerByEnglishText: Record<string, string> = {
    Welcome: 'សូមស្វាគមន៍',
    'Set up banji': 'រៀបចំ បញ្ជី',
    'Choose the basic language and currency first. banji will start in Custom View with extra guidance and floating title actions turned on.':
      'ជ្រើសរើសភាសា និងរូបិយប័ណ្ណមូលដ្ឋានជាមុនសិន។ បញ្ជី នឹងចាប់ផ្តើមក្នុងទិដ្ឋភាពផ្ទាល់ខ្លួន ដោយបើកការណែនាំបន្ថែម និងសកម្មភាពចំណងជើងអណ្តែត។',
    Language: 'ភាសា',
    Currency: 'រូបិយប័ណ្ណ',
    Continue: 'បន្ត',
  };

  return {
    en: englishText,
    km: khmerByEnglishText[englishText] ?? translateUiLiteral('km', englishText),
  } satisfies Record<AppLanguage, string>;
}

function OptionPrefixLabel({
  prefix,
  label,
}: {
  prefix: string;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-3">
      <span className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
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
  reserveWidthFor,
}: {
  className?: string;
  english: ReactNode;
  khmer: ReactNode;
  itemClassName?: string;
  reserveWidthFor?: ReactNode[];
}) {
  const itemClassNames = cn('flex h-full items-center will-change-transform', itemClassName);

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
          className={cn('absolute inset-0', itemClassNames, 'normal-case tracking-normal')}
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

export function OnboardingRoute() {
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
  const [isSaving, setIsSaving] = useState(false);
  const copy = useMemo(() => ({
    welcome: onboardingCopy('Welcome'),
    title: onboardingCopy('Set up banji'),
    description: onboardingCopy(
      'Choose the basic language and currency first. banji will start in Custom View with extra guidance and floating title actions turned on.',
    ),
    language: onboardingCopy('Language'),
    currency: onboardingCopy('Currency'),
    continue: onboardingCopy('Continue'),
  }), []);

  if (!isHydrated) {
    return (
      <div className="flex min-h-svh items-center justify-center px-6">
        <div className="hero-mesh editorial-panel w-full max-w-md rounded-[32px] p-8 text-center">
          <p className="text-base font-semibold leading-none tracking-normal text-primary/80">
            banji
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
            {translateUiLiteral(language, 'Loading preferences…')}
          </h1>
        </div>
      </div>
    );
  }

  if (onboardingCompletedAt) {
    return <Navigate replace to="/" />;
  }

  async function handleContinue() {
    setIsSaving(true);
    try {
      await savePreferences({
        language: selectedLanguage,
        currency: selectedCurrency,
        displayViewMode: 'custom',
        showExplanatoryTooltips: true,
        showFloatingTitleActions: true,
        showRightRailCards: false,
        showOverviewTaskTabs: false,
        showAutomationsPage: false,
        showAnalysisPage: false,
        showPerformanceCompareToggle: false,
        showPerformanceTimelineCard: false,
        showLogsViewToggle: false,
        showHeartbeatRibbons: false,
        customShowExplanatoryTooltips: true,
        customShowFloatingTitleActions: true,
        customShowRightRailCards: false,
        customShowOverviewTaskTabs: false,
        customShowAutomationsPage: false,
        customShowAnalysisPage: false,
        customShowPerformanceCompareToggle: false,
        customShowPerformanceTimelineCard: false,
        customShowLogsViewToggle: false,
        customShowHeartbeatRibbons: false,
        onboardingCompletedAt: new Date().toISOString(),
        seenUnlockedNavItems: DEFAULT_DESKTOP_SEEN_UNLOCKED_NAV_ITEMS,
      });
      navigate('/', { replace: true });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center px-6 py-10">
      <div className="hero-mesh editorial-panel w-full max-w-2xl rounded-[2rem] p-8 md:p-10">
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
        <p aria-label={copy.welcome.en} className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/80">
          <CyclingOnboardingCopy
            className="h-[1.35rem]"
            english={copy.welcome.en}
            itemClassName="uppercase tracking-[0.24em]"
            khmer={copy.welcome.km}
          />
        </p>
        <h1 aria-label={copy.title.en} className="mt-3 text-4xl font-semibold tracking-[-0.05em] text-foreground">
          <CyclingOnboardingCopy
            className="h-[3.25rem] md:h-[3.6rem]"
            english={copy.title.en}
            itemClassName="text-balance"
            khmer={copy.title.km}
          />
        </h1>
        <p aria-label={copy.description.en} className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">
          <CyclingOnboardingCopy
            className="h-[5.5rem] md:h-[4rem]"
            english={copy.description.en}
            itemClassName="items-start"
            khmer={copy.description.km}
          />
        </p>

        <div className="mt-8 grid gap-5 md:grid-cols-2">
          <div className="grid gap-2">
            <label aria-label={copy.language.en} className="text-sm font-semibold text-foreground" htmlFor="onboarding-language">
              <CyclingOnboardingCopy
                className="h-[1.6rem]"
                english={copy.language.en}
                khmer={copy.language.km}
              />
            </label>
            <Select value={selectedLanguage} onValueChange={(value) => setSelectedLanguage(value as AppLanguage)}>
              <SelectTrigger id="onboarding-language" className={selectTriggerClassName} aria-label="Language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">
                  <OptionPrefixLabel prefix="abc" label="English" />
                </SelectItem>
                <SelectItem value="km">
                  <OptionPrefixLabel prefix="កខគ" label="Khmer" />
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <label aria-label={copy.currency.en} className="text-sm font-semibold text-foreground" htmlFor="onboarding-currency">
              <CyclingOnboardingCopy
                className="h-[1.6rem]"
                english={copy.currency.en}
                khmer={copy.currency.km}
              />
            </label>
            <Select value={selectedCurrency} onValueChange={(value) => setSelectedCurrency(value as AppCurrency)}>
              <SelectTrigger id="onboarding-currency" className={selectTriggerClassName} aria-label="Currency">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">
                  <OptionPrefixLabel prefix="$" label="USD" />
                </SelectItem>
                <SelectItem value="KHR">
                  <OptionPrefixLabel prefix="៛" label="KHR" />
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="mt-8 flex items-center justify-end">
          <Button
            className="inline-grid w-fit min-w-0 grid-cols-[auto_auto] items-center gap-2 px-5"
            disabled={isSaving}
            type="button"
            aria-label={isSaving ? 'Saving' : copy.continue.en}
            onClick={() => void handleContinue()}
          >
            {isSaving ? (
              translateUiLiteral(selectedLanguage, 'Saving…')
            ) : (
              <>
                <CyclingOnboardingCopy
                  className="h-[1.35rem]"
                  english={copy.continue.en}
                  itemClassName="justify-center"
                  khmer={copy.continue.km}
                  reserveWidthFor={[copy.continue.en, copy.continue.km]}
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
