import { useEffect, useState } from 'react';
import { BadgeHelp, ChevronDown, FolderOpen, PanelsTopLeft, PanelRight, Save } from 'lucide-react';
import type { DesktopLocalDataInfo } from '@shared/ipc';
import { CheckboxRow } from '@/components/system/checkbox-row';
import { WorkspaceActionRow, WorkspacePage, WorkspacePanel, WorkspaceTitleCard } from '@/components/system/workspace';
import { Button } from '@/components/ui/button';
import { usePreferences } from '@/state/preferences';

const selectClassName =
  'h-14 w-full appearance-none rounded-xl border border-border bg-background px-3 pr-12 text-base shadow-none outline-none';

export function SettingsRoute() {
  const {
    currency,
    hasPendingChanges,
    language,
    savePreferences,
    setCurrency,
    setLanguage,
    setShowExplanatoryTooltips,
    setShowFloatingTitleActions,
    setShowRightRailCards,
    showFloatingTitleActions,
    showRightRailCards,
    showExplanatoryTooltips,
  } = usePreferences();
  const [localDataInfo, setLocalDataInfo] = useState<DesktopLocalDataInfo | null>(null);
  const [localDataError, setLocalDataError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    window.banjiDesktop.system
      .getLocalDataInfo()
      .then((info) => {
        if (!cancelled) {
          setLocalDataInfo(info);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setLocalDataError(error instanceof Error ? error.message : 'Failed to load local workspace info.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <WorkspacePage>
      <WorkspaceTitleCard
        eyebrow="Settings"
        title="Desktop preferences"
        description="These controls tune the local Banji shell and its on-device SENA workspace storage."
      />
      <WorkspacePanel title="Preferences controls" description="These preferences affect only the local desktop shell.">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm">
            <span>Language</span>
            <div className="relative">
              <select
                className={selectClassName}
                value={language}
                onChange={(event) => setLanguage(event.target.value as 'en' | 'km')}
              >
                <option value="en">English</option>
                <option value="km">Khmer</option>
              </select>
              <ChevronDown
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-muted-foreground"
              />
            </div>
          </label>
          <label className="grid gap-2 text-sm">
            <span>Currency</span>
            <div className="relative">
              <select
                className={selectClassName}
                value={currency}
                onChange={(event) => setCurrency(event.target.value as 'USD' | 'KHR')}
              >
                <option value="USD">USD</option>
                <option value="KHR">KHR</option>
              </select>
              <ChevronDown
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-muted-foreground"
              />
            </div>
          </label>
        </div>
        <div className="mt-4 divide-y divide-border/60">
          <CheckboxRow
            checked={showExplanatoryTooltips}
            description="Hide helper tooltips and explanatory guidance across the desktop UI."
            icon={<BadgeHelp className="size-4" />}
            label="Show explanatory tooltips"
            variant="flat"
            onCheckedChange={setShowExplanatoryTooltips}
          />
          <CheckboxRow
            checked={showFloatingTitleActions}
            description="When a page hero scrolls out of view, pin its action buttons and toggles in a floating island near the top-right corner."
            icon={<PanelsTopLeft className="size-4" />}
            label="Show floating title actions"
            variant="flat"
            onCheckedChange={setShowFloatingTitleActions}
          />
          <CheckboxRow
            checked={showRightRailCards}
            description="Show the contextual right-side insight and summary blocks across performance and detail pages."
            icon={<PanelRight className="size-4" />}
            label="Show right rail cards"
            variant="flat"
            onCheckedChange={setShowRightRailCards}
          />
        </div>
        <WorkspaceActionRow className="mt-4">
          <Button disabled={!hasPendingChanges} type="button" onClick={() => void savePreferences()}>
            <Save data-icon="inline-start" />
            Save preferences
          </Button>
        </WorkspaceActionRow>
      </WorkspacePanel>

      <WorkspacePanel title="Local workspace storage" description="The desktop shell now stores SENA data in a local SQLite workspace.">
        {localDataInfo ? (
          <div className="grid gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">Data directory</p>
              <p className="text-sm text-muted-foreground">{localDataInfo.dataDirectoryPath}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Workspace store</p>
              <p className="text-sm text-muted-foreground">{localDataInfo.workspaceStorePath}</p>
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Preferences file</p>
              <p className="text-sm text-muted-foreground">{localDataInfo.preferencesPath}</p>
            </div>
            <WorkspaceActionRow>
              <Button type="button" variant="outline" onClick={() => void window.banjiDesktop.system.openLocalDataFolder()}>
                <FolderOpen data-icon="inline-start" />
                Open local data folder
              </Button>
            </WorkspaceActionRow>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {localDataError ?? 'Loading local workspace information…'}
          </p>
        )}
      </WorkspacePanel>
    </WorkspacePage>
  );
}
