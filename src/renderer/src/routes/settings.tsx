import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BriefcaseBusiness,
  ChevronDown,
  ChevronUp,
  Copy,
  FileSpreadsheet,
  FolderOpen,
  Heart,
  Package,
} from 'lucide-react';
import type { DesktopLocalDataInfo } from '@shared/ipc';
import type { AppCurrency, AppLanguage } from '@shared/inventory';
import { DescriptionText } from '@/components/system/description-text';
import { WorkspacePage, WorkspacePanel } from '@/components/system/workspace';
import { Button } from '@/components/ui/button';
import { Field, FieldContent, FieldGroup, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useRouteLeaveConfirm } from '@/hooks/use-route-leave-confirm';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';

function SettingsFieldLabel({
  htmlFor,
  label,
}: {
  htmlFor: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 md:basis-56 md:shrink-0">
      <FieldLabel className="w-auto" htmlFor={htmlFor}>
        {label}
      </FieldLabel>
    </div>
  );
}

export function SettingsRoute() {
  const { isSaving } = useInventory();
  const {
    currency,
    currencyLabel,
    hasPendingChanges,
    language,
    resetPreferences,
    savePreferences,
    setCurrency,
    setLanguage,
    t,
  } = usePreferences();

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [preferencesError, setPreferencesError] = useState<string | null>(null);
  const [preferencesSaved, setPreferencesSaved] = useState(false);
  const [localDataInfo, setLocalDataInfo] = useState<DesktopLocalDataInfo | null>(null);
  const [localDataError, setLocalDataError] = useState<string | null>(null);
  const [localDataStatus, setLocalDataStatus] = useState<string | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exportMenuPosition, setExportMenuPosition] = useState<{
    left: number;
    top: number;
    width: number;
  } | null>(null);
  const exportMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    void window.banjiDesktop.system
      .getLocalDataInfo()
      .then((info) => {
        if (cancelled) {
          return;
        }
        setLocalDataInfo(info);
        setLocalDataError(null);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setLocalDataError(error instanceof Error ? error.message : t('apiUnavailable'));
      });

    return () => {
      cancelled = true;
    };
  }, [t]);

  useEffect(() => {
    if (!exportMenuOpen) {
      return;
    }

    const menuWidth = 320;
    const viewportMargin = 12;
    const menuGap = 8;

    function positionExportMenu() {
      const button = exportMenuButtonRef.current;
      if (!button) {
        return;
      }

      const buttonRect = button.getBoundingClientRect();
      const measuredHeight = exportMenuRef.current?.offsetHeight ?? 168;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const fitsBelow =
        buttonRect.bottom + menuGap + measuredHeight <= viewportHeight - viewportMargin;
      const fitsAbove =
        buttonRect.top - menuGap - measuredHeight >= viewportMargin;
      const width = Math.min(menuWidth, Math.max(240, viewportWidth - viewportMargin * 2));
      const left = Math.min(
        Math.max(viewportMargin, buttonRect.right - width),
        viewportWidth - width - viewportMargin,
      );
      const top =
        fitsBelow || !fitsAbove
          ? Math.min(
              buttonRect.bottom + menuGap,
              viewportHeight - measuredHeight - viewportMargin,
            )
          : Math.max(viewportMargin, buttonRect.top - measuredHeight - menuGap);

      setExportMenuPosition({ left, top, width });
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (
        target &&
        (exportMenuRef.current?.contains(target) ||
          exportMenuButtonRef.current?.contains(target))
      ) {
        return;
      }
      setExportMenuOpen(false);
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setExportMenuOpen(false);
      }
    }

    positionExportMenu();
    window.addEventListener('resize', positionExportMenu);
    window.addEventListener('scroll', positionExportMenu, true);
    window.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('resize', positionExportMenu);
      window.removeEventListener('scroll', positionExportMenu, true);
      window.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [exportMenuOpen]);

  const pageStatus = useMemo(() => {
    if (preferencesError) {
      return { tone: 'destructive' as const, message: preferencesError };
    }
    if (preferencesSaved) {
      return { tone: 'muted' as const, message: t('settingsSaveSuccess') };
    }
    return null;
  }, [preferencesError, preferencesSaved, t]);

  useRouteLeaveConfirm({
    enabled: hasPendingChanges,
    message: t('settingsUnsavedLeavePrompt'),
    onDiscard: () => {
      resetPreferences();
      setPreferencesError(null);
      setPreferencesSaved(false);
    },
  });

  async function handleSave() {
    setPreferencesSaved(false);
    setPreferencesError(null);

    if (!hasPendingChanges) {
      return;
    }

    try {
      await savePreferences();
      setPreferencesSaved(true);
    } catch (error) {
      setPreferencesError(error instanceof Error ? error.message : t('apiUnavailable'));
    }
  }

  function handleReset() {
    resetPreferences();
    setPreferencesError(null);
    setPreferencesSaved(false);
  }

  async function handleOpenLocalDataFolder() {
    setLocalDataError(null);
    setLocalDataStatus(null);
    try {
      await window.banjiDesktop.system.openLocalDataFolder();
    } catch (error) {
      setLocalDataError(error instanceof Error ? error.message : t('apiUnavailable'));
    }
  }

  async function handleCopyDataPath() {
    if (!localDataInfo) {
      return;
    }

    setLocalDataError(null);
    setLocalDataStatus(null);
    try {
      await navigator.clipboard.writeText(localDataInfo.dataDirectoryPath);
      setLocalDataStatus(t('settingsLocalDataCopied'));
    } catch (error) {
      setLocalDataError(error instanceof Error ? error.message : t('apiUnavailable'));
    }
  }

  async function handleExportCsv(
    exportAction: () => Promise<{ path: string } | null>,
    label: string,
  ) {
    setLocalDataError(null);
    setLocalDataStatus(null);
    try {
      const result = await exportAction();
      if (!result) {
        return;
      }
      setExportMenuOpen(false);
      setLocalDataStatus(`${t('settingsLocalDataExportSuccessPrefix')} ${label}: ${result.path}`);
    } catch (error) {
      setLocalDataError(error instanceof Error ? error.message : t('apiUnavailable'));
    }
  }

  return (
    <WorkspacePage>
      <WorkspacePanel>
        {pageStatus ? (
          <p
            className={cn(
              'text-sm',
              pageStatus.tone === 'destructive' ? 'text-destructive' : 'text-muted-foreground',
            )}
            data-testid="settings-save-status"
          >
            {pageStatus.message}
          </p>
        ) : null}

        <section className="space-y-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-heading text-base font-medium tracking-[-0.02em]">
                  {t('settingsWorkspacePreferencesTitle')}
                </h3>
                {hasPendingChanges ? (
                  <span
                    className="text-sm text-muted-foreground"
                    data-testid="settings-dirty-summary"
                  >
                    (changed)
                  </span>
                ) : null}
              </div>
              <DescriptionText className="max-w-2xl text-sm leading-6 text-muted-foreground">
                {t('settingsWorkspacePreferencesDescription')}
              </DescriptionText>
            </div>
            <div className="flex flex-wrap items-center gap-3 lg:shrink-0">
              <Button
                disabled={!hasPendingChanges || isSaving}
                type="button"
                variant="outline"
                onClick={handleReset}
              >
                {t('settingsResetAction')}
              </Button>
              <Button
                disabled={!hasPendingChanges || isSaving}
                type="button"
                onClick={() => void handleSave()}
              >
                {t('saveDraft')}
              </Button>
            </div>
          </div>
          <FieldGroup>
            <Field orientation="responsive">
              <SettingsFieldLabel htmlFor="language-select" label={t('settingsLanguage')} />
              <FieldContent className="md:max-w-md">
                <Select
                  value={language}
                  onValueChange={(value) => {
                    setPreferencesSaved(false);
                    setPreferencesError(null);
                    setLanguage(value as AppLanguage);
                  }}
                >
                  <SelectTrigger className="w-full rounded-2xl bg-background/60" id="language-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="en">{t('languageEnglish')}</SelectItem>
                      <SelectItem value="km">{t('languageKhmer')}</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>

            <Field orientation="responsive">
              <SettingsFieldLabel htmlFor="currency-select" label={t('settingsCurrency')} />
              <FieldContent className="md:max-w-md">
                <Select
                  value={currency}
                  onValueChange={(value) => {
                    setPreferencesSaved(false);
                    setPreferencesError(null);
                    setCurrency(value as AppCurrency);
                  }}
                >
                  <SelectTrigger className="w-full rounded-2xl bg-background/60" id="currency-select">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="USD">{currencyLabel('USD')}</SelectItem>
                      <SelectItem value="KHR">{currencyLabel('KHR')}</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>
          </FieldGroup>
        </section>

        <section className="space-y-4">
          <div className="rounded-3xl border border-border/70 bg-card/55 p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h3 className="font-heading text-base font-medium tracking-[-0.02em]">
                {t('settingsAdvancedTitle')}
              </h3>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setAdvancedOpen((current) => !current);
                  setExportMenuOpen(false);
                }}
              >
                {advancedOpen ? t('settingsAdvancedHide') : t('settingsAdvancedShow')}
                {advancedOpen ? <ChevronUp /> : <ChevronDown />}
              </Button>
            </div>

            {advancedOpen ? (
              <div className="mt-5 border-t border-border/50 pt-4">
                <section className="space-y-4">
                  <div className="space-y-2">
                    <h4 className="font-heading text-sm font-medium tracking-[-0.02em]">
                      {t('settingsLocalDataTitle')}
                    </h4>
                    <DescriptionText className="max-w-2xl text-sm leading-6 text-muted-foreground">
                      {t('settingsLocalDataDescription')}
                    </DescriptionText>
                  </div>

                  {localDataStatus ? (
                    <p className="text-sm text-muted-foreground" data-testid="settings-local-data-status">
                      {localDataStatus}
                    </p>
                  ) : null}
                  {localDataError ? (
                    <p className="text-sm text-destructive" data-testid="settings-local-data-error">
                      {localDataError}
                    </p>
                  ) : null}

                  {localDataInfo ? (
                    <div className="space-y-3 text-sm">
                      <div className="space-y-1">
                        <p className="font-medium text-foreground">{t('settingsLocalDataFolderLabel')}</p>
                        <p className="break-all text-muted-foreground">{localDataInfo.dataDirectoryPath}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="font-medium text-foreground">{t('settingsLocalDataRawFiles')}</p>
                        <ul className="space-y-1 text-muted-foreground">
                          <li>{localDataInfo.inventoryStorePath}</li>
                          <li>{localDataInfo.preferencesPath}</li>
                        </ul>
                      </div>
                      <p className="text-muted-foreground">{t('settingsLocalDataRawFormatNote')}</p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t('overviewLoading')}</p>
                  )}

                  <div className="flex flex-wrap gap-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => void handleOpenLocalDataFolder()}
                    >
                      <FolderOpen />
                      {t('settingsOpenDataFolder')}
                    </Button>
                    <Button
                      disabled={!localDataInfo}
                      type="button"
                      variant="outline"
                      onClick={() => void handleCopyDataPath()}
                    >
                      <Copy />
                      {t('settingsCopyDataPath')}
                    </Button>
                    <div className="relative">
                      <Button
                        aria-expanded={exportMenuOpen}
                        aria-haspopup="menu"
                        ref={exportMenuButtonRef}
                        type="button"
                        variant="outline"
                        onClick={() => setExportMenuOpen((current) => !current)}
                      >
                        <FileSpreadsheet />
                        {t('settingsExportData')}
                        <ChevronDown />
                      </Button>
                    </div>
                  </div>
                </section>
              </div>
            ) : null}
          </div>
        </section>

        <section className="space-y-4">
          <div className="rounded-3xl border border-border/70 bg-card/55 p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h3 className="font-heading text-base font-medium tracking-[-0.02em]">
                Credits
              </h3>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setCreditsOpen((current) => !current)}
              >
                {creditsOpen ? 'Hide credits' : 'Show credits'}
                {creditsOpen ? <ChevronUp /> : <ChevronDown />}
              </Button>
            </div>

            {creditsOpen ? (
              <div className="mt-5 border-t border-border/50 pt-4">
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>Made with</span>
                  <Heart aria-hidden="true" className="size-4 fill-current text-rose-500" />
                  <span>by Monysovann Ly.</span>
                </p>
              </div>
            ) : null}
          </div>
        </section>
      </WorkspacePanel>
      {exportMenuOpen && exportMenuPosition
        ? createPortal(
            <div
              aria-label={t('settingsExportData')}
              className="fixed z-50 rounded-2xl border border-border/70 bg-background p-2 shadow-lg"
              ref={exportMenuRef}
              role="menu"
              style={{
                left: exportMenuPosition.left,
                top: exportMenuPosition.top,
                width: exportMenuPosition.width,
              }}
            >
              <button
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-accent/60"
                role="menuitem"
                type="button"
                onClick={() =>
                  void handleExportCsv(
                    () => window.banjiDesktop.system.exportSkusCsv(),
                    t('catalogResultSkuPlural'),
                  )
                }
              >
                <Package className="size-4" />
                <span>{t('settingsExportSkusCsv')}</span>
              </button>
              <button
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-accent/60"
                role="menuitem"
                type="button"
                onClick={() =>
                  void handleExportCsv(
                    () => window.banjiDesktop.system.exportServicesCsv(),
                    t('catalogResultServicePlural'),
                  )
                }
              >
                <BriefcaseBusiness className="size-4" />
                <span>{t('settingsExportServicesCsv')}</span>
              </button>
              <button
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-accent/60"
                role="menuitem"
                type="button"
                onClick={() =>
                  void handleExportCsv(
                    () => window.banjiDesktop.system.exportStockReportsCsv(),
                    t('operationsHistoryTitle'),
                  )
                }
              >
                <FileSpreadsheet className="size-4" />
                <span>{t('settingsExportStockReportsCsv')}</span>
              </button>
            </div>,
            document.body,
          )
        : null}
    </WorkspacePage>
  );
}
