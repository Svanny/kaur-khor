import { useEffect, useState } from 'react';
import type { DesktopLocalDataInfo } from '@shared/ipc';
import { PageTitleWithBack } from '@/components/system/page-navigation';
import { WorkspaceActionRow, WorkspacePage, WorkspacePanel } from '@/components/system/workspace';
import { Button } from '@/components/ui/button';
import { usePreferences } from '@/state/preferences';

export function SettingsRoute() {
  const {
    currency,
    hasPendingChanges,
    language,
    savePreferences,
    setCurrency,
    setLanguage,
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
      <PageTitleWithBack>Settings</PageTitleWithBack>
      <WorkspacePanel title="Desktop preferences" description="These preferences affect only the local desktop shell.">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-2 text-sm">
            <span>Language</span>
            <select
              className="rounded-xl border border-border bg-background px-3 py-2"
              value={language}
              onChange={(event) => setLanguage(event.target.value as 'en' | 'km')}
            >
              <option value="en">English</option>
              <option value="km">Khmer</option>
            </select>
          </label>
          <label className="grid gap-2 text-sm">
            <span>Currency</span>
            <select
              className="rounded-xl border border-border bg-background px-3 py-2"
              value={currency}
              onChange={(event) => setCurrency(event.target.value as 'USD' | 'KHR')}
            >
              <option value="USD">USD</option>
              <option value="KHR">KHR</option>
            </select>
          </label>
        </div>
        <WorkspaceActionRow className="mt-4">
          <Button disabled={!hasPendingChanges} type="button" onClick={() => void savePreferences()}>
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
