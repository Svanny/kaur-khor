import { Link } from 'react-router-dom';
import { ActionCreatePackageIcon } from '@icons/actions';
import {
  EntitySignalIcon,
  EntitySkuIcon,
  EntityTransitIcon,
} from '@icons/entities';
import {
  NavigationCatalogIcon,
  NavigationPerformanceIcon,
  NavigationWorkIcon,
} from '@icons/navigation';
import type { IconComponent } from '@icons';
import { CenteredTileGrid } from '@/components/system/centered-tile-grid';
import { LiquidGridCard } from '@/components/system/liquid-grid-card';
import { WorkspacePage, WorkspaceTitleCard } from '@/components/system/workspace';
import {
  buildRememberedCatalogHref,
  buildRememberedInboxHref,
  buildRememberedInsightsHref,
  usePageStateMemoryVersion,
} from '@/lib/page-state-memory';
import { deriveNavigationAvailability } from '@/lib/navigation-availability';
import { activeSenaCatalog } from '@/lib/sena-catalog';
import { gridCardSurfaceClassName, type GridCardColorKey } from '@/lib/grid-card-colors';
import { translateUiLiteral } from '@/lib/translations';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';
import { buildOverviewModel } from './overview/view-model';

function CommandAction({
  description,
  icon: Icon,
  label,
  tone,
  to,
}: {
  description: string;
  icon: IconComponent;
  label: string;
  tone: GridCardColorKey;
  to: string;
}) {
  const content = (
    <LiquidGridCard
      className={`command-action-tile ${gridCardSurfaceClassName(tone)}`}
      contentClassName="px-4 py-5 text-center sm:px-6 md:px-8 md:py-6"
    >
      <span className="command-action-content flex h-full flex-col items-center justify-center gap-4 md:gap-6">
        <Icon className="command-action-icon size-12 shrink-0 text-foreground sm:size-16 md:size-20" aria-hidden="true" />
        <span className="command-action-copy space-y-2 md:space-y-3">
          <span className="command-action-label khmer-safe-display block text-lg font-semibold text-foreground sm:text-xl md:text-2xl">{label}</span>
          <span className="command-action-description khmer-safe-display mx-auto block min-h-[3.75rem] max-w-[18rem] text-xs leading-5 text-muted-foreground sm:text-sm sm:leading-6 md:min-h-[4.5rem]">
            {description}
          </span>
        </span>
      </span>
    </LiquidGridCard>
  );

  return <Link className="block w-full min-w-0 focus-visible:outline-none" to={to}>{content}</Link>;
}

export function CommandHomeRoute() {
  const inventory = useInventory();
  const { language, showAnalysisPage } = usePreferences();
  usePageStateMemoryVersion();
  const catalog = activeSenaCatalog(inventory.catalog) ?? inventory.catalog;
  const skuCount = catalog?.skus.filter((sku) => !sku.archived).length ?? 0;
  const serviceCount = catalog?.services.filter((service) => !service.archived).length ?? 0;
  const observationCount = Math.max(
    inventory.observations?.length ?? 0,
    inventory.latestRun?.observationCount ?? 0,
    inventory.workspaceSummary?.intervalCount ?? 0,
  );
  const overviewModel = buildOverviewModel({
    catalog: inventory.catalog,
    detailBySkuId: {},
    forceStaleUpdateReminder: false,
    language,
    observations: inventory.observations,
    orderBatches: inventory.orderBatches ?? [],
    workspaceSummary: inventory.workspaceSummary,
  });
  const nextMove = overviewModel.tasks[0]?.actionLabel ?? translateUiLiteral(language, 'Start Work');
  const navigationAvailability = deriveNavigationAvailability(inventory);
  const commandActions = [
    {
      description: translateUiLiteral(language, 'Open supplier, customer, and intake work that needs a decision.'),
      icon: NavigationWorkIcon,
      isVisible: true,
      label: translateUiLiteral(language, 'Start Work'),
      to: buildRememberedInboxHref(),
      tone: 'continue-work',
    },
    {
      description: translateUiLiteral(language, 'Save a stock count, customer order, sale, supplier order, or custom event.'),
      icon: ActionCreatePackageIcon,
      isVisible: navigationAvailability.hasWorkCapture,
      label: translateUiLiteral(language, 'Capture Update'),
      to: '/work/capture',
      tone: 'capture-update',
    },
    {
      description: translateUiLiteral(language, 'Manage active and archived SKUs and services.'),
      icon: NavigationCatalogIcon,
      isVisible: navigationAvailability.hasCatalogTab,
      label: translateUiLiteral(language, 'Open Catalog'),
      to: buildRememberedCatalogHref(),
      tone: 'open-catalog',
    },
    {
      description: translateUiLiteral(language, 'Open pressure, money, or explanation workspaces.'),
      icon: NavigationPerformanceIcon,
      isVisible: showAnalysisPage && navigationAvailability.hasInsights,
      label: translateUiLiteral(language, 'Open Insights'),
      to: buildRememberedInsightsHref(),
      tone: 'open-insights',
    },
  ] satisfies Array<{
    description: string;
    icon: IconComponent;
    isVisible: boolean;
    label: string;
    to: string;
    tone: GridCardColorKey;
  }>;
  const visibleCommandActions = commandActions.filter((action) => action.isVisible);
  const commandActionColumns = visibleCommandActions.length === 3 ? 3 : Math.min(2, visibleCommandActions.length);

  return (
    <WorkspacePage fitViewport className="gap-5" data-slot="command-home-page">
      <WorkspaceTitleCard
        eyebrow={translateUiLiteral(language, 'Home')}
        title={translateUiLiteral(language, 'Command home')}
        descriptor={translateUiLiteral(language, 'Start with the next operational decision, then move into capture, catalog, or insight work.')}
        className="rounded-xl"
      >
        <div className="grid gap-3 sm:grid-cols-3" data-slot="command-home-summary-grid">
          <div className="rounded-lg border border-border/60 bg-white px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <EntitySignalIcon className="size-4" aria-hidden="true" />
              {translateUiLiteral(language, 'Next move')}
            </p>
            <p className="mt-2 text-base font-semibold text-foreground">{nextMove}</p>
          </div>
          <div className="rounded-lg border border-border/60 bg-white px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <EntitySkuIcon className="size-4" aria-hidden="true" />
              {translateUiLiteral(language, 'Catalog')}
            </p>
            <p className="mt-2 text-base font-semibold text-foreground">
              {translateUiLiteral(language, '{count} items', { count: skuCount + serviceCount })}
            </p>
          </div>
          <div className="rounded-lg border border-border/60 bg-white px-4 py-3">
            <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <EntityTransitIcon className="size-4" aria-hidden="true" />
              {translateUiLiteral(language, 'Saved updates')}
            </p>
            <p className="mt-2 text-base font-semibold text-foreground">
              {translateUiLiteral(language, '{count} updates', { count: observationCount })}
            </p>
          </div>
        </div>
      </WorkspaceTitleCard>

      <CenteredTileGrid className="command-home-action-grid" columns={commandActionColumns}>
        {visibleCommandActions.map((action) => (
          <CommandAction
            key={action.label}
            description={action.description}
            icon={action.icon}
            label={action.label}
            to={action.to}
            tone={action.tone}
          />
        ))}
      </CenteredTileGrid>
    </WorkspacePage>
  );
}
