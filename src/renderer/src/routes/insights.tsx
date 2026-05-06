import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import {
  EntityComparisonIcon,
  EntityRevenueIcon,
  EntitySignalIcon,
} from '@icons/entities';
import type { IconComponent } from '@icons';
import { CenteredTileGrid } from '@/components/system/centered-tile-grid';
import { LiquidGridCard } from '@/components/system/liquid-grid-card';
import { WorkspacePage, WorkspaceTitleCard } from '@/components/system/workspace';
import {
  buildInsightsHref,
  insightsModePathByValue,
  readInsightsRouteState,
  type InsightsModeValue,
} from '@/lib/navigation-state';
import {
  buildRememberedAnalysisHref,
  buildRememberedFinancialsHref,
  buildRememberedInsightsHref,
  buildRememberedPerformanceHref,
} from '@/lib/page-state-memory';
import { gridCardSurfaceClassName, type GridCardColorKey } from '@/lib/grid-card-colors';
import { translateUiLiteral } from '@/lib/translations';
import { usePreferences } from '@/state/preferences';
import { AnalysisRoute } from './analysis';
import { FinancialsRoute } from './financials';
import { PerformanceRoute } from './performance';

const INSIGHT_MODES: Array<{
  id: InsightsModeValue;
  icon: IconComponent;
  label: string;
  tone: GridCardColorKey;
  summary: string;
}> = [
  {
    id: 'performance',
    icon: EntityComparisonIcon,
    label: 'Pressure',
    tone: 'pressure',
    summary: 'Demand, support, timing, price, and recovery pressure.',
  },
  {
    id: 'financials',
    icon: EntityRevenueIcon,
    label: 'Money',
    tone: 'money',
    summary: 'Money in, money tied up, and value leakage.',
  },
  {
    id: 'analysis',
    icon: EntitySignalIcon,
    label: 'Explain',
    tone: 'explain',
    summary: 'Detailed explanation, observations, fragility, and chart settings.',
  },
];

function rememberedInsightModeHref(mode: InsightsModeValue) {
  switch (mode) {
    case 'analysis':
      return buildRememberedAnalysisHref();
    case 'financials':
      return buildRememberedFinancialsHref();
    case 'performance':
      return buildRememberedPerformanceHref();
  }
}

export function InsightsRoute() {
  const { language, showAnalysisPage } = usePreferences();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const routeState = readInsightsRouteState(searchParams);
  const modeByPath = new Map(INSIGHT_MODES.map((mode) => [insightsModePathByValue[mode.id], mode.id]));
  const activePath = params['*']?.replace(/\/+$/, '') ?? '';
  const activeMode = modeByPath.get(activePath);

  if (!showAnalysisPage) {
    return <Navigate replace to="/" />;
  }

  if (!activePath && searchParams.has('mode')) {
    return <Navigate replace to={buildInsightsHref({ mode: routeState.mode }, searchParams)} />;
  }

  if (!activePath) {
    return (
      <WorkspacePage fitViewport className="gap-5">
        <WorkspaceTitleCard
          eyebrow={translateUiLiteral(language, 'Insights')}
          title={translateUiLiteral(language, 'Understand what needs attention')}
          descriptor={translateUiLiteral(language, 'Choose the operating lens before opening the detailed workspace.')}
          className="rounded-xl"
        />

        <CenteredTileGrid columns={3}>
          {INSIGHT_MODES.map((mode) => {
            const Icon = mode.icon;
            return (
              <Link
                key={mode.id}
                className="block w-full min-w-0 focus-visible:outline-none"
                to={rememberedInsightModeHref(mode.id)}
              >
                <LiquidGridCard
                  className={gridCardSurfaceClassName(mode.tone)}
                  contentClassName="min-w-0 w-full px-5 py-6 text-center md:px-7 md:py-7"
                >
                  <span className="flex h-full flex-col items-center justify-center gap-5">
                    <Icon className="size-16 shrink-0 text-foreground md:size-20" aria-hidden="true" />
                    <span className="space-y-3">
                      <span className="khmer-safe-display block text-2xl font-semibold text-foreground" data-slot="centered-tile-card-title">
                        {translateUiLiteral(language, mode.label)}
                      </span>
                      <span className="mx-auto block max-w-[15rem] text-sm leading-6 text-muted-foreground" data-slot="centered-tile-card-summary">
                        {translateUiLiteral(language, mode.summary)}
                      </span>
                    </span>
                  </span>
                </LiquidGridCard>
              </Link>
            );
          })}
        </CenteredTileGrid>
      </WorkspacePage>
    );
  }

  const ActiveRoute =
    activeMode === 'analysis'
      ? AnalysisRoute
      : activeMode === 'financials'
        ? FinancialsRoute
        : activeMode === 'performance'
          ? PerformanceRoute
          : null;

  if (!ActiveRoute) {
    return <Navigate replace to={buildRememberedInsightsHref()} />;
  }

  return (
    <>
      <ActiveRoute />

      <div className="sr-only">
        <Link to={buildInsightsHref({ mode: 'performance' })}>{translateUiLiteral(language, 'Pressure')}</Link>
        <Link to={buildInsightsHref({ mode: 'financials' })}>{translateUiLiteral(language, 'Money')}</Link>
        <Link to={buildInsightsHref({ mode: 'analysis' })}>{translateUiLiteral(language, 'Explain')}</Link>
      </div>
    </>
  );
}
