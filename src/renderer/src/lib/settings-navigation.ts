import { ActionExplosionIcon, ActionOpenFolderIcon } from '@icons/actions';
import { EntityFavoriteIcon } from '@icons/entities';
import {
  NavigationArchiveIcon,
  NavigationBrainCircuitIcon,
  NavigationPerformanceIcon,
  NavigationSplitViewIcon,
  NavigationWorkspacePanelsIcon,
} from '@icons/navigation';
import type { IconComponent } from '@icons';
import type { TranslationKey } from '@/lib/translations';

export type SettingsSectionId =
  | 'workspace'
  | 'interface'
  | 'planning'
  | 'local-data'
  | 'benchmarks'
  | 'archive'
  | 'credits'
  | 'danger-zone';

export type SettingsSectionConfig = {
  descriptionKey: TranslationKey;
  icon: IconComponent;
  id: SettingsSectionId;
  path: `/${string}`;
  titleKey: TranslationKey;
};

export const SETTINGS_SECTIONS: SettingsSectionConfig[] = [
  {
    id: 'workspace',
    path: '/settings/workspace',
    titleKey: 'settingsPreferencesControlsTitle',
    descriptionKey: 'settingsPreferencesControlsDescription',
    icon: NavigationWorkspacePanelsIcon,
  },
  {
    id: 'interface',
    path: '/settings/interface',
    titleKey: 'settingsInterfaceVisibilityTitle',
    descriptionKey: 'settingsInterfaceVisibilityDescription',
    icon: NavigationSplitViewIcon,
  },
  {
    id: 'local-data',
    path: '/settings/local-data',
    titleKey: 'settingsLocalWorkspaceStorageTitle',
    descriptionKey: 'settingsLocalWorkspaceStorageDescription',
    icon: ActionOpenFolderIcon,
  },
  {
    id: 'planning',
    path: '/settings/planning',
    titleKey: 'settingsSenaParametersPanelTitle',
    descriptionKey: 'settingsSenaParametersPanelDescription',
    icon: NavigationBrainCircuitIcon,
  },
  {
    id: 'benchmarks',
    path: '/settings/benchmarks',
    titleKey: 'settingsBenchmarksTitle',
    descriptionKey: 'settingsBenchmarksDescription',
    icon: NavigationPerformanceIcon,
  },
  {
    id: 'archive',
    path: '/operations/archive',
    titleKey: 'navArchive',
    descriptionKey: 'navArchive',
    icon: NavigationArchiveIcon,
  },
  {
    id: 'danger-zone',
    path: '/settings/danger-zone',
    titleKey: 'settingsDangerZoneTitle',
    descriptionKey: 'settingsDangerZoneDescription',
    icon: ActionExplosionIcon,
  },
  {
    id: 'credits',
    path: '/settings/credits',
    titleKey: 'settingsCreditsTitle',
    descriptionKey: 'settingsCreditsDescription',
    icon: EntityFavoriteIcon,
  },
];

export function matchesSettingsPath(pathname: string, path: string) {
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function resolveSettingsSection(pathname: string) {
  return SETTINGS_SECTIONS.find((section) => matchesSettingsPath(pathname, section.path)) ?? SETTINGS_SECTIONS[0];
}
