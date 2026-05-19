import { useRef, type KeyboardEvent, type TouchEvent } from 'react';
import {
  INTERFACE_VIEW_PRESETS,
  type InterfaceVisibilityPreferences,
  type InterfaceViewMode,
} from '@shared/interface-view';
import type { AppLanguage } from '@shared/inventory';
import { ActionSelectCheckIcon } from '@icons/actions';

const interfaceViewCardCopy: Record<AppLanguage, Record<InterfaceViewMode, {
  description: string;
  label: string;
}> & {
  groupLabel: string;
  showLabel: (label: string) => string;
}> = {
  en: {
    groupLabel: 'Display view mode',
    showLabel: (label) => `Show ${label}`,
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
  },
  km: {
    groupLabel: 'របៀបទិដ្ឋភាពបង្ហាញ',
    showLabel: (label) => `បង្ហាញ ${label}`,
    default: {
      description: 'រក្សាការណែនាំ សកម្មភាពអណ្តែត និងសញ្ញាស្ថានភាពឱ្យមើលឃើញ។',
      label: 'ទិដ្ឋភាពលំនាំដើម',
    },
    minimal: {
      description: 'លាក់ស្រទាប់ចំណុចប្រទាក់បន្ថែម ដើម្បីឱ្យកន្លែងធ្វើការស្ងប់បំផុត។',
      label: 'ទិដ្ឋភាពសាមញ្ញ',
    },
    maximal: {
      description: 'បង្ហាញផ្ទាំង ប៊ូតុងគ្រប់គ្រង និងសញ្ញាស្ថានភាពបន្ថែមទាំងអស់។',
      label: 'ទិដ្ឋភាពពេញលេញ',
    },
    custom: {
      description: 'ប្រើបន្សំប៊ូតុងបិទបើកដែលបានជ្រើសខាងក្រោម។',
      label: 'ទិដ្ឋភាពផ្ទាល់ខ្លួន',
    },
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
  const showSupportCards = !showTimeline;
  const showSummaryBlock = !showTimeline && !showSignals;

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
        <div className="grid min-w-0 content-start gap-0.5 border-r border-border/60 p-1.5">
          <span className="h-1.5 w-3/5 rounded-full bg-muted-foreground/30" />
          <span className="h-1.5 w-4/5 rounded-full bg-muted-foreground/18" />
          <span className="h-1.5 w-1/2 rounded-full bg-muted-foreground/18" />
          <span className="h-1.5 w-3/4 rounded-full bg-muted-foreground/18" />
          {showAnalysis ? <span className="h-1.5 w-1/2 rounded-full bg-primary/45" /> : null}
        </div>
        <div className="grid min-h-0 min-w-0 grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-1 p-1.5">
          <div className="grid grid-cols-[1fr_auto] items-start gap-1 border-b border-border/50 pb-1">
            <span className="grid gap-1">
              <span className="h-2 w-2/3 rounded-full bg-muted-foreground/18" />
              <span className="flex items-center gap-1">
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
              <span className="flex items-start gap-0.5">
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
            <div className="flex gap-0.5">
              <span className="h-3 w-6 rounded-full bg-primary/55" />
              <span className="h-3 w-6 rounded-full bg-primary/18" />
              <span className="h-3 w-6 rounded-full bg-primary/18" />
            </div>
          ) : null}
          <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_auto_auto] gap-1">
            <div className="grid grid-cols-[1fr_auto] gap-1 rounded-lg border border-border/60 p-1.5">
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
                <span className="grid size-6 place-items-center self-start rounded-md border border-primary/30 bg-primary/10">
                  <span className="size-3 rounded border-2 border-primary/60" />
                </span>
              ) : null}
            </div>
            {showSupportCards ? (
              <div className="grid min-h-0 grid-cols-2 gap-1">
                <span className="grid content-start gap-1 rounded-lg border border-border/60 p-1.5">
                  <span className="h-1.5 w-4/5 rounded-full bg-muted-foreground/18" />
                  <span className="h-1.5 w-3/5 rounded-full bg-muted-foreground/18" />
                  {showSignals ? (
                    <span className="mt-1 flex items-center gap-1">
                      <span className="size-1.5 rounded-full bg-primary/70" />
                      <span className="h-1 w-5 rounded-full bg-primary/55" />
                    </span>
                  ) : null}
                </span>
                <span className="grid content-start gap-1 rounded-lg border border-border/60 p-1.5">
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
              <div className="grid gap-1 rounded-lg border border-border/60 p-1.5">
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
            {showSummaryBlock ? (
              <div className="grid gap-1 rounded-lg border border-border/50 p-1.5">
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
          <div className="flex items-center gap-1 border-t border-border/50 pt-1">
            {showSignals ? (
              <span className="ml-auto flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-primary/70" />
                <span className="h-1 w-6 rounded-full bg-primary/50" />
              </span>
            ) : null}
          </div>
        </div>
        {showRail ? (
          <div className="grid min-w-0 content-start gap-1 border-l border-border/60 p-1.5">
            <span className="grid gap-1 rounded-md border border-primary/20 bg-primary/10 p-1">
              {showSignals ? <span className="size-1.5 rounded-full bg-primary/70" /> : null}
              <span className="h-1 w-4/5 rounded-full bg-primary/45" />
              <span className="h-1 w-2/3 rounded-full bg-muted-foreground/18" />
              <span className="h-1 w-1/2 rounded-full bg-muted-foreground/18" />
            </span>
            <span className="grid gap-1 rounded-md border border-border/60 p-1">
              <span className="h-3 w-5 rounded-full bg-primary/25" />
              <span className="h-1 w-4/5 rounded-full bg-muted-foreground/18" />
              <span className="h-1 w-2/3 rounded-full bg-muted-foreground/18" />
            </span>
            <span className="grid gap-1 rounded-md border border-border/60 p-1">
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
  language = 'en',
  modes,
  onDisplayViewModeChange,
  presentation = 'grid',
  visibility,
}: {
  className?: string;
  displayViewMode: InterfaceViewMode;
  language?: AppLanguage;
  modes: InterfaceViewMode[];
  onDisplayViewModeChange: (value: InterfaceViewMode) => void;
  presentation?: 'grid' | 'carousel';
  visibility?: InterfaceVisibilityPreferences;
}) {
  const copy = interfaceViewCardCopy[language];
  const radioRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const selectedModeIndex = modes.indexOf(displayViewMode);
  const tabIndexModeIndex = selectedModeIndex >= 0 ? selectedModeIndex : 0;
  const carouselModeIndex = selectedModeIndex >= 0 ? selectedModeIndex : 0;

  const gridColsClass = (() => {
    if (modes.length === 1) return 'grid-cols-[minmax(0,23rem)]';
    if (modes.length === 2) return 'grid-cols-[minmax(0,23rem)] sm:grid-cols-[repeat(2,minmax(0,23rem))]';
    if (modes.length === 3) return 'grid-cols-[minmax(0,23rem)] sm:grid-cols-[repeat(3,minmax(0,23rem))]';
    return 'grid-cols-[minmax(0,23rem)] sm:grid-cols-[repeat(4,minmax(0,23rem))]';
  })();

  function selectModeAtIndex(index: number) {
    const nextMode = modes[index];
    if (!nextMode) {
      return;
    }

    onDisplayViewModeChange(nextMode);
    radioRefs.current[index]?.focus();
  }

  function handleRadioKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (modes.length === 0) {
      return;
    }

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      selectModeAtIndex((index + 1) % modes.length);
      return;
    }

    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      selectModeAtIndex((index - 1 + modes.length) % modes.length);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      selectModeAtIndex(0);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      selectModeAtIndex(modes.length - 1);
    }
  }

  function handleCarouselTouchStart(event: TouchEvent<HTMLDivElement>) {
    const touch = event.touches[0];
    if (!touch) {
      return;
    }
    swipeStartRef.current = { x: touch.clientX, y: touch.clientY };
  }

  function handleCarouselTouchEnd(event: TouchEvent<HTMLDivElement>) {
    const touch = event.changedTouches[0];
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (!touch || !start || modes.length < 2) {
      return;
    }

    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < 40 || Math.abs(deltaX) < Math.abs(deltaY)) {
      return;
    }

    const nextIndex = deltaX < 0
      ? Math.min(carouselModeIndex + 1, modes.length - 1)
      : Math.max(carouselModeIndex - 1, 0);
    const nextMode = modes[nextIndex];
    if (nextMode && nextMode !== displayViewMode) {
      onDisplayViewModeChange(nextMode);
    }
  }

  if (presentation === 'carousel') {
    return (
      <div
        className={['grid gap-3', className].filter(Boolean).join(' ')}
      >
        <div
          aria-label={copy.groupLabel}
          className="overflow-hidden rounded-2xl"
          data-presentation={presentation}
          data-slot="interface-view-carousel-viewport"
          role="radiogroup"
          onTouchEnd={handleCarouselTouchEnd}
          onTouchStart={handleCarouselTouchStart}
        >
          <div
            className="flex transition-transform duration-300 ease-out"
            data-slot="interface-view-carousel-track"
            style={{ transform: `translateX(-${carouselModeIndex * 100}%)` }}
          >
            {modes.map((mode, index) => {
              const selected = displayViewMode === mode;
              const labelId = `interface-view-card-${mode}-label`;
              const descriptionId = `interface-view-card-${mode}-description`;
              const modeVisibility = mode === 'custom' && visibility
                ? visibility
                : INTERFACE_VIEW_PRESETS[mode === 'custom' ? 'maximal' : mode];
              return (
                <button
                  key={mode}
                  aria-checked={selected}
                  aria-describedby={descriptionId}
                  aria-labelledby={labelId}
                  className={[
                    'relative grid w-full min-w-0 shrink-0 grid-rows-[auto_auto] gap-3 rounded-2xl border p-3 text-left transition',
                    selected
                      ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
                      : 'border-border bg-background/80 hover:border-primary/50 hover:bg-accent/40',
                  ].join(' ')}
                  ref={(element) => {
                    radioRefs.current[index] = element;
                  }}
                  role="radio"
                  tabIndex={index === tabIndexModeIndex ? 0 : -1}
                  type="button"
                  onClick={() => onDisplayViewModeChange(mode)}
                  onKeyDown={(event) => handleRadioKeyDown(event, index)}
                >
                  <span className="mx-auto grid aspect-[1.2/1] w-3/4 items-stretch overflow-hidden">
                    <span className="grid size-full">
                      <InterfaceViewWireframe visibility={modeVisibility} />
                    </span>
                  </span>
                  <span className="grid content-end gap-1">
                    <span id={labelId} className="khmer-safe-display flex items-center gap-1.5 text-sm font-semibold text-foreground">
                      <span>{copy[mode].label}</span>
                      <ActionSelectCheckIcon
                        aria-hidden="true"
                        className={[
                          'size-4 transition-opacity',
                          selected ? 'opacity-100' : 'opacity-0',
                        ].join(' ')}
                      />
                    </span>
                    <span id={descriptionId} className="khmer-safe text-xs leading-5 text-muted-foreground">{copy[mode].description}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="mx-auto flex w-fit gap-1.5 rounded-full border border-border/70 bg-card/95 px-3 py-2 shadow-panel backdrop-blur" aria-label={copy.groupLabel} data-slot="interface-view-carousel-dots">
          {modes.map((mode, index) => (
            <button
              key={mode}
              aria-current={index === carouselModeIndex ? 'true' : undefined}
              aria-label={copy.showLabel(copy[mode].label)}
              className={`size-2.5 rounded-full transition-colors ${index === carouselModeIndex ? 'bg-primary' : 'bg-muted-foreground/25'}`}
              type="button"
              onClick={() => onDisplayViewModeChange(mode)}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      aria-label={copy.groupLabel}
      className={[
        'grid justify-center gap-6 xl:gap-8',
        gridColsClass,
        className,
      ].filter(Boolean).join(' ')}
      data-presentation={presentation}
      role="radiogroup"
    >
      {modes.map((mode, index) => {
        const selected = displayViewMode === mode;
        const labelId = `interface-view-card-${mode}-label`;
        const descriptionId = `interface-view-card-${mode}-description`;
        const modeVisibility = mode === 'custom' && visibility
          ? visibility
          : INTERFACE_VIEW_PRESETS[mode === 'custom' ? 'maximal' : mode];
        return (
          <button
            key={mode}
            aria-checked={selected}
            aria-describedby={descriptionId}
            aria-labelledby={labelId}
            className={[
              'relative grid w-full min-w-0 max-w-[23rem] grid-rows-[auto_auto] gap-3 rounded-2xl border p-3 text-left transition',
              selected
                ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
                : 'border-border bg-background/80 hover:border-primary/50 hover:bg-accent/40',
            ].join(' ')}
            ref={(element) => {
              radioRefs.current[index] = element;
            }}
            role="radio"
            tabIndex={index === tabIndexModeIndex ? 0 : -1}
            type="button"
            onClick={() => onDisplayViewModeChange(mode)}
            onKeyDown={(event) => handleRadioKeyDown(event, index)}
          >
            <span className="grid aspect-[1.2/1] w-full items-stretch overflow-hidden">
              <span className="grid size-full">
                <InterfaceViewWireframe visibility={modeVisibility} />
              </span>
            </span>
            <span className="grid content-end gap-1">
              <span id={labelId} className="khmer-safe-display flex items-center gap-1.5 text-sm font-semibold text-foreground">
                <span>{copy[mode].label}</span>
                <ActionSelectCheckIcon
                  aria-hidden="true"
                  className={[
                    'size-4 transition-opacity',
                    selected ? 'opacity-100' : 'opacity-0',
                  ].join(' ')}
                />
              </span>
              <span id={descriptionId} className="khmer-safe text-xs leading-5 text-muted-foreground">{copy[mode].description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
