import {
  INTERFACE_VIEW_PRESETS,
  type InterfaceVisibilityPreferences,
  type InterfaceViewMode,
} from '@shared/interface-view';
import { ActionSelectCheckIcon } from '@icons/actions';

const interfaceViewCardCopy: Record<InterfaceViewMode, {
  description: string;
  label: string;
}> = {
  default: {
    description: 'Guidance, floating actions, and status signals stay visible.',
    label: 'Default View',
  },
  minimal: {
    description: 'Hides optional interface layers for the quietest workspace.',
    label: 'Minimal View',
  },
  maximal: {
    description: 'Shows every optional panel, control, and status signal.',
    label: 'Maximal View',
  },
  custom: {
    description: 'Uses the exact combination selected in the toggles below.',
    label: 'Custom View',
  },
};

function InterfaceViewWireframe({ visibility }: { visibility: InterfaceVisibilityPreferences }) {
  const showGuidance = visibility.showExplanatoryTooltips;
  const showFloating = visibility.showFloatingTitleActions;
  const showRail = visibility.showRightRailCards;
  const showTabs = visibility.showOverviewTaskTabs;
  const showAutomations = visibility.showAutomationsPage;
  const showAnalysis = visibility.showAnalysisPage;
  const showCompare = visibility.showPerformanceCompareToggle;
  const showTimeline = visibility.showPerformanceTimelineCard;
  const showHistoryToggle = visibility.showLogsViewToggle;
  const showSignals = visibility.showHeartbeatRibbons;
  const showBodySupportCards = showSignals || !showTimeline;

  return (
    <div
      className="size-full min-h-0 overflow-hidden rounded-xl border border-border/70 bg-white"
      data-testid="interface-view-wireframe"
    >
      <div
        className={[
          'grid size-full min-h-0 min-w-0',
          showRail ? 'grid-cols-[0.2fr_1fr_0.24fr]' : 'grid-cols-[0.2fr_1fr]',
        ].join(' ')}
      >
        <div className="grid min-w-0 content-start gap-1 border-r border-border/60 p-2">
          <span className="h-1.5 w-3/5 rounded-full bg-muted-foreground/30" />
          <span className="h-1.5 w-4/5 rounded-full bg-muted-foreground/18" />
          <span className="h-1.5 w-1/2 rounded-full bg-muted-foreground/18" />
          <span className="h-1.5 w-3/4 rounded-full bg-muted-foreground/18" />
          {showAnalysis ? <span className="h-1.5 w-1/2 rounded-full bg-primary/45" /> : null}
          <span className="mt-2 flex gap-1">
            <span className="size-1.5 rounded-full bg-muted-foreground/18" />
            <span className="size-1.5 rounded-full bg-muted-foreground/18" />
            <span className="size-1.5 rounded-full bg-muted-foreground/18" />
          </span>
        </div>
        <div className="grid min-h-0 min-w-0 grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-1.5 p-2">
          <div className="grid grid-cols-[1fr_auto] items-start gap-1.5 border-b border-border/50 pb-1.5">
            <span className="grid gap-1.5">
              <span className="h-2 w-2/3 rounded-full bg-muted-foreground/18" />
              <span className="flex items-center gap-1.5">
                <span className="h-1.5 w-1/2 rounded-full bg-primary/45" />
                {showHistoryToggle ? (
                  <span className="grid h-3 w-7 grid-cols-2 overflow-hidden rounded border border-muted-foreground/20">
                    <span className="bg-muted-foreground/15" />
                    <span className="bg-muted-foreground/25" />
                  </span>
                ) : null}
              </span>
              {showGuidance ? <span className="h-1 w-5/6 rounded-full bg-muted-foreground/12" /> : null}
            </span>
            {showFloating ? (
              <span className="flex items-start gap-1">
                <span className="size-3.5 rounded border border-primary/55 bg-primary/15" />
                <span className="size-3.5 rounded border border-primary/55 bg-primary/15" />
                {showCompare ? (
                  <span className="grid h-3.5 w-8 grid-cols-2 overflow-hidden rounded border border-primary/30">
                    <span className="bg-primary/55" />
                    <span className="bg-primary/10" />
                  </span>
                ) : null}
              </span>
            ) : showCompare ? (
              <span className="grid h-3.5 w-8 grid-cols-2 overflow-hidden rounded border border-primary/30">
                <span className="bg-primary/55" />
                <span className="bg-primary/10" />
              </span>
            ) : null}
          </div>
          {showTabs ? (
            <div className="flex gap-1">
              <span className="h-3 w-6 rounded-full bg-primary/55" />
              <span className="h-3 w-6 rounded-full bg-primary/18" />
              <span className="h-3 w-6 rounded-full bg-primary/18" />
            </div>
          ) : null}
          <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto_auto] gap-1.5">
            <div className="grid min-h-0 grid-cols-[1fr_auto] gap-1.5 rounded-lg border border-border/60 p-2">
              <span className="grid content-start gap-1">
                <span className="h-1.5 w-4/5 rounded-full bg-muted-foreground/18" />
                <span className="h-1.5 w-3/5 rounded-full bg-muted-foreground/18" />
                <span className="h-1.5 w-2/3 rounded-full bg-muted-foreground/18" />
                {showGuidance ? <span className="h-1 w-3/4 rounded-full bg-muted-foreground/12" /> : null}
                {!showSignals ? <span className="h-1.5 w-1/2 rounded-full bg-muted-foreground/12" /> : null}
                {showSignals ? (
                  <span className="mt-1 flex items-center gap-1">
                    <span className="size-1.5 rounded-full bg-primary/70" />
                    <span className="h-1 w-6 rounded-full bg-primary/55" />
                  </span>
                ) : null}
              </span>
              {showAutomations ? (
                <span className="grid size-8 place-items-center rounded-md border border-primary/30 bg-primary/10">
                  <span className="size-4 rounded border-2 border-primary/60" />
                </span>
              ) : null}
            </div>
            {showBodySupportCards ? (
              <div className="grid min-h-0 grid-cols-2 gap-1.5">
                <span className="grid content-start gap-1 rounded-lg border border-border/60 p-2">
                  <span className="h-1.5 w-4/5 rounded-full bg-muted-foreground/18" />
                  <span className="h-1.5 w-3/5 rounded-full bg-muted-foreground/18" />
                  {showSignals ? (
                    <span className="mt-1 flex items-center gap-1">
                      <span className="size-1.5 rounded-full bg-primary/70" />
                      <span className="h-1 w-5 rounded-full bg-primary/55" />
                    </span>
                  ) : null}
                </span>
                <span className="grid content-start gap-1 rounded-lg border border-border/60 p-2">
                  <span className="h-1.5 w-3/4 rounded-full bg-muted-foreground/18" />
                  <span className="h-1.5 w-1/2 rounded-full bg-muted-foreground/18" />
                  {showSignals ? (
                    <span className="mt-1 flex items-center gap-1">
                      <span className="size-1.5 rounded-full bg-primary/70" />
                      <span className="h-1 w-5 rounded-full bg-primary/55" />
                    </span>
                  ) : null}
                </span>
              </div>
            ) : null}
            {showTimeline ? (
              <div className="grid gap-1.5 rounded-lg border border-border/60 p-2">
                <span className="relative h-0.5 rounded-full bg-primary/45">
                  <span className="absolute -top-0.5 left-0 size-1.5 rounded-full bg-primary/70" />
                  <span className="absolute -top-0.5 left-1/4 size-1.5 rounded-full bg-primary/70" />
                  <span className="absolute -top-0.5 left-1/2 size-1.5 rounded-full bg-primary/70" />
                  <span className="absolute -top-0.5 right-0 size-1.5 rounded-full bg-primary/70" />
                </span>
                <span className="flex justify-between">
                  <span className="h-1 w-5 rounded-full bg-muted-foreground/18" />
                  <span className="h-1 w-5 rounded-full bg-muted-foreground/18" />
                  <span className="h-1 w-5 rounded-full bg-muted-foreground/18" />
                </span>
              </div>
            ) : null}
            {!showTimeline ? (
              <div className="grid gap-1.5 rounded-lg border border-border/50 p-2">
                <span className="h-1.5 w-5/6 rounded-full bg-muted-foreground/12" />
                <span className="h-1.5 w-2/3 rounded-full bg-muted-foreground/12" />
                {showSignals ? (
                  <span className="flex items-center gap-1">
                    <span className="size-1.5 rounded-full bg-primary/55" />
                    <span className="h-1 w-5 rounded-full bg-primary/45" />
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-1.5 border-t border-border/50 pt-1.5">
            {showSignals ? (
              <span className="ml-auto flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-primary/70" />
                <span className="h-1 w-6 rounded-full bg-primary/50" />
              </span>
            ) : null}
          </div>
        </div>
        {showRail ? (
          <div className="grid min-w-0 content-start gap-1.5 border-l border-border/60 p-2">
            <span className="grid gap-1 rounded-md border border-primary/20 bg-primary/10 p-1.5">
              {showSignals ? <span className="size-1.5 rounded-full bg-primary/70" /> : null}
              <span className="h-1 w-4/5 rounded-full bg-primary/45" />
              <span className="h-1 w-2/3 rounded-full bg-muted-foreground/18" />
              <span className="h-1 w-1/2 rounded-full bg-muted-foreground/18" />
            </span>
            <span className="grid gap-1 rounded-md border border-border/60 p-1.5">
              <span className="h-3 w-5 rounded-full bg-primary/25" />
              <span className="h-1 w-4/5 rounded-full bg-muted-foreground/18" />
              <span className="h-1 w-2/3 rounded-full bg-muted-foreground/18" />
            </span>
            <span className="grid gap-1 rounded-md border border-border/60 p-1.5">
              <span className="size-3 rounded-full border border-primary/50" />
              <span className="h-1 w-4/5 rounded-full bg-muted-foreground/18" />
              <span className="h-1 w-1/2 rounded-full bg-muted-foreground/18" />
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function InterfaceViewModeCards({
  className = '',
  displayViewMode,
  modes,
  onDisplayViewModeChange,
  visibility,
}: {
  className?: string;
  displayViewMode: InterfaceViewMode;
  modes: InterfaceViewMode[];
  onDisplayViewModeChange: (value: InterfaceViewMode) => void;
  visibility?: InterfaceVisibilityPreferences;
}) {
  return (
    <div
      aria-label="Display view mode"
      className={[
        'grid justify-evenly gap-6 sm:grid-cols-[repeat(3,minmax(0,23rem))] xl:gap-8',
        modes.length > 3 ? 'xl:grid-cols-[repeat(4,minmax(0,23rem))]' : '',
        className,
      ].filter(Boolean).join(' ')}
      role="radiogroup"
    >
      {modes.map((mode) => {
        const selected = displayViewMode === mode;
        const modeVisibility = mode === 'custom' && visibility
          ? visibility
          : INTERFACE_VIEW_PRESETS[mode === 'custom' ? 'maximal' : mode];
        return (
          <button
            key={mode}
            aria-checked={selected}
            aria-label={interfaceViewCardCopy[mode].label}
            className={[
              'relative flex aspect-square w-full min-w-0 max-w-[23rem] flex-col gap-2 rounded-2xl border p-3 text-left transition',
              selected
                ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
                : 'border-border bg-background/80 hover:border-primary/50 hover:bg-accent/40',
            ].join(' ')}
            role="radio"
            type="button"
            onClick={() => onDisplayViewModeChange(mode)}
          >
            <span className="grid min-h-0 w-full flex-1 items-stretch">
              <span className="grid size-full min-h-0">
                <InterfaceViewWireframe visibility={modeVisibility} />
              </span>
            </span>
            <span className="grid content-end gap-1">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <span>{interfaceViewCardCopy[mode].label}</span>
                <ActionSelectCheckIcon
                  aria-hidden="true"
                  className={[
                    'size-4 transition-opacity',
                    selected ? 'opacity-100' : 'opacity-0',
                  ].join(' ')}
                />
              </span>
              <span className="text-xs leading-5 text-muted-foreground">{interfaceViewCardCopy[mode].description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
