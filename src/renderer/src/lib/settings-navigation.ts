import { ActionExplosionIcon, ActionOpenFolderIcon } from '@icons/actions';
import { EntityFavoriteIcon } from '@icons/entities';
import {
  NavigationAutomationIcon,
  NavigationBrainCircuitIcon,
  NavigationHistoryIcon,
  NavigationPerformanceIcon,
  NavigationSplitViewIcon,
  NavigationWorkspacePanelsIcon,
} from '@icons/navigation';
import { StatusHelpBadgeIcon } from '@icons/status';
import type { IconComponent } from '@icons';
import type { TranslationKey } from '@/lib/translations';

export type SettingsSectionId =
  | 'workspace'
  | 'interface'
  | 'planning'
  | 'local-data'
  | 'automation'
  | 'history'
  | 'benchmarks'
  | 'help'
  | 'credits'
  | 'danger-zone';

export type SettingsSectionConfig = {
  descriptionKey: TranslationKey;
  icon: IconComponent;
  id: SettingsSectionId;
  path: `/${string}`;
  titleKey: TranslationKey;
};

export function isBenchmarkSettingsEnabled() {
  return import.meta.env.DEV;
}

const BENCHMARK_SETTINGS_SECTION: SettingsSectionConfig = {
  id: 'benchmarks',
  path: '/settings/benchmarks',
  titleKey: 'settingsBenchmarksTitle',
  descriptionKey: 'settingsBenchmarksDescription',
  icon: NavigationPerformanceIcon,
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
    id: 'automation',
    path: '/settings/automation',
    titleKey: 'navAutomations',
    descriptionKey: 'navAutomations',
    icon: NavigationAutomationIcon,
  },
  {
    id: 'history',
    path: '/settings/history',
    titleKey: 'navHistory',
    descriptionKey: 'navHistory',
    icon: NavigationHistoryIcon,
  },
  ...(import.meta.env.DEV ? [BENCHMARK_SETTINGS_SECTION] : []),
  {
    id: 'help',
    path: '/settings/help',
    titleKey: 'navHelp',
    descriptionKey: 'navHelp',
    icon: StatusHelpBadgeIcon,
  },
  {
    id: 'credits',
    path: '/settings/credits',
    titleKey: 'settingsCreditsTitle',
    descriptionKey: 'settingsCreditsDescription',
    icon: EntityFavoriteIcon,
  },
  {
    id: 'danger-zone',
    path: '/settings/danger-zone',
    titleKey: 'settingsDangerZoneTitle',
    descriptionKey: 'settingsDangerZoneDescription',
    icon: ActionExplosionIcon,
  },
];

export function isSettingsSectionEnabled(section: SettingsSectionConfig) {
  return section.id !== 'benchmarks' || isBenchmarkSettingsEnabled();
}

export function visibleSettingsSections() {
  return SETTINGS_SECTIONS.filter(isSettingsSectionEnabled);
}

export function matchesSettingsPath(pathname: string, path: string) {
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function resolveSettingsSection(pathname: string) {
  const sections = visibleSettingsSections();
  return sections.find((section) => matchesSettingsPath(pathname, section.path)) ?? sections[0];
}
