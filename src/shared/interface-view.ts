export type InterfaceViewMode = 'default' | 'minimal' | 'maximal' | 'custom';
export type InterfacePresetViewMode = Exclude<InterfaceViewMode, 'custom'>;

export interface InterfaceVisibilityPreferences {
  showExplanatoryTooltips: boolean;
  showFloatingTitleActions: boolean;
  showRightRailCards: boolean;
  showOverviewTaskTabs: boolean;
  showAutomationsPage: boolean;
  showAnalysisPage: boolean;
  showPerformanceCompareToggle: boolean;
  showPerformanceTimelineCard: boolean;
  showLogsViewToggle: boolean;
  showHeartbeatRibbons: boolean;
}

export const INTERFACE_VISIBILITY_KEYS = [
  'showExplanatoryTooltips',
  'showFloatingTitleActions',
  'showRightRailCards',
  'showOverviewTaskTabs',
  'showAutomationsPage',
  'showAnalysisPage',
  'showPerformanceCompareToggle',
  'showPerformanceTimelineCard',
  'showLogsViewToggle',
  'showHeartbeatRibbons',
] as const satisfies ReadonlyArray<keyof InterfaceVisibilityPreferences>;

export const INTERFACE_VIEW_PRESETS: Record<InterfacePresetViewMode, InterfaceVisibilityPreferences> = {
  default: {
    showExplanatoryTooltips: true,
    showFloatingTitleActions: true,
    showRightRailCards: false,
    showOverviewTaskTabs: false,
    showAutomationsPage: false,
    showAnalysisPage: true,
    showPerformanceCompareToggle: false,
    showPerformanceTimelineCard: false,
    showLogsViewToggle: false,
    showHeartbeatRibbons: true,
  },
  minimal: {
    showExplanatoryTooltips: false,
    showFloatingTitleActions: false,
    showRightRailCards: false,
    showOverviewTaskTabs: false,
    showAutomationsPage: false,
    showAnalysisPage: true,
    showPerformanceCompareToggle: false,
    showPerformanceTimelineCard: false,
    showLogsViewToggle: false,
    showHeartbeatRibbons: false,
  },
  maximal: {
    showExplanatoryTooltips: true,
    showFloatingTitleActions: true,
    showRightRailCards: true,
    showOverviewTaskTabs: true,
    showAutomationsPage: true,
    showAnalysisPage: true,
    showPerformanceCompareToggle: true,
    showPerformanceTimelineCard: true,
    showLogsViewToggle: true,
    showHeartbeatRibbons: true,
  },
};

export function isPresetViewMode(value: unknown): value is InterfacePresetViewMode {
  return value === 'default' || value === 'minimal' || value === 'maximal';
}

export function normalizeInterfaceViewMode(value: unknown): InterfaceViewMode | null {
  if (value === 'compact') {
    return 'minimal';
  }
  if (value === 'custom' || isPresetViewMode(value)) {
    return value;
  }
  return null;
}

export function getInterfaceVisibilityForPreset(mode: InterfacePresetViewMode): InterfaceVisibilityPreferences {
  return INTERFACE_VIEW_PRESETS[mode];
}

export function getInterfacePresetForVisibility(
  preferences: InterfaceVisibilityPreferences,
): InterfaceViewMode {
  for (const [mode, preset] of Object.entries(INTERFACE_VIEW_PRESETS) as Array<[InterfacePresetViewMode, InterfaceVisibilityPreferences]>) {
    if (INTERFACE_VISIBILITY_KEYS.every((key) => preferences[key] === preset[key])) {
      return mode;
    }
  }
  return 'custom';
}

export function resolveInterfaceViewMode({
  requestedMode,
  visibility,
}: {
  requestedMode: InterfaceViewMode | null;
  visibility: InterfaceVisibilityPreferences;
}): InterfaceViewMode {
  if (requestedMode === 'custom') {
    return 'custom';
  }

  const matchedMode = getInterfacePresetForVisibility(visibility);
  if (requestedMode && isPresetViewMode(requestedMode)) {
    return matchedMode === requestedMode ? requestedMode : 'custom';
  }

  return matchedMode === 'custom' ? 'custom' : matchedMode;
}
