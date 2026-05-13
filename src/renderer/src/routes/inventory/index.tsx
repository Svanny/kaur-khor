import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { Dialog as DialogPrimitive } from 'radix-ui';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  defaultAnimateLayoutChanges,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ActionCloseIcon, ActionColumns3CogIcon, ActionConfirmIcon, ActionCreatePackageIcon, ActionDragHandleIcon, ActionOpenExternalIcon, ActionPanelLeftRightDashedIcon, ActionWaitingIcon } from '@icons/actions';
import { EntityLayersIcon, EntityPackageMinusIcon, EntityPackageSearchIcon, EntityReceiptDocumentIcon, EntityServiceIcon, EntitySkuIcon, EntityTransitIcon, EntityWarehouseIcon, EntityWavesIcon } from '@icons/entities';
import type { IconComponent } from '@icons';
import { NavigationCollapseIcon, NavigationDashboardIcon, NavigationExpandIcon, NavigationGridIcon, NavigationNextIcon, NavigationPreviousIcon, NavigationTaskListIcon } from '@icons/navigation';
import { StatusActivityIcon, StatusCorrectionIcon, StatusHeartPulseIcon, StatusInsightIcon, StatusRadarIcon, StatusScheduleIcon, StatusSquareActivityIcon, StatusTimingIcon, StatusTrendChartIcon, StatusTrendUpDownIcon, StatusUmbrellaIcon, StatusUnavailableIcon, StatusWarningIcon } from '@icons/status';
import { MetricRibbon } from '@/components/system/metric-ribbon';
import { HelpTooltip } from '@/components/system/help-tooltip';
import { RouteBackButton } from '@/components/system/page-navigation';
import { ResponsiveToggleFilter } from '@/components/system/responsive-toggle-filter';
import { RIGHT_RAIL_ASIDE_CLASS_NAME, rightRailLayoutClassName } from '@/components/system/right-rail-layout';
import { SupplierBadge, SupplierFilter, supplierFilterQueryValue, supplierFilterValueForQuery } from '@/components/system/supplier';
import {
  createHeaderedTableLayout,
  HeaderedTable,
  HeaderedTableBody,
  HeaderedTableCellStack,
  HeaderedTableHeader,
  HeaderedTableHeaderCell,
  HeaderedTableMobileLabel,
  HeaderedTableRow,
  hasRenderableRows,
} from '@/components/system/headered-table';
import { ItemIdentityBlock } from '@/components/system/item-identity';
import { compactFilterControlClassName, compactTimeframeControlClassName } from '@/components/system/compact-controls';
import { WorkspaceActionRow, WorkspaceEmpty, WorkspacePage, WorkspaceTitleCard } from '@/components/system/workspace';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ChromeTabs, ChromeTabsList, ChromeTabsTrigger } from '@/components/ui/chrome-tabs';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useBenchmarkRouteReady } from '@/lib/benchmark-route-ready';
import {
  buildInventorySearchParams,
  inventoryProjectionHorizonValues,
  inventoryRangeValues,
  inventoryRowSetValues,
  inventoryScopeValues,
  inventoryViewPresetValues,
  readInventoryRouteState,
  type InventoryProjectionHorizonValue,
  type InventoryRouteState,
  type InventoryViewPresetValue,
} from '@/lib/navigation-state';
import { buildRememberedInboxHref } from '@/lib/page-state-memory';
import { activeSenaCatalog, type SupplierFilterValue } from '@/lib/sena-catalog';
import { translateUiLiteral } from '@/lib/translations';
import { cn } from '@/lib/utils';
import { rowHoverClassName } from '@/lib/interactive-surface';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';
import { PerformanceSectionShell } from '@/routes/performance/chrome';
import { useSenaDetailHydration } from '@/routes/performance/use-sena-detail-hydration';
import { WorkspaceTitleCardWireframe, WireframeRailCards, WireframeRows } from '@/routes/loading-wireframes';
import { InventoryExpandedRow } from './expanded-row';
import { InventoryInspector } from './inspector';
import { ProjectionMatrix } from './projection-matrix';
import {
  inventoryColumnLabel,
  inventoryCustomColumnOptions,
  resolveInventoryColumns,
} from './columns';
import {
  deriveInventoryViewModel,
  formatInventoryCellParts,
  type InventoryColumnKey,
  type InventoryGridRow,
} from './view-model';

const inventoryGridLayout = createHeaderedTableLayout({
  breakpoint: 'xl',
  columns: 'minmax(13rem,1.45fr) minmax(6.5rem,0.7fr) minmax(6.5rem,0.7fr) minmax(7.25rem,0.78fr) minmax(6.5rem,0.65fr) minmax(8.25rem,0.85fr) minmax(7.25rem,0.72fr) minmax(6rem,0.55fr)',
  gap: 4,
  overflowX: 'auto',
});

type InventoryMainTab = 'grid' | 'projection';

const EMPTY_DETAIL_MAP = new Map();
const COLUMN_DIALOG_CLASS =
  'fixed left-[max(1rem,calc(50vw-20rem))] top-[max(1rem,calc(50svh-20rem))] z-50 grid aspect-square h-auto max-h-[84svh] w-[min(40rem,calc(100vw-2rem),calc(100vh-6rem))] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-[1.75rem] border border-border/70 bg-white shadow-[0_28px_90px_rgba(48,31,20,0.22)] outline-none';
const COLUMN_DIALOG_HEADER_CLASS = 'flex items-start justify-between gap-3 border-b border-border/60 px-8 py-7';
const COLUMN_DIALOG_BODY_CLASS = 'overflow-y-auto px-8 py-6';
const COLUMN_DIALOG_FOOTER_CLASS = 'sticky bottom-0 flex items-center justify-between gap-3 border-t border-border/60 bg-white px-8 py-5';
const COLUMN_DIALOG_FOOTER_BUTTON_CLASS = 'h-9 rounded-[0.9rem] px-4';
const INVENTORY_TABLE_COLUMN_GAP = 0;

type InventoryColumnWidthSpec = {
  maxWidth: number;
  minWidth: number;
  preferredWidth: number;
  wrapLabel: boolean;
};

type InventoryColumnPage = {
  columns: InventoryColumnKey[];
  index: number;
  widths: Partial<Record<InventoryColumnKey | 'details', number>>;
};

const inventoryColumnWidthSpecs: Record<InventoryColumnKey | 'details', InventoryColumnWidthSpec> = {
  adjustments: { minWidth: 104, maxWidth: 150, preferredWidth: 124, wrapLabel: true },
  cover: { minWidth: 112, maxWidth: 170, preferredWidth: 132, wrapLabel: true },
  demand: { minWidth: 118, maxWidth: 170, preferredWidth: 138, wrapLabel: true },
  details: { minWidth: 136, maxWidth: 176, preferredWidth: 148, wrapLabel: false },
  flow: { minWidth: 116, maxWidth: 170, preferredWidth: 138, wrapLabel: true },
  freshness: { minWidth: 156, maxWidth: 230, preferredWidth: 184, wrapLabel: true },
  inTransit: { minWidth: 116, maxWidth: 170, preferredWidth: 138, wrapLabel: true },
  inventoryPosition: { minWidth: 148, maxWidth: 220, preferredWidth: 176, wrapLabel: true },
  item: { minWidth: 252, maxWidth: 360, preferredWidth: 292, wrapLabel: false },
  leadTime: { minWidth: 130, maxWidth: 190, preferredWidth: 154, wrapLabel: true },
  leadTimeUncertainty: { minWidth: 156, maxWidth: 230, preferredWidth: 190, wrapLabel: true },
  lostDemand: { minWidth: 124, maxWidth: 180, preferredWidth: 150, wrapLabel: true },
  nextReceipt: { minWidth: 136, maxWidth: 200, preferredWidth: 164, wrapLabel: true },
  onHand: { minWidth: 112, maxWidth: 160, preferredWidth: 132, wrapLabel: true },
  orderProbability: { minWidth: 150, maxWidth: 220, preferredWidth: 180, wrapLabel: true },
  pipeline: { minWidth: 136, maxWidth: 200, preferredWidth: 166, wrapLabel: true },
  projection: { minWidth: 142, maxWidth: 210, preferredWidth: 172, wrapLabel: true },
  receipts: { minWidth: 110, maxWidth: 160, preferredWidth: 132, wrapLabel: true },
  serviceExposure: { minWidth: 156, maxWidth: 230, preferredWidth: 186, wrapLabel: true },
  stockoutRisk: { minWidth: 132, maxWidth: 190, preferredWidth: 160, wrapLabel: true },
  unitsIn: { minWidth: 110, maxWidth: 160, preferredWidth: 132, wrapLabel: true },
  unitsOut: { minWidth: 110, maxWidth: 160, preferredWidth: 132, wrapLabel: true },
};

function toggleIconForScope(value: string): IconComponent {
  if (value === 'services') {
    return EntityServiceIcon;
  }
  if (value === 'all') {
    return EntityLayersIcon;
  }
  return EntitySkuIcon;
}

function SelectControl<TValue extends string>({
  ariaLabel,
  icon,
  label,
  language,
  options,
  value,
  onValueChange,
}: {
  ariaLabel: string;
  icon: ReactNode;
  label: string;
  language: 'en' | 'km';
  options: readonly TValue[];
  value: TValue;
  onValueChange: (value: TValue) => void;
}) {
  return (
    <Select value={value} onValueChange={(nextValue) => onValueChange(nextValue as TValue)}>
      <SelectTrigger
        aria-label={ariaLabel}
        className={cn(
          'min-w-[10.5rem] justify-between border border-border/70 bg-card text-sm font-medium text-foreground shadow-xs [&_svg]:opacity-100',
          compactTimeframeControlClassName,
        )}
      >
        <span className="inline-flex min-w-0 items-center gap-2">
          {icon}
          <span className="truncate">{label}</span>
        </span>
      </SelectTrigger>
      <SelectContent position="popper">
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {option.includes('d')
              ? translateUiLiteral(language, option.replace('d', 'D'))
              : translateUiLiteral(language, option[0]!.toUpperCase() + option.slice(1))}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const viewPresetIcons: Record<InventoryViewPresetValue, IconComponent> = {
  custom: NavigationGridIcon,
  flow: EntityWavesIcon,
  forecast: StatusTrendUpDownIcon,
  health: StatusHeartPulseIcon,
  pipeline: EntityWarehouseIcon,
};

const inventoryColumnIcons: Record<InventoryColumnKey, IconComponent> = {
  adjustments: StatusCorrectionIcon,
  cover: StatusUmbrellaIcon,
  demand: StatusActivityIcon,
  flow: EntityWavesIcon,
  freshness: StatusTimingIcon,
  inTransit: EntityTransitIcon,
  inventoryPosition: EntityWarehouseIcon,
  item: EntitySkuIcon,
  leadTime: StatusScheduleIcon,
  leadTimeUncertainty: ActionWaitingIcon,
  lostDemand: StatusUnavailableIcon,
  nextReceipt: EntityReceiptDocumentIcon,
  onHand: EntitySkuIcon,
  orderProbability: StatusRadarIcon,
  pipeline: EntityTransitIcon,
  projection: StatusTrendChartIcon,
  receipts: EntityReceiptDocumentIcon,
  serviceExposure: EntityServiceIcon,
  stockoutRisk: StatusWarningIcon,
  unitsIn: ActionCreatePackageIcon,
  unitsOut: EntityPackageMinusIcon,
};

function InventoryColumnIcon({
  className,
  column,
}: {
  className?: string;
  column: InventoryColumnKey;
}) {
  const Icon = inventoryColumnIcons[column];
  return <Icon className={cn('size-4 shrink-0 text-muted-foreground', className)} />;
}

function ViewPresetSelect({
  language,
  onValueChange,
  value,
}: {
  language: 'en' | 'km';
  onValueChange: (value: InventoryViewPresetValue) => void;
  value: InventoryViewPresetValue;
}) {
  const SelectedIcon = viewPresetIcons[value];

  return (
    <Select value={value} onValueChange={(nextValue) => onValueChange(nextValue as InventoryViewPresetValue)}>
      <SelectTrigger
        aria-label={translateUiLiteral(language, 'Select inventory view preset')}
        className={cn(
          'min-w-[11rem] justify-between border border-border/70 bg-card text-sm font-medium text-foreground shadow-xs [&_svg]:opacity-100',
          compactTimeframeControlClassName,
        )}
      >
        <span className="inline-flex min-w-0 items-center gap-2">
          <SelectedIcon className="size-4" />
          <span className="truncate">
            {translateUiLiteral(language, value[0]!.toUpperCase() + value.slice(1))}
          </span>
        </span>
      </SelectTrigger>
      <SelectContent position="popper">
        {inventoryViewPresetValues.map((option) => {
          const OptionIcon = viewPresetIcons[option];
          return (
            <SelectItem key={option} value={option}>
              <span className="inline-flex items-center gap-2">
                <OptionIcon className="size-4 text-muted-foreground" />
                {translateUiLiteral(language, option[0]!.toUpperCase() + option.slice(1))}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

const columnHelpByKey: Record<InventoryColumnKey | 'details', string> = {
  adjustments: 'Manual corrections or stock adjustments recorded in the selected date range. Use this to spot count fixes or non-sale inventory changes.',
  cover: 'How long current stock is expected to last at modeled demand, shown with the reorder point that marks the restock threshold.',
  demand: 'Estimated units used or sold per day from recent observations, service consumption, and retail activity.',
  flow: 'Selected-range inventory movement split into units in, units out, and adjustments so receipts, use, and corrections stay distinct.',
  freshness: 'How old the latest count or inventory evidence is. Older evidence means the on-hand estimate is less grounded in a recent count.',
  inTransit: 'Units already in supplier orders or receipts that are expected to arrive but are not yet counted on hand.',
  inventoryPosition: 'On-hand stock plus inbound stock, net of modeled demand. This approximates the stock position after known pipeline movement.',
  item: 'The SKU or service being inspected, with supplier context and focus reasons that explain why it appears in this view.',
  lostDemand: 'Estimated customer demand that could not be fulfilled because stock or service capacity was constrained.',
  onHand: 'Current estimated stock on hand. The first number is the posterior mean; the range shows the credible low-high band.',
  orderProbability: 'Estimated probability that an order or reorder need is active based on stock, demand, and lead-time evidence.',
  pipeline: 'Inbound pipeline status: how many units are in transit and the next expected receipt window.',
  projection: 'Expected future stock at the selected projection horizon, shown as mean and credible range.',
  receipts: 'Units received into inventory during the selected date range.',
  serviceExposure: 'Linked services that may be constrained by this item, or the bottleneck context for a service row.',
  stockoutRisk: 'Modeled probability that this item reaches or stays at zero available stock over the active horizon.',
  unitsIn: 'Inventory units added in the selected range, primarily supplier receipts and positive adjustments.',
  unitsOut: 'Inventory units consumed, sold, or otherwise removed in the selected range.',
  details: 'Open the row detail panel with posterior stock, flow decomposition, inbound pipeline, and linked service capacity.',
};

const columnHelpHrefByKey: Record<InventoryColumnKey | 'details', string> = {
  adjustments: '/settings/help#inventory-column-adjustments',
  cover: '/settings/help#inventory-column-cover',
  demand: '/settings/help#inventory-column-demand',
  details: '/settings/help#inventory-column-details',
  flow: '/settings/help#inventory-column-flow',
  freshness: '/settings/help#inventory-column-freshness',
  inTransit: '/settings/help#inventory-column-in-transit',
  inventoryPosition: '/settings/help#inventory-column-inventory-position',
  item: '/settings/help#inventory-column-item',
  leadTime: '/settings/help#inventory-column-lead-time',
  leadTimeUncertainty: '/settings/help#inventory-column-lead-time-uncertainty',
  lostDemand: '/settings/help#inventory-column-lost-demand',
  nextReceipt: '/settings/help#inventory-column-next-receipt',
  onHand: '/settings/help#inventory-column-on-hand',
  orderProbability: '/settings/help#inventory-column-order-probability',
  pipeline: '/settings/help#inventory-column-pipeline',
  projection: '/settings/help#inventory-column-projection',
  receipts: '/settings/help#inventory-column-receipts',
  serviceExposure: '/settings/help#inventory-column-service-exposure',
  stockoutRisk: '/settings/help#inventory-column-stockout-risk',
  unitsIn: '/settings/help#inventory-column-units-in',
  unitsOut: '/settings/help#inventory-column-units-out',
};

function InventoryHeaderHelp({
  column,
  label,
}: {
  column: InventoryColumnKey | 'details';
  label: string;
}) {
  return (
    <HelpTooltip
      className="inline-flex items-center justify-center text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
      content={columnHelpByKey[column]}
      helpHref={columnHelpHrefByKey[column]}
      label={label}
    />
  );
}

function detailMap<T>(details: Record<string, T | null>) {
  return new Map(
    Object.entries(details).filter((entry): entry is [string, T] => Boolean(entry[1])),
  );
}

function rowSortValue(row: InventoryGridRow, column: InventoryColumnKey, horizon: InventoryProjectionHorizonValue) {
  if (column === 'item') {
    return row.name;
  }
  if (row.type === 'service') {
    if (column === 'onHand') return row.sellableUnitsMean;
    if (column === 'projection') return row.projectedSellableByHorizon[horizon].mean ?? -1;
    if (column === 'stockoutRisk') return row.bottleneckProbability;
    if (column === 'serviceExposure') return row.serviceExposureSort;
    return row.name;
  }
  if (column === 'onHand') return row.onHandMean;
  if (column === 'cover') return row.daysOfCover ?? -1;
  if (column === 'projection') return row.projectedUnitsByHorizon[horizon].mean ?? -1;
  if (column === 'pipeline' || column === 'inTransit') return row.inTransitMean ?? -1;
  if (column === 'stockoutRisk') return row.stockoutRisk;
  if (column === 'freshness') return row.freshnessAgeDays ?? 9999;
  if (column === 'serviceExposure') return row.serviceExposureSort;
  return row.name;
}

function sortRows(rows: InventoryGridRow[], sortColumn: InventoryColumnKey, direction: 'asc' | 'desc', horizon: InventoryProjectionHorizonValue) {
  return [...rows].sort((left, right) => {
    const leftValue = rowSortValue(left, sortColumn, horizon);
    const rightValue = rowSortValue(right, sortColumn, horizon);
    const comparison = typeof leftValue === 'number' && typeof rightValue === 'number'
      ? leftValue - rightValue
      : String(leftValue).localeCompare(String(rightValue));
    return direction === 'asc' ? comparison : -comparison;
  });
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function textFromReactNode(value: ReactNode): string {
  if (value == null || typeof value === 'boolean') {
    return '';
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(textFromReactNode).join(' ');
  }
  return '';
}

function measureTextWidth(text: string, font = '600 14px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif') {
  if (typeof document === 'undefined') {
    return text.length * 7.5;
  }
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    return text.length * 7.5;
  }
  context.font = font;
  return context.measureText(text).width;
}

function wrappedTextWidth(text: string, spec: InventoryColumnWidthSpec) {
  const words = text.split(/\s+/).filter(Boolean);
  const longestWord = words.reduce((longest, word) => (word.length > longest.length ? word : longest), '');
  const longestWordWidth = measureTextWidth(longestWord);
  const fullTextWidth = measureTextWidth(text);
  const wrapAwareWidth = spec.wrapLabel ? Math.max(longestWordWidth + 32, Math.min(fullTextWidth + 32, spec.preferredWidth)) : fullTextWidth + 32;
  return clampNumber(wrapAwareWidth, spec.minWidth, spec.maxWidth);
}

function measuredColumnWidth({
  column,
  horizon,
  language,
  rows,
  showConfidenceInterval,
}: {
  column: InventoryColumnKey | 'details';
  horizon: InventoryProjectionHorizonValue;
  language: 'en' | 'km';
  rows: InventoryGridRow[];
  showConfidenceInterval: boolean;
}) {
  const spec = inventoryColumnWidthSpecs[column];
  const headerText = column === 'details' ? translateUiLiteral(language, 'Details') : inventoryColumnLabel(column, language);
  const samples = rows.slice(0, 8).map((row) => {
    if (column === 'details') {
      return translateUiLiteral(language, 'Expand');
    }
    if (column === 'item') {
      return row.name;
    }
    const cellParts = formatInventoryCellParts(row, column, language, horizon, showConfidenceInterval);
    return [textFromReactNode(cellParts.primary), textFromReactNode(cellParts.secondary)].filter(Boolean).join(' ');
  });
  return Math.max(spec.minWidth, wrappedTextWidth(headerText, spec), ...samples.map((sample) => wrappedTextWidth(sample, spec)));
}

function distributeExtraWidth(
  columns: InventoryColumnKey[],
  widths: Partial<Record<InventoryColumnKey | 'details', number>>,
  availableWidth: number,
) {
  let remaining = availableWidth - columns.reduce((total, column) => total + (widths[column] ?? 0), 0);
  if (remaining <= 0 || columns.length === 0) {
    return widths;
  }

  const nextWidths = { ...widths };
  let growableColumns = columns.filter((column) => (nextWidths[column] ?? 0) < inventoryColumnWidthSpecs[column].maxWidth);
  while (remaining > 0.5 && growableColumns.length > 0) {
    const increment = remaining / growableColumns.length;
    let used = 0;
    for (const column of growableColumns) {
      const currentWidth = nextWidths[column] ?? inventoryColumnWidthSpecs[column].minWidth;
      const nextWidth = Math.min(inventoryColumnWidthSpecs[column].maxWidth, currentWidth + increment);
      used += nextWidth - currentWidth;
      nextWidths[column] = nextWidth;
    }
    remaining -= used;
    growableColumns = growableColumns.filter((column) => (nextWidths[column] ?? 0) < inventoryColumnWidthSpecs[column].maxWidth - 0.5);
    if (used <= 0.5) {
      break;
    }
  }
  if (remaining > 0.5) {
    const fillColumns = columns.length > 0 ? columns : ['details' as const];
    const increment = remaining / fillColumns.length;
    for (const column of fillColumns) {
      nextWidths[column] = (nextWidths[column] ?? inventoryColumnWidthSpecs[column].preferredWidth) + increment;
    }
  }
  return nextWidths;
}

function columnGroupWidth(
  group: InventoryColumnKey[],
  widths: Partial<Record<InventoryColumnKey | 'details', number>>,
  availableWidth: number,
) {
  return group.reduce((total, column) => total + Math.min(widths[column] ?? inventoryColumnWidthSpecs[column].preferredWidth, availableWidth), 0);
}

function balanceColumnGroups(
  groups: InventoryColumnKey[][],
  widths: Partial<Record<InventoryColumnKey | 'details', number>>,
  availableWidth: number,
) {
  if (groups.length <= 1) {
    return groups;
  }

  const balancedGroups = groups.map((group) => [...group]);
  const totalColumns = balancedGroups.reduce((total, group) => total + group.length, 0);
  const targetSmallPageSize = Math.floor(totalColumns / balancedGroups.length);
  const targetLargePageSize = Math.ceil(totalColumns / balancedGroups.length);
  const orderedColumns = balancedGroups.flat();
  const countBalancedGroups = balancedGroups.map((_, index) => {
    const pageSize = targetSmallPageSize + (index < totalColumns % balancedGroups.length ? 1 : 0);
    return orderedColumns.splice(0, pageSize);
  });

  if (countBalancedGroups.every((group) => columnGroupWidth(group, widths, availableWidth) <= availableWidth)) {
    return countBalancedGroups;
  }

  for (let pass = 0; pass < totalColumns; pass += 1) {
    let moved = false;

    for (let index = 0; index < balancedGroups.length - 1; index += 1) {
      const leftGroup = balancedGroups[index]!;
      const rightGroup = balancedGroups[index + 1]!;
      if (leftGroup.length <= targetSmallPageSize || rightGroup.length >= targetLargePageSize) {
        continue;
      }
      const candidate = leftGroup[leftGroup.length - 1];
      if (!candidate) {
        continue;
      }
      const candidateWidth = Math.min(widths[candidate] ?? inventoryColumnWidthSpecs[candidate].preferredWidth, availableWidth);
      if (columnGroupWidth(rightGroup, widths, availableWidth) + candidateWidth > availableWidth) {
        continue;
      }
      rightGroup.unshift(leftGroup.pop()!);
      moved = true;
    }

    if (!moved) {
      break;
    }
  }

  return balancedGroups;
}

function buildColumnPages({
  columns,
  horizon,
  language,
  rows,
  showConfidenceInterval,
  tableWidth,
}: {
  columns: InventoryColumnKey[];
  horizon: InventoryProjectionHorizonValue;
  language: 'en' | 'km';
  rows: InventoryGridRow[];
  showConfidenceInterval: boolean;
  tableWidth: number;
}): InventoryColumnPage[] {
  const dataColumns = columns.filter((column) => column !== 'item');
  const itemWidth = measuredColumnWidth({ column: 'item', horizon, language, rows, showConfidenceInterval });
  const detailsWidth = measuredColumnWidth({ column: 'details', horizon, language, rows, showConfidenceInterval });
  const availableDataWidth = Math.max(96, tableWidth - itemWidth - detailsWidth - INVENTORY_TABLE_COLUMN_GAP * 2);
  const measuredWidths = dataColumns.reduce<Partial<Record<InventoryColumnKey | 'details', number>>>((widths, column) => {
    widths[column] = measuredColumnWidth({ column, horizon, language, rows, showConfidenceInterval });
    return widths;
  }, { details: detailsWidth, item: itemWidth });

  const columnGroups: InventoryColumnKey[][] = [];
  let currentGroup: InventoryColumnKey[] = [];
  let currentWidth = 0;

  for (const column of dataColumns) {
    const width = measuredWidths[column] ?? inventoryColumnWidthSpecs[column].preferredWidth;
    const wouldFit = currentGroup.length === 0 || currentWidth + width <= availableDataWidth;
    if (!wouldFit) {
      columnGroups.push(currentGroup);
      currentGroup = [];
      currentWidth = 0;
    }
    currentGroup.push(column);
    currentWidth += Math.min(width, availableDataWidth);
  }

  if (currentGroup.length > 0) {
    columnGroups.push(currentGroup);
  }

  const groups = columnGroups.length > 0
    ? balanceColumnGroups(columnGroups, measuredWidths, availableDataWidth)
    : [[]];
  return groups.map((group, index) => {
    const pageWidths = { ...measuredWidths };
    if (group.length === 1) {
      const column = group[0]!;
      pageWidths[column] = Math.min(pageWidths[column] ?? availableDataWidth, availableDataWidth);
    }
    return {
      columns: group,
      index,
      widths: distributeExtraWidth(group, pageWidths, availableDataWidth),
    };
  });
}

function gridTemplateForColumns(columns: InventoryColumnKey[], widths: Partial<Record<InventoryColumnKey | 'details', number>>) {
  const cellTemplates = columns.map((column) => `${Math.round(widths[column] ?? inventoryColumnWidthSpecs[column].preferredWidth)}px`);
  return [...cellTemplates, `${Math.round(widths.details ?? inventoryColumnWidthSpecs.details.preferredWidth)}px`].join(' ');
}

function isCenteredInventoryColumn(column: InventoryColumnKey) {
  return column !== 'item';
}

function routeCustomColumnsWithOrder(columns: string[]) {
  const validColumns = new Set<InventoryColumnKey>(inventoryCustomColumnOptions);
  const selectedColumns = columns.filter((column): column is InventoryColumnKey =>
    validColumns.has(column as InventoryColumnKey),
  );
  return selectedColumns.length > 0
    ? selectedColumns
    : inventoryCustomColumnOptions.filter((column) => resolveInventoryColumns('custom', []).includes(column));
}

function SortableInventoryColumnRow({
  column,
  language,
}: {
  column: InventoryColumnKey;
  language: 'en' | 'km';
}) {
  const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } = useSortable({
    id: column,
    animateLayoutChanges: (args) => defaultAnimateLayoutChanges({ ...args, wasDragging: true }),
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-[1rem] border border-border/60 bg-[#fffaf3] px-4 py-3 shadow-[0_1px_0_rgba(255,255,255,0.75)]',
        isDragging && 'opacity-50',
      )}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    >
      <button
        {...attributes}
        {...listeners}
        ref={setActivatorNodeRef}
        aria-label={translateUiLiteral(language, 'Reorder {name}', { name: inventoryColumnLabel(column, language) })}
        className="flex size-9 items-center justify-center rounded-[0.85rem] text-muted-foreground transition-colors hover:bg-white hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
        type="button"
      >
        <ActionDragHandleIcon className="size-4" />
      </button>
      <span className="flex min-w-0 items-center gap-2">
        <InventoryColumnIcon column={column} />
        <span className="min-w-0 truncate text-sm font-medium text-foreground">
          {inventoryColumnLabel(column, language)}
        </span>
      </span>
    </div>
  );
}

function InventoryColumnDialogs({
  columns,
  language,
  onColumnsChange,
}: {
  columns: string[];
  language: 'en' | 'km';
  onColumnsChange: (columns: InventoryColumnKey[]) => void;
}) {
  const [columnsOpen, setColumnsOpen] = useState(false);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [draftColumns, setDraftColumns] = useState<InventoryColumnKey[]>(() => routeCustomColumnsWithOrder(columns));
  const layoutSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  useEffect(() => {
    if (!columnsOpen && !layoutOpen) {
      setDraftColumns(routeCustomColumnsWithOrder(columns));
    }
  }, [columns, columnsOpen, layoutOpen]);

  function resetDraft() {
    setDraftColumns(routeCustomColumnsWithOrder(columns));
  }

  function commitDraft() {
    onColumnsChange(draftColumns);
    setColumnsOpen(false);
    setLayoutOpen(false);
  }

  function closeColumns() {
    resetDraft();
    setColumnsOpen(false);
  }

  function closeLayout() {
    resetDraft();
    setLayoutOpen(false);
  }

  function toggleDraftColumn(column: InventoryColumnKey) {
    setDraftColumns((current) => (
      current.includes(column)
        ? current.filter((entry) => entry !== column)
        : [...current, column]
    ));
  }

  function handleDragEnd(event: DragEndEvent) {
    const activeId = event.active.id;
    const overId = event.over?.id;
    if (!overId || activeId === overId) {
      return;
    }
    setDraftColumns((current) => {
      const fromIndex = current.indexOf(activeId as InventoryColumnKey);
      const toIndex = current.indexOf(overId as InventoryColumnKey);
      if (fromIndex < 0 || toIndex < 0) {
        return current;
      }
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved!);
      return next;
    });
  }

  return (
    <div className="flex flex-wrap justify-start gap-2">
      <DialogPrimitive.Root modal={false} open={columnsOpen} onOpenChange={(open) => {
        if (open) {
          setLayoutOpen(false);
          setDraftColumns(routeCustomColumnsWithOrder(columns));
          setColumnsOpen(true);
          return;
        }
        closeColumns();
      }}>
        <Button size="sm" type="button" variant="outline" onClick={() => setColumnsOpen(true)}>
          <ActionColumns3CogIcon className="size-4" />
          {translateUiLiteral(language, 'Columns')}
        </Button>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-transparent data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            className={COLUMN_DIALOG_CLASS}
            onEscapeKeyDown={(event) => {
              event.preventDefault();
              closeColumns();
            }}
          >
            <DialogPrimitive.Title className="sr-only">
              {translateUiLiteral(language, 'Inventory columns')}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              {translateUiLiteral(language, 'Choose which inventory columns are shown in the custom view.')}
            </DialogPrimitive.Description>
            <div className={COLUMN_DIALOG_HEADER_CLASS}>
              <div>
                <p className="text-[1.75rem] font-semibold text-foreground">{translateUiLiteral(language, 'Columns')}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {translateUiLiteral(language, 'Choose which inventory columns appear in the custom view.')}
                </p>
              </div>
              <button
                aria-label={translateUiLiteral(language, 'Close columns')}
                className="rounded-full p-2.5 text-foreground transition-colors hover:bg-white/80"
                type="button"
                onClick={closeColumns}
              >
                <ActionCloseIcon className="size-5" />
              </button>
            </div>
            <div className={COLUMN_DIALOG_BODY_CLASS}>
              <div className="grid gap-0">
                {inventoryCustomColumnOptions.map((column) => (
                  <label key={column} className="flex items-center gap-3 border-b border-border/50 py-4 first:pt-0 last:border-b-0 last:pb-0 text-sm text-foreground">
                    <Checkbox
                      aria-label={translateUiLiteral(language, 'Show {name}', { name: inventoryColumnLabel(column, language) })}
                      checked={draftColumns.includes(column)}
                      onCheckedChange={() => toggleDraftColumn(column)}
                    />
                    <span className="flex min-w-0 items-center gap-2">
                      <InventoryColumnIcon column={column} />
                      <span className="min-w-0 truncate font-medium">{inventoryColumnLabel(column, language)}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
            <div className={COLUMN_DIALOG_FOOTER_CLASS}>
              <div className="text-sm text-muted-foreground">
                {translateUiLiteral(language, '{count} columns selected', { count: String(draftColumns.length) })}
              </div>
              <div className="flex items-center gap-3">
                <Button className={COLUMN_DIALOG_FOOTER_BUTTON_CLASS} size="sm" type="button" variant="outline" onClick={closeColumns}>
                  <ActionCloseIcon data-icon="inline-start" />
                  {translateUiLiteral(language, 'Cancel')}
                </Button>
                <Button className={COLUMN_DIALOG_FOOTER_BUTTON_CLASS} size="sm" type="button" onClick={commitDraft}>
                  <ActionConfirmIcon data-icon="inline-start" />
                  {translateUiLiteral(language, 'Ok')}
                </Button>
              </div>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      <DialogPrimitive.Root modal={false} open={layoutOpen} onOpenChange={(open) => {
        if (open) {
          setColumnsOpen(false);
          setDraftColumns(routeCustomColumnsWithOrder(columns));
          setLayoutOpen(true);
          return;
        }
        closeLayout();
      }}>
        <Button size="sm" type="button" variant="outline" onClick={() => setLayoutOpen(true)}>
          <ActionPanelLeftRightDashedIcon className="size-4" />
          {translateUiLiteral(language, 'Layout')}
        </Button>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-transparent data-[state=open]:animate-in data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            className={COLUMN_DIALOG_CLASS}
            onEscapeKeyDown={(event) => {
              event.preventDefault();
              closeLayout();
            }}
          >
            <DialogPrimitive.Title className="sr-only">
              {translateUiLiteral(language, 'Inventory column layout')}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">
              {translateUiLiteral(language, 'Drag inventory columns to reorder the custom view.')}
            </DialogPrimitive.Description>
            <div className={COLUMN_DIALOG_HEADER_CLASS}>
              <div>
                <p className="text-[1.75rem] font-semibold text-foreground">{translateUiLiteral(language, 'Layout')}</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {translateUiLiteral(language, 'Drag columns to reorder the custom view.')}
                </p>
              </div>
              <button
                aria-label={translateUiLiteral(language, 'Close layout')}
                className="rounded-full p-2.5 text-foreground transition-colors hover:bg-white/80"
                type="button"
                onClick={closeLayout}
              >
                <ActionCloseIcon className="size-5" />
              </button>
            </div>
            <div className={COLUMN_DIALOG_BODY_CLASS}>
              <DndContext sensors={layoutSensors} onDragEnd={handleDragEnd}>
                <SortableContext items={draftColumns} strategy={verticalListSortingStrategy}>
                  <div className="grid gap-3">
                    {draftColumns.map((column) => (
                      <SortableInventoryColumnRow key={column} column={column} language={language} />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
            <div className={COLUMN_DIALOG_FOOTER_CLASS}>
              <div className="text-sm text-muted-foreground">
                {translateUiLiteral(language, 'Drag rows to reorder columns.')}
              </div>
              <div className="flex items-center gap-3">
                <Button className={COLUMN_DIALOG_FOOTER_BUTTON_CLASS} size="sm" type="button" variant="outline" onClick={closeLayout}>
                  <ActionCloseIcon data-icon="inline-start" />
                  {translateUiLiteral(language, 'Cancel')}
                </Button>
                <Button className={COLUMN_DIALOG_FOOTER_BUTTON_CLASS} size="sm" type="button" onClick={commitDraft}>
                  <ActionConfirmIcon data-icon="inline-start" />
                  {translateUiLiteral(language, 'Ok')}
                </Button>
              </div>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  );
}

function InventoryWindowFrame({
  children,
  language,
  mainTab,
  onMainTabChange,
}: {
  children: ReactNode;
  language: 'en' | 'km';
  mainTab: InventoryMainTab;
  onMainTabChange: (tab: InventoryMainTab) => void;
}) {
  return (
    <ChromeTabs
      className="relative min-w-0 gap-0"
      value={mainTab}
      onValueChange={(nextValue) => onMainTabChange(nextValue as InventoryMainTab)}
    >
      <ChromeTabsList aria-label={translateUiLiteral(language, 'Select inventory table window')} className="min-w-0">
        {([
          { icon: StatusSquareActivityIcon, label: translateUiLiteral(language, 'Health grid'), value: 'grid' },
          { icon: StatusInsightIcon, label: translateUiLiteral(language, 'Projection matrix'), value: 'projection' },
        ] as const).map((tab) => {
          const TabIcon = tab.icon;
          return (
            <ChromeTabsTrigger key={tab.value} leading={<TabIcon className="size-4" />} value={tab.value}>
              {tab.label}
            </ChromeTabsTrigger>
          );
        })}
      </ChromeTabsList>
      {children}
    </ChromeTabs>
  );
}

function inventoryPanelTitle(language: 'en' | 'km', mainTab: InventoryMainTab) {
  return translateUiLiteral(language, mainTab === 'projection' ? 'Projection matrix' : 'Inventory health grid');
}

function inventoryPanelTooltip(language: 'en' | 'km', mainTab: InventoryMainTab) {
  return translateUiLiteral(
    language,
    mainTab === 'projection'
      ? 'Projected stock ranges across inventory rows, shown as sparklines and horizon values.'
      : 'Sortable inventory rows with stock, flow, cover, projection, pipeline, service exposure, and freshness.',
  );
}

function inventoryGridDescriptor({
  language,
  mainTab,
  rowSet,
  rowCount,
  windowLabel,
}: {
  language: 'en' | 'km';
  mainTab: InventoryMainTab;
  rowSet: string;
  rowCount: number;
  windowLabel: string;
}) {
  if (mainTab === 'projection') {
    return translateUiLiteral(language, 'Sparkline comparison of projected stock ranges for the visible inventory rows.');
  }
  return translateUiLiteral(
    language,
    rowSet === 'focus'
      ? '{count} focused inventory rows in {window}, with sortable stock, cover, pipeline, service exposure, and freshness columns.'
      : '{count} active inventory rows in {window}, with sortable stock, cover, pipeline, service exposure, and freshness columns.',
    { count: String(rowCount), window: windowLabel },
  );
}

function InventoryItemName({
  row,
}: {
  row: InventoryGridRow;
}) {
  return (
    <Link
      className="min-w-0 break-words font-semibold text-foreground hover:text-primary"
      to={row.href}
      onClick={(event) => event.stopPropagation()}
    >
      {row.name}
    </Link>
  );
}

export function InsightsInventoryRoute() {
  const inventory = useInventory();
  const { language, showAnalysisPage, showHeartbeatRibbons, showRightRailCards } = usePreferences();
  const [searchParams, setSearchParams] = useSearchParams();
  const routeState = readInventoryRouteState(searchParams);
  const supplierFilter = supplierFilterValueForQuery(routeState.supplier);
  const visibleCatalog = useMemo(() => activeSenaCatalog(inventory.catalog), [inventory.catalog]);
  const baseCatalog = visibleCatalog ?? {
    bundles: [],
    schemaVersion: 1,
    services: [],
    sharingMask: [],
    skus: [],
  };
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [sortColumn, setSortColumn] = useState<InventoryColumnKey>('item');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [mainTab, setMainTab] = useState<InventoryMainTab>('grid');
  const [showConfidenceInterval, setShowConfidenceInterval] = useState(false);
  const [columnPageIndex, setColumnPageIndex] = useState(0);
  const [gridTableWidth, setGridTableWidth] = useState(0);
  const gridTableRef = useRef<HTMLDivElement | null>(null);

  const baseModel = useMemo(() => {
    if (!visibleCatalog || !inventory.workspaceSummary) {
      return null;
    }
    return deriveInventoryViewModel({
      catalog: visibleCatalog,
      customColumns: routeState.customColumns,
      language,
      observations: inventory.observations,
      projectionHorizon: routeState.projectionHorizon,
      range: routeState.range,
      recordUpdateContext: inventory.recordUpdateContext,
      rowSet: routeState.rowSet,
      scope: routeState.scope,
      serviceDetailsById: EMPTY_DETAIL_MAP,
      skuDetailsById: EMPTY_DETAIL_MAP,
      supplier: supplierFilter,
      viewPreset: routeState.viewPreset,
      workspaceSummary: inventory.workspaceSummary,
    });
  }, [inventory.observations, inventory.recordUpdateContext, inventory.workspaceSummary, language, routeState.customColumns, routeState.projectionHorizon, routeState.range, routeState.rowSet, routeState.scope, routeState.viewPreset, supplierFilter, visibleCatalog]);

  const hydrationRows = baseModel?.visibleRows.slice(0, routeState.rowSet === 'focus' ? 24 : 40) ?? [];
  const selectedOrExpandedRows = baseModel?.rows.filter((row) => row.id === selectedRowId || row.id === expandedRowId) ?? [];
  const hydrationSkuIds = Array.from(new Set([...hydrationRows, ...selectedOrExpandedRows].filter((row) => row.type === 'sku').map((row) => row.id)));
  const hydrationServiceIds = Array.from(new Set([...hydrationRows, ...selectedOrExpandedRows].filter((row) => row.type === 'service').map((row) => row.id)));
  const hydration = useSenaDetailHydration('Recent', {
    deferInitialHydrationMs: 80,
    priorityServiceIds: hydrationServiceIds,
    prioritySkuIds: hydrationSkuIds,
    serviceIds: hydrationServiceIds,
    skuIds: hydrationSkuIds,
    timeframeCacheKey: `inventory:${routeState.scope}:${routeState.rowSet}:${routeState.supplier ?? 'all'}`,
  });

  const model = useMemo(() => {
    if (!visibleCatalog || !inventory.workspaceSummary) {
      return null;
    }
    return deriveInventoryViewModel({
      catalog: visibleCatalog,
      customColumns: routeState.customColumns,
      language,
      observations: inventory.observations,
      projectionHorizon: routeState.projectionHorizon,
      range: routeState.range,
      recordUpdateContext: inventory.recordUpdateContext,
      rowSet: routeState.rowSet,
      scope: routeState.scope,
      serviceDetailsById: detailMap(hydration.serviceDetailsById),
      skuDetailsById: detailMap(hydration.skuDetailsById),
      supplier: supplierFilter,
      viewPreset: routeState.viewPreset,
      workspaceSummary: inventory.workspaceSummary,
    });
  }, [hydration.serviceDetailsById, hydration.skuDetailsById, inventory.observations, inventory.recordUpdateContext, inventory.workspaceSummary, language, routeState.customColumns, routeState.projectionHorizon, routeState.range, routeState.rowSet, routeState.scope, routeState.viewPreset, supplierFilter, visibleCatalog]);

  useEffect(() => {
    if (selectedRowId && !model?.rows.some((row) => row.id === selectedRowId)) {
      setSelectedRowId(null);
    }
    if (expandedRowId && !model?.rows.some((row) => row.id === expandedRowId)) {
      setExpandedRowId(null);
    }
  }, [expandedRowId, model?.rows, selectedRowId]);

  useBenchmarkRouteReady('insights.inventory', !inventory.isLoading && (!visibleCatalog || model != null), {
    diagnostics: {
      rowCount: model?.visibleRows.length ?? 0,
      scope: routeState.scope,
    },
  });

  const routeCustomColumnsKey = routeState.customColumns.join('|');
  const columns = useMemo(
    () => resolveInventoryColumns(routeState.viewPreset, routeState.customColumns),
    [routeCustomColumnsKey, routeState.viewPreset],
  );
  const columnsKey = columns.join('|');
  const visibleRows = useMemo(
    () => model
      ? sortRows(model.visibleRows, sortColumn, sortDirection, routeState.projectionHorizon)
      : [],
    [model, routeState.projectionHorizon, sortColumn, sortDirection],
  );

  useLayoutEffect(() => {
    const element = gridTableRef.current;
    if (!element || mainTab !== 'grid') {
      setGridTableWidth(0);
      return;
    }

    function updateTableWidth() {
      const nextWidth = Math.floor(element.getBoundingClientRect().width);
      setGridTableWidth((currentWidth) => (Math.abs(currentWidth - nextWidth) <= 1 ? currentWidth : nextWidth));
    }

    updateTableWidth();
    window.addEventListener('resize', updateTableWidth);
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateTableWidth);
    resizeObserver?.observe(element);
    const animationFrame = window.requestAnimationFrame(updateTableWidth);

    return () => {
      window.removeEventListener('resize', updateTableWidth);
      resizeObserver?.disconnect();
      window.cancelAnimationFrame(animationFrame);
    };
  }, [mainTab]);

  useEffect(() => {
    setColumnPageIndex(0);
  }, [columnsKey]);

  const columnPages = useMemo(
    () => buildColumnPages({
      columns,
      horizon: routeState.projectionHorizon,
      language,
      rows: visibleRows,
      showConfidenceInterval,
      tableWidth: gridTableWidth || 1120,
    }),
    [columns, gridTableWidth, language, routeState.projectionHorizon, showConfidenceInterval, visibleRows],
  );
  const clampedColumnPageIndex = Math.min(columnPageIndex, Math.max(0, columnPages.length - 1));
  const activeColumnPage = columnPages[clampedColumnPageIndex] ?? { columns: [], index: 0, widths: {} };
  const activeGridColumns = useMemo(
    () => ['item', ...activeColumnPage.columns] as InventoryColumnKey[],
    [activeColumnPage.columns],
  );

  useEffect(() => {
    setColumnPageIndex((currentPageIndex) => Math.min(currentPageIndex, Math.max(0, columnPages.length - 1)));
  }, [columnPages.length]);

  function updateRouteState(nextState: Partial<InventoryRouteState>, replace = false) {
    setSearchParams(buildInventorySearchParams(searchParams, nextState), { replace });
  }

  function toggleSort(column: InventoryColumnKey) {
    if (sortColumn === column) {
      setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortColumn(column);
    setSortDirection(column === 'item' ? 'asc' : 'desc');
  }

  function applyCustomColumns(nextColumns: InventoryColumnKey[]) {
    updateRouteState({ customColumns: nextColumns, viewPreset: 'custom' });
  }

  if (!showAnalysisPage) {
    return <Navigate replace to="/" />;
  }

  if (inventory.isLoading && !visibleCatalog) {
    return (
      <WorkspacePage className="gap-5">
        <WorkspaceTitleCardWireframe />
        <div className={rightRailLayoutClassName(showRightRailCards)}>
          <div className="grid gap-6">
            <WireframeRows rows={6} />
          </div>
          {showRightRailCards ? <WireframeRailCards /> : null}
        </div>
      </WorkspacePage>
    );
  }

  if (!visibleCatalog || visibleCatalog.skus.length === 0) {
    return (
      <WorkspacePage>
        <WorkspaceEmpty
          title={translateUiLiteral(language, 'No inventory items yet.')}
          hint={translateUiLiteral(language, 'Create your first SKU to start tracking inventory health.')}
          action={
            <WorkspaceActionRow>
              <Button asChild>
                <Link to="/catalog/skus/new">
                  <EntitySkuIcon data-icon="inline-start" />
                  {translateUiLiteral(language, 'Create first SKU')}
                </Link>
              </Button>
            </WorkspaceActionRow>
          }
        />
      </WorkspacePage>
    );
  }

  if (!inventory.workspaceSummary || !model) {
    return (
      <WorkspacePage>
        <WorkspaceEmpty
          title={translateUiLiteral(language, 'Inventory analysis is not ready yet.')}
          hint={translateUiLiteral(language, 'Record an update or run analysis to calculate cover, pipeline, and projections.')}
          action={
            <WorkspaceActionRow>
              <Button asChild>
                <Link to="/work/capture">
                  <NavigationTaskListIcon data-icon="inline-start" />
                  {translateUiLiteral(language, 'Start update')}
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to={buildRememberedInboxHref()}>
                  <NavigationDashboardIcon data-icon="inline-start" />
                  {translateUiLiteral(language, 'Open Work')}
                </Link>
              </Button>
            </WorkspaceActionRow>
          }
        />
      </WorkspacePage>
    );
  }

  const inventoryGridStyle = {
    ...inventoryGridLayout.style,
    gridTemplateColumns: gridTemplateForColumns(activeGridColumns, activeColumnPage.widths),
  } satisfies CSSProperties;
  const selectedRow = model.rows.find((row) => row.id === selectedRowId) ?? null;
  const scopeOptions = inventoryScopeValues.map((value) => ({
    icon: toggleIconForScope(value),
    label: translateUiLiteral(language, value === 'all' ? 'All' : value === 'skus' ? 'SKUs' : 'Services'),
    value,
  }));
  const rowSetOptions = inventoryRowSetValues.map((value) => ({
    icon: value === 'focus' ? EntityPackageSearchIcon : EntityLayersIcon,
    label: translateUiLiteral(language, value === 'focus' ? 'Focus' : 'All'),
    value,
  }));
  const ribbonIconByKey: Record<string, ReactNode> = {
    'below-reorder': <StatusWarningIcon className="size-4" />,
    'in-transit': <EntityTransitIcon className="size-4" />,
    'median-cover': <StatusUmbrellaIcon className="size-4" />,
    'units-in': <ActionCreatePackageIcon className="size-4" />,
    'units-out': <EntityPackageMinusIcon className="size-4" />,
  };
  const gridDescriptor = inventoryGridDescriptor({
    language,
    mainTab,
    rowCount: visibleRows.length,
    rowSet: routeState.rowSet,
    windowLabel: model.windowLabel,
  });

  return (
    <WorkspacePage className="gap-5">
      <WorkspaceTitleCard
        title={
          <span className="flex min-w-0 items-center gap-3">
            <RouteBackButton className="shrink-0" />
            <span className="truncate">{translateUiLiteral(language, 'Inventory')}</span>
          </span>
        }
        descriptor={translateUiLiteral(language, 'Stock on hand, in/out flow, cover, inbound pipeline, and projections.')}
        helperExemptReason="Inventory title and descriptor explain the route scope."
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ResponsiveToggleFilter
              ariaLabel={translateUiLiteral(language, 'Select inventory scope')}
              toggleClassName="rounded-full"
              options={scopeOptions}
              value={routeState.scope}
              onValueChange={(nextValue) => updateRouteState({ scope: nextValue })}
            />
            <SupplierFilter
              catalog={baseCatalog}
              className={compactFilterControlClassName}
              value={supplierFilter}
              onChange={(nextSupplier: SupplierFilterValue) =>
                updateRouteState({ supplier: supplierFilterQueryValue(nextSupplier) })
              }
            />
            <SelectControl
              ariaLabel={translateUiLiteral(language, 'Select inventory range')}
              icon={<StatusScheduleIcon className="size-4" />}
              label={translateUiLiteral(language, 'Range: {value}', { value: routeState.range.replace('d', 'D') })}
              language={language}
              options={inventoryRangeValues}
              value={routeState.range}
              onValueChange={(range) => updateRouteState({ range })}
            />
            <SelectControl
              ariaLabel={translateUiLiteral(language, 'Select projection horizon')}
              icon={<EntityTransitIcon className="size-4" />}
              label={translateUiLiteral(language, 'Projection: {value}', { value: routeState.projectionHorizon.replace('d', 'D') })}
              language={language}
              options={inventoryProjectionHorizonValues}
              value={routeState.projectionHorizon}
              onValueChange={(projectionHorizon) => updateRouteState({ projectionHorizon })}
            />
          </div>
        }
      >
        {showHeartbeatRibbons ? (
          <MetricRibbon
            columns={5}
            items={model.strip.map((metric) => ({
              key: metric.key,
              label: metric.label,
              value: metric.value,
              detail: metric.detail,
              icon: ribbonIconByKey[metric.key] ?? <EntitySkuIcon className="size-4" />,
            }))}
          />
        ) : null}
      </WorkspaceTitleCard>

      <main className="grid min-w-0 gap-0">
        <InventoryWindowFrame
          language={language}
          mainTab={mainTab}
          onMainTabChange={setMainTab}
        >
        <div className={rightRailLayoutClassName(showRightRailCards)}>
          <PerformanceSectionShell
            className="mt-[-2px]"
            helpHref={mainTab === 'projection' ? '/settings/help#inventory-projection-matrix' : '/settings/help#inventory-health-grid'}
            title={inventoryPanelTitle(language, mainTab)}
            tooltip={inventoryPanelTooltip(language, mainTab)}
            descriptor={gridDescriptor}
            headerActions={(
              <div className="flex flex-wrap items-center justify-end gap-2">
                <ResponsiveToggleFilter
                  ariaLabel={translateUiLiteral(language, 'Select inventory row set')}
                  toggleClassName="rounded-full"
                  options={rowSetOptions}
                  value={routeState.rowSet}
                  onValueChange={(nextValue) => updateRouteState({ rowSet: nextValue })}
                />
                <ViewPresetSelect
                  language={language}
                  value={routeState.viewPreset}
                  onValueChange={(viewPreset) => updateRouteState({ viewPreset })}
                />
                <label className={cn(compactFilterControlClassName, 'inline-flex h-9 items-center gap-2 rounded-full border border-border/70 bg-card px-3 text-sm font-medium text-foreground shadow-xs')}>
                  <Switch
                    aria-label={translateUiLiteral(language, 'Show 95CI interval')}
                    checked={showConfidenceInterval}
                    size="sm"
                    onCheckedChange={setShowConfidenceInterval}
                  />
                  {translateUiLiteral(language, '95CI interval')}
                </label>
              </div>
            )}
            headerControls={(
              <div className="flex w-full flex-wrap items-end justify-between gap-3">
                <div className="flex flex-wrap items-end justify-start gap-3">
                  {routeState.viewPreset === 'custom' && mainTab === 'grid' ? (
                    <InventoryColumnDialogs
                      columns={routeState.customColumns}
                      language={language}
                      onColumnsChange={applyCustomColumns}
                    />
                  ) : null}
                </div>
                {mainTab === 'grid' ? (
                  <div className="flex items-center gap-2">
                    <Button
                      aria-label={translateUiLiteral(language, 'Previous column page')}
                      className="size-9 rounded-[0.9rem]"
                      disabled={clampedColumnPageIndex <= 0}
                      size="icon"
                      type="button"
                      variant="outline"
                      onClick={() => setColumnPageIndex((currentPageIndex) => Math.max(0, currentPageIndex - 1))}
                    >
                      <NavigationPreviousIcon className="size-4" />
                    </Button>
                    <span className="min-w-[4.5rem] text-center text-xs font-medium text-muted-foreground">
                      {translateUiLiteral(language, 'Page {current} / {total}', {
                        current: String(clampedColumnPageIndex + 1),
                        total: String(columnPages.length),
                      })}
                    </span>
                    <Button
                      aria-label={translateUiLiteral(language, 'Next column page')}
                      className="size-9 rounded-[0.9rem]"
                      disabled={clampedColumnPageIndex >= columnPages.length - 1}
                      size="icon"
                      type="button"
                      variant="outline"
                      onClick={() => setColumnPageIndex((currentPageIndex) => Math.min(columnPages.length - 1, currentPageIndex + 1))}
                    >
                      <NavigationNextIcon className="size-4" />
                    </Button>
                  </div>
                ) : null}
              </div>
            )}
            contentClassName="px-0 py-0"
          >
            {mainTab === 'projection' ? (
              <ProjectionMatrix language={language} rows={model.projectionMatrix} showConfidenceInterval={showConfidenceInterval} />
            ) : routeState.rowSet === 'focus' && !hasRenderableRows(visibleRows) ? (
              <div className="px-6 py-8">
                <WorkspaceEmpty
                  title={translateUiLiteral(language, 'No focused inventory rows right now.')}
                  hint={translateUiLiteral(language, 'Switch to All to inspect every active item.')}
                  action={
                    <Button type="button" variant="outline" onClick={() => updateRouteState({ rowSet: 'all' })}>
                      <EntityLayersIcon data-icon="inline-start" />
                      {translateUiLiteral(language, 'Show All')}
                    </Button>
                  }
                />
              </div>
            ) : (
              <HeaderedTable ref={gridTableRef} overflowX="hidden">
                <div className={inventoryGridLayout.containerClassName} style={inventoryGridStyle}>
                  <HeaderedTableHeader className={inventoryGridLayout.headerClassName}>
                    {activeGridColumns.map((column) => (
                      <HeaderedTableHeaderCell key={column} className={cn(isCenteredInventoryColumn(column) && 'text-center')} helperExemptReason="Inventory grid column includes an adjacent helper tooltip.">
                        <span className={cn('inline-flex min-w-0 max-w-full items-start gap-1.5', isCenteredInventoryColumn(column) && 'justify-center')}>
                          <button
                            type="button"
                            data-design-icon-exempt="inventory-table-header"
                            className={cn(
                              'inline-flex min-w-0 items-center whitespace-normal break-words text-[0.68rem] uppercase leading-4 tracking-[0.12em] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                              isCenteredInventoryColumn(column) ? 'justify-center text-center' : 'text-left',
                            )}
                            onClick={() => toggleSort(column)}
                          >
                            <span className="min-w-0 whitespace-normal break-words">{inventoryColumnLabel(column, language)}</span>
                          </button>
                          <InventoryHeaderHelp column={column} label={inventoryColumnLabel(column, language)} />
                        </span>
                      </HeaderedTableHeaderCell>
                    ))}
                    <HeaderedTableHeaderCell className="text-center text-[0.68rem] tracking-[0.12em]" helperExemptReason="Inventory grid details column includes an adjacent helper tooltip.">
                      <span className="inline-flex min-w-0 max-w-full items-start justify-center gap-1.5">
                        <span className="min-w-0 whitespace-normal break-words leading-4">{translateUiLiteral(language, 'Details')}</span>
                        <InventoryHeaderHelp column="details" label={translateUiLiteral(language, 'Details')} />
                      </span>
                    </HeaderedTableHeaderCell>
                  </HeaderedTableHeader>
                  <HeaderedTableBody className={inventoryGridLayout.bodyClassName}>
                    {visibleRows.map((row) => {
                      const expanded = expandedRowId === row.id;
                      return (
                        <div key={`${row.type}:${row.id}`} className="contents">
                          <HeaderedTableRow
                            className={cn(rowHoverClassName, inventoryGridLayout.rowClassName)}
                            aria-selected={selectedRowId === row.id}
                            onClick={() => setSelectedRowId(row.id)}
                          >
                            {activeGridColumns.map((column) => {
                              const cellParts = column === 'item'
                                ? null
                                : formatInventoryCellParts(row, column, language, routeState.projectionHorizon, showConfidenceInterval);
                              return (
                                <div key={column} className={cn('min-w-0 overflow-hidden', isCenteredInventoryColumn(column) && 'text-center')}>
                                  <HeaderedTableMobileLabel className={inventoryGridLayout.mobileLabelClassName}>
                                    {inventoryColumnLabel(column, language)}
                                  </HeaderedTableMobileLabel>
                                  {column === 'item' ? (
                                    <ItemIdentityBlock
                                      align="center"
                                      imagePath={row.imagePath}
                                      metadata={row.type === 'sku' ? <SupplierBadge supplierName={row.supplierName} /> : undefined}
                                      name={<InventoryItemName row={row} />}
                                      size="compact"
                                      type={row.type}
                                    />
                                  ) : (
                                    <HeaderedTableCellStack
                                      primary={cellParts?.primary}
                                      primaryClassName={cn('text-sm break-words', isCenteredInventoryColumn(column) && 'justify-center text-center')}
                                      secondary={cellParts?.secondary}
                                      secondaryClassName={cn('mt-1 text-[0.58rem] leading-4', isCenteredInventoryColumn(column) && 'text-center')}
                                    />
                                  )}
                                </div>
                              );
                            })}
                            <div className="min-w-0 self-start overflow-hidden pt-0 text-center">
                              <HeaderedTableMobileLabel className={inventoryGridLayout.mobileLabelClassName}>
                                {translateUiLiteral(language, 'Details')}
                              </HeaderedTableMobileLabel>
                              <Button
                                aria-expanded={expanded}
                                className="mx-auto h-8 shrink-0 gap-2 rounded-full px-3"
                                size="sm"
                                type="button"
                                variant={expanded ? 'default' : 'outline'}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  setExpandedRowId(expanded ? null : row.id);
                                  setSelectedRowId(row.id);
                                }}
                              >
                                {expanded ? <NavigationCollapseIcon className="size-4" /> : <NavigationExpandIcon className="size-4" />}
                                {expanded ? translateUiLiteral(language, 'Collapse') : translateUiLiteral(language, 'Expand')}
                              </Button>
                            </div>
                          </HeaderedTableRow>
                          {expanded ? <InventoryExpandedRow language={language} row={row} /> : null}
                        </div>
                      );
                    })}
                  </HeaderedTableBody>
                </div>
              </HeaderedTable>
            )}
            {hydration.isHydratingDetails ? (
              <div className="border-t border-border/60 px-6 py-3 text-sm text-muted-foreground">
                {translateUiLiteral(language, 'Hydrating visible inventory detail...')}
              </div>
            ) : null}
          </PerformanceSectionShell>

          {showRightRailCards ? (
            <aside className={RIGHT_RAIL_ASIDE_CLASS_NAME}>
              <InventoryInspector language={language} model={model} selectedRow={selectedRow} />
              {selectedRow ? (
                <Button asChild className="w-full" size="sm" variant="outline">
                  <Link to={selectedRow.href}>
                    <ActionOpenExternalIcon className="size-4" />
                    {translateUiLiteral(language, selectedRow.type === 'sku' ? 'Open SKU' : 'Open service')}
                  </Link>
                </Button>
              ) : null}
            </aside>
          ) : null}
        </div>
        </InventoryWindowFrame>
      </main>
    </WorkspacePage>
  );
}
