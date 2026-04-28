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
import { activeSenaCatalog } from '@/lib/sena-catalog';
import { gridCardSurfaceClassName, type GridCardColorKey } from '@/lib/grid-card-colors';
import { translateUiLiteral } from '@/lib/translations';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';
import { buildOverviewModel } from './overview/view-model';

function CommandAction({
  description,
  disabled,
  icon: Icon,
  label,
  tone,
  to,
}: {
  description: string;
  disabled?: boolean;
  icon: IconComponent;
  label: string;
  tone: GridCardColorKey;
  to: string;
}) {
  const content = (
    <LiquidGridCard
      className={gridCardSurfaceClassName(tone)}
      contentClassName="px-4 py-5 text-center sm:px-6 md:px-8 md:py-6"
    >
      <span className="flex h-full flex-col items-center justify-center gap-4 md:gap-6">
        <Icon className="size-12 shrink-0 text-foreground sm:size-16 md:size-20" aria-hidden="true" />
        <span className="space-y-2 md:space-y-3">
          <span className="block text-lg font-semibold text-foreground sm:text-xl md:text-2xl">{label}</span>
          <span className="mx-auto block min-h-[3.75rem] max-w-[18rem] text-xs leading-5 text-muted-foreground sm:text-sm sm:leading-6 md:min-h-[4.5rem]">
            {description}
          </span>
        </span>
      </span>
    </LiquidGridCard>
  );

  if (disabled) {
    return <div aria-disabled="true" className="opacity-55">{content}</div>;
  }

  return <Link className="block min-w-0 focus-visible:outline-none" to={to}>{content}</Link>;
}

export function CommandHomeRoute() {
  const inventory = useInventory();
  const { language } = usePreferences();
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
  const nextMove = overviewModel.tasks[0]?.actionLabel ?? translateUiLiteral(language, 'Continue Work');

  return (
    <WorkspacePage fitViewport className="gap-5">
      <WorkspaceTitleCard
        eyebrow={translateUiLiteral(language, 'Home')}
        title={translateUiLiteral(language, 'Command home')}
        descriptor={translateUiLiteral(language, 'Start with the next operational decision, then move into capture, catalog, or insight work.')}
        className="rounded-xl"
      >
        <div className="grid gap-3 sm:grid-cols-3">
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

      <CenteredTileGrid>
        <CommandAction
          icon={NavigationWorkIcon}
          label={translateUiLiteral(language, 'Continue Work')}
          description={translateUiLiteral(language, 'Open supplier, customer, and intake work that needs a decision.')}
          tone="continue-work"
          to={buildRememberedInboxHref()}
        />
        <CommandAction
          disabled={skuCount + serviceCount === 0}
          icon={ActionCreatePackageIcon}
          label={translateUiLiteral(language, 'Capture Update')}
          description={translateUiLiteral(language, 'Save a stock count, customer order, sale, supplier order, or custom event.')}
          tone="capture-update"
          to="/work/capture"
        />
        <CommandAction
          icon={NavigationCatalogIcon}
          label={translateUiLiteral(language, 'Open Catalog')}
          description={translateUiLiteral(language, 'Manage active and archived SKUs and services.')}
          tone="open-catalog"
          to={buildRememberedCatalogHref()}
        />
        <CommandAction
          disabled={observationCount < 2}
          icon={NavigationPerformanceIcon}
          label={translateUiLiteral(language, 'Open Insights')}
          description={translateUiLiteral(language, 'Open pressure, money, or explanation workspaces.')}
          tone="open-insights"
          to={buildRememberedInsightsHref()}
        />
      </CenteredTileGrid>
    </WorkspacePage>
  );
}
