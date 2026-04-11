import Fuse from 'fuse.js';
import type { SenaCatalog } from '@shared/sena';
import type { AppLanguage } from '@shared/inventory';
import type { InventoryContextValue } from '@/state/inventory';
import {
  buildAnalysisHref,
  buildOperationsArchiveHref,
  buildCatalogHref,
  buildOverviewHref,
  buildOperationsHref,
  buildPerformanceHref,
  buildServiceDetailHref,
  buildSkuDetailHref,
  type AnalysisScopeValue,
  type AnalysisSectionValue,
  type AnalysisTimeframeValue,
  type ArchiveViewValue,
  type CatalogViewValue,
  type OverviewSearchScope,
  type OverviewTaskFilterValue,
  type OverviewTaskModeValue,
  type OperationsScopeValue,
  type OperationsViewValue,
  type PerformanceRangeValue,
  type PerformanceScopeValue,
  type ServiceActionValue,
  type SkuActionValue,
} from '@/lib/navigation-state';
import {
  activeSenaCatalog,
  archivedSenaServices,
  archivedSenaSkus,
} from '@/lib/sena-catalog';
import { buildOverviewModel, isOverviewSkuTask } from '@/routes/overview/view-model';

export type CommandKind = 'page' | 'tab' | 'entity' | 'workflow' | 'sheet';

export type CommandAction =
  | { href: string; type: 'page' }
  | { href: string; type: 'tab' }
  | { href: string; type: 'entity' }
  | { href: string; type: 'workflow' }
  | { href: string; type: 'sheet' }
  | {
      entityId: string;
      entityName: string;
      entityType: 'sku' | 'service';
      mutation: 'archive' | 'unarchive';
      type: 'catalog-mutation';
    }
  | {
      href: string;
      type: 'settings';
      effect:
        | 'set-language'
        | 'set-currency'
        | 'set-display-mode'
        | 'set-show-explanatory-tooltips'
        | 'set-show-floating-title-actions'
        | 'set-show-right-rail-cards'
        | 'set-show-analysis-page'
        | 'set-smoothing-enabled'
        | 'create-backup-snapshot'
        | 'restore-backup-snapshot'
        | 'export-logs'
        | 'export-planning-data';
      value: boolean | 'en' | 'km' | 'USD' | 'KHR' | 'compact' | 'custom' | 'excel';
    };

export interface CommandDescriptor {
  action: CommandAction;
  aliases: string[];
  emptyQueryRank?: number;
  id: string;
  keywords: string[];
  kind: CommandKind;
  pageId: string;
  pageOrder: number;
  pagePrefixes: string[];
  priority: number;
  subtitle?: string;
  tabOrder?: number;
  title: string;
}

export type CommandPaletteSectionId = 'best-matches' | 'pages' | 'tabs' | 'actions';

export interface CommandPaletteSection {
  id: CommandPaletteSectionId;
  items: CommandDescriptor[];
  title: string;
}

type Translator = (key: string) => string;

function commandKindLabel(kind: CommandKind) {
  if (kind === 'page') {
    return 'Page';
  }
  if (kind === 'tab') {
    return 'Tab';
  }
  if (kind === 'entity') {
    return 'Entity';
  }
  if (kind === 'workflow') {
    return 'Action';
  }
  return 'Sheet';
}

function commandKindSearchTerms(kind: CommandKind) {
  if (kind === 'page') {
    return ['page', 'pages'];
  }
  if (kind === 'tab') {
    return ['tab', 'tabs'];
  }
  if (kind === 'entity') {
    return ['entity', 'entities'];
  }
  if (kind === 'workflow') {
    return ['action', 'actions'];
  }
  return ['sheet', 'sheets'];
}

function commandSearchTerms(command: CommandDescriptor) {
  const kindTerms = commandKindSearchTerms(command.kind);

  return [
    command.title,
    command.subtitle,
    ...command.aliases,
    ...command.keywords,
    ...kindTerms,
    ...kindTerms.map((term) => `${command.title} ${term}`),
  ]
    .filter((value): value is string => Boolean(value))
    .map((value) => normalizeText(value));
}

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function createCommand({
  action,
  aliases = [],
  emptyQueryRank,
  id,
  keywords = [],
  kind,
  pageId,
  pageOrder,
  pagePrefixes,
  priority,
  subtitle,
  tabOrder,
  title,
}: Omit<CommandDescriptor, 'aliases' | 'keywords'> & {
  aliases?: string[];
  keywords?: string[];
}) {
  return {
    action,
    aliases,
    emptyQueryRank,
    id,
    keywords,
    kind,
    pageId,
    pageOrder,
    pagePrefixes,
    priority,
    subtitle,
    tabOrder,
    title,
  } satisfies CommandDescriptor;
}

function pageCommand({
  aliases,
  href,
  id,
  keywords,
  pagePrefix,
  pageId,
  pageOrder,
  priority,
  subtitle,
  title,
}: {
  aliases?: string[];
  href: string;
  id: string;
  keywords?: string[];
  pagePrefix: string;
  pageId: string;
  pageOrder: number;
  priority: number;
  subtitle?: string;
  title: string;
}) {
  return createCommand({
    action: { href, type: 'page' },
    aliases,
    emptyQueryRank: priority,
    id,
    keywords,
    kind: 'page',
    pageId,
    pageOrder,
    pagePrefixes: [pagePrefix],
    priority,
    subtitle,
    title,
  });
}

function tabCommand({
  aliases,
  href,
  id,
  keywords,
  pagePrefix,
  pageId,
  pageOrder,
  priority,
  subtitle,
  tabOrder,
  title,
}: {
  aliases?: string[];
  href: string;
  id: string;
  keywords?: string[];
  pagePrefix: string;
  pageId: string;
  pageOrder: number;
  priority: number;
  subtitle?: string;
  tabOrder: number;
  title: string;
}) {
  return createCommand({
    action: { href, type: 'tab' },
    aliases,
    emptyQueryRank: priority,
    id,
    keywords,
    kind: 'tab',
    pageId,
    pageOrder,
    pagePrefixes: [pagePrefix],
    priority,
    subtitle,
    tabOrder,
    title,
  });
}

function buildPageCommands(t: Translator, { showAnalysisPage }: { showAnalysisPage: boolean }) {
  return [
    pageCommand({
      aliases: ['home', 'dashboard'],
      href: buildOverviewHref(),
      id: 'page:overview',
      keywords: ['queue', 'tasks', 'overview'],
      pageId: 'overview',
      pageOrder: 0,
      pagePrefix: '/',
      priority: 10,
      subtitle: 'Overview queue and follow-up work',
      title: t('navOverview'),
    }),
    pageCommand({
      aliases: ['update', 'capture'],
      href: '/record-update',
      id: 'page:record-update',
      keywords: ['record', 'update', 'observation'],
      pageId: 'record-update',
      pageOrder: 1,
      pagePrefix: '/record-update',
      priority: 11,
      subtitle: 'Capture the next live update',
      title: t('navRecordUpdate'),
    }),
    pageCommand({
      aliases: ['metrics'],
      href: buildPerformanceHref(),
      id: 'page:performance',
      keywords: ['performance', 'range', 'compare'],
      pageId: 'performance',
      pageOrder: 2,
      pagePrefix: '/performance',
      priority: 12,
      subtitle: 'Demand, capacity, and cash movement',
      title: t('navPerformance'),
    }),
    ...(showAnalysisPage
      ? [
          pageCommand({
            aliases: ['workbench', 'analysis'],
            href: buildAnalysisHref(),
            id: 'page:analysis',
            keywords: ['analysis', 'workbench', 'fragility', 'pressure'],
            pageId: 'analysis',
            pageOrder: 4,
            pagePrefix: '/analysis',
            priority: 13,
            subtitle: 'Detailed analysis tools',
            title: t('navAnalysis'),
          }),
        ]
      : []),
    pageCommand({
      aliases: ['inventory'],
      href: buildCatalogHref(),
      id: 'page:catalog',
      keywords: ['catalog', 'skus', 'services'],
      pageId: 'catalog',
      pageOrder: 3,
      pagePrefix: '/catalog',
      priority: 14,
      subtitle: 'Browse SKUs and services',
      title: t('navCatalog'),
    }),
    pageCommand({
      aliases: ['logs', 'history'],
      href: buildOperationsHref(),
      id: 'page:operations',
      keywords: ['operations', 'logs', 'history', 'heatmap'],
      pageId: 'operations',
      pageOrder: 5,
      pagePrefix: '/operations',
      priority: 15,
      subtitle: 'Observation history and logs',
      title: t('navOperations'),
    }),
    pageCommand({
      aliases: ['archive', 'archived'],
      href: buildOperationsArchiveHref(),
      id: 'page:archive',
      keywords: ['archive', 'archived', 'logs'],
      pageId: 'archive',
      pageOrder: 6,
      pagePrefix: '/operations/archive',
      priority: 16,
      subtitle: 'Archived SKUs and services',
      title: t('navArchive'),
    }),
    pageCommand({
      aliases: ['preferences'],
      href: '/settings',
      id: 'page:settings',
      keywords: ['settings', 'preferences'],
      pageId: 'settings',
      pageOrder: 7,
      pagePrefix: '/settings',
      priority: 17,
      subtitle: `${t('settingsPreferencesControlsTitle')} · ${t('settingsSenaParametersPanelTitle')}`,
      title: t('navSettings'),
    }),
    pageCommand({
      aliases: ['guide', 'docs', 'documentation', 'manual', 'faq'],
      href: '/help',
      id: 'page:help',
      keywords: ['help', 'guide', 'docs', 'documentation', 'manual', 'faq', 'support'],
      pageId: 'help',
      pageOrder: 8,
      pagePrefix: '/help',
      priority: 18,
      subtitle: 'User guide, feature explanations, and FAQ',
      title: t('navHelp'),
    }),
  ];
}

function buildOverviewCommands() {
  const scopeCommands: Array<{ label: string; value: OverviewSearchScope }> = [
    { label: 'All overview items', value: 'all' },
    { label: 'Overview SKU tasks', value: 'skus' },
    { label: 'Overview service tasks', value: 'services' },
  ];
  const filterCommands: Array<{ label: string; value: OverviewTaskFilterValue }> = [
    { label: 'All overview tasks', value: 'all' },
    { label: 'To order', value: 'to_order' },
    { label: 'Awaiting receipt', value: 'awaiting_receipt' },
    { label: 'Follow up today', value: 'follow_up_today' },
    { label: 'Ready to receive', value: 'ready_to_receive' },
    { label: 'Received today', value: 'received_today' },
  ];

  return [
    ...scopeCommands.map((command, index) =>
      tabCommand({
        aliases: ['overview', 'scope'],
        href: buildOverviewHref({ scope: command.value }),
        id: `overview:scope:${command.value}`,
        keywords: ['overview', 'scope', command.value],
        pageId: 'overview',
        pageOrder: 0,
        pagePrefix: '/',
        priority: 40 + index,
        subtitle: 'Overview scope',
        tabOrder: index,
        title: command.label,
      }),
    ),
    ...filterCommands.map((command, index) =>
      tabCommand({
        aliases: ['overview', 'filter'],
        href: buildOverviewHref({ filter: command.value }),
        id: `overview:filter:${command.value}`,
        keywords: ['overview', 'filter', command.value],
        pageId: 'overview',
        pageOrder: 0,
        pagePrefix: '/',
        priority: 50 + index,
        subtitle: 'Overview filter',
        tabOrder: scopeCommands.length + index,
        title: command.label,
      }),
    ),
  ];
}

function buildCatalogCommands() {
  const viewCommands: Array<{ label: string; value: CatalogViewValue }> = [
    { label: 'Catalog / All items', value: 'all' },
    { label: 'Catalog / SKUs', value: 'skus' },
    { label: 'Catalog / Services', value: 'services' },
  ];

  return viewCommands.map((command, index) =>
    tabCommand({
      aliases: ['catalog', 'view'],
      href: buildCatalogHref({ view: command.value }),
      id: `catalog:view:${command.value}`,
      keywords: ['catalog', command.value],
      pageId: 'catalog',
      pageOrder: 3,
      pagePrefix: '/catalog',
      priority: 60 + index,
      subtitle: 'Catalog view',
      tabOrder: index,
      title: command.label,
    }),
  );
}

function buildOperationsCommands() {
  const scopeCommands: Array<{ label: string; value: OperationsScopeValue }> = [
    { label: 'Logs / All items', value: 'all' },
    { label: 'Logs / SKUs', value: 'skus' },
    { label: 'Logs / Services', value: 'services' },
  ];
  const viewCommands: Array<{ label: string; value: OperationsViewValue }> = [
    { label: 'Logs / Heatmap view', value: 'heatmap' },
    { label: 'Logs / List view', value: 'all' },
  ];

  return [
    ...scopeCommands.map((command, index) =>
      tabCommand({
        aliases: ['logs', 'operations', 'scope'],
        href: buildOperationsHref({ scope: command.value }),
        id: `operations:scope:${command.value}`,
        keywords: ['operations', 'logs', command.value],
        pageId: 'operations',
        pageOrder: 5,
        pagePrefix: '/operations',
        priority: 70 + index,
        subtitle: 'Operations scope',
        tabOrder: index,
        title: command.label,
      }),
    ),
    ...viewCommands.map((command, index) =>
      tabCommand({
        aliases: ['logs', 'operations', 'view'],
        href: buildOperationsHref({ view: command.value }),
        id: `operations:view:${command.value}`,
        keywords: ['operations', 'logs', 'view', command.value],
        pageId: 'operations',
        pageOrder: 5,
        pagePrefix: '/operations',
        priority: 80 + index,
        subtitle: 'Operations view',
        tabOrder: scopeCommands.length + index,
        title: command.label,
      }),
    ),
  ];
}

function buildArchiveCommands() {
  const viewCommands: Array<{ label: string; value: ArchiveViewValue }> = [
    { label: 'Archive / All items', value: 'all' },
    { label: 'Archive / SKUs', value: 'skus' },
    { label: 'Archive / Services', value: 'services' },
  ];

  return viewCommands.map((command, index) =>
    tabCommand({
      aliases: ['archive', 'view'],
      href: buildOperationsArchiveHref({ view: command.value }),
      id: `archive:view:${command.value}`,
      keywords: ['archive', command.value],
      pageId: 'archive',
      pageOrder: 6,
      pagePrefix: '/operations/archive',
      priority: 85 + index,
      subtitle: 'Archive view',
      tabOrder: index,
      title: command.label,
    }),
  );
}

function buildPerformanceCommands() {
  const rangeCommands: Array<{ label: string; value: PerformanceRangeValue }> = [
    { label: 'Performance / 7D', value: '7d' },
    { label: 'Performance / 30D', value: '30d' },
    { label: 'Performance / 90D', value: '90d' },
  ];
  const scopeCommands: Array<{ label: string; value: PerformanceScopeValue }> = [
    { label: 'Performance / All items', value: 'all' },
    { label: 'Performance / Services', value: 'services' },
    { label: 'Performance / SKUs', value: 'skus' },
  ];

  return [
    ...rangeCommands.map((command, index) =>
      tabCommand({
        aliases: ['performance', 'range'],
        href: buildPerformanceHref({ range: command.value }),
        id: `performance:range:${command.value}`,
        keywords: ['performance', 'range', command.value],
        pageId: 'performance',
        pageOrder: 2,
        pagePrefix: '/performance',
        priority: 90 + index,
        subtitle: 'Performance range',
        tabOrder: index,
        title: command.label,
      }),
    ),
    ...scopeCommands.map((command, index) =>
      tabCommand({
        aliases: ['performance', 'scope'],
        href: buildPerformanceHref({ scope: command.value }),
        id: `performance:scope:${command.value}`,
        keywords: ['performance', 'scope', command.value],
        pageId: 'performance',
        pageOrder: 2,
        pagePrefix: '/performance',
        priority: 100 + index,
        subtitle: 'Performance scope',
        tabOrder: rangeCommands.length + index,
        title: command.label,
      }),
    ),
    tabCommand({
      aliases: ['performance', 'compare'],
      href: buildPerformanceHref({ compare: true }),
      id: 'performance:compare:on',
      keywords: ['performance', 'compare', 'on'],
      pageId: 'performance',
      pageOrder: 2,
      pagePrefix: '/performance',
      priority: 104,
      subtitle: 'Performance comparison',
      tabOrder: rangeCommands.length + scopeCommands.length,
      title: 'Performance / Compare view',
    }),
    tabCommand({
      aliases: ['performance', 'compare'],
      href: buildPerformanceHref({ compare: false }),
      id: 'performance:compare:off',
      keywords: ['performance', 'compare', 'off'],
      pageId: 'performance',
      pageOrder: 2,
      pagePrefix: '/performance',
      priority: 105,
      subtitle: 'Performance comparison',
      tabOrder: rangeCommands.length + scopeCommands.length + 1,
      title: 'Performance / Single view',
    }),
  ];
}

function buildAnalysisCommands() {
  const scopeCommands: Array<{ label: string; value: AnalysisScopeValue }> = [
    { label: 'Analysis / All items', value: 'all' },
    { label: 'Analysis / Services', value: 'services' },
    { label: 'Analysis / SKUs', value: 'skus' },
  ];
  const sectionCommands: Array<{ label: string; value: AnalysisSectionValue }> = [
    { label: 'Analysis / Main view', value: 'workbench' },
    { label: 'Analysis / Pressure', value: 'pressure' },
    { label: 'Analysis / Observations', value: 'observations' },
    { label: 'Analysis / Fragility', value: 'fragility' },
    { label: 'Analysis / Settings', value: 'settings' },
  ];
  const timeframeCommands: AnalysisTimeframeValue[] = ['Recent', '1M', '3M', 'YTD', '1Y', 'MAX'];

  return [
    ...scopeCommands.map((command, index) =>
      tabCommand({
        aliases: ['analysis', 'scope'],
        href: buildAnalysisHref({ scope: command.value }),
        id: `analysis:scope:${command.value}`,
        keywords: ['analysis', 'scope', command.value],
        pageId: 'analysis',
        pageOrder: 4,
        pagePrefix: '/analysis',
        priority: 110 + index,
        subtitle: 'Analysis scope',
        tabOrder: index,
        title: command.label,
      }),
    ),
    ...sectionCommands.map((command, index) =>
      tabCommand({
        aliases: ['analysis', 'section'],
        href: buildAnalysisHref({ section: command.value }),
        id: `analysis:section:${command.value}`,
        keywords: ['analysis', 'section', command.value],
        pageId: 'analysis',
        pageOrder: 4,
        pagePrefix: '/analysis',
        priority: 120 + index,
        subtitle: 'Analysis section',
        tabOrder: scopeCommands.length + index,
        title: command.label,
      }),
    ),
    ...timeframeCommands.map((command, index) =>
      tabCommand({
        aliases: ['analysis', 'timeframe'],
        href: buildAnalysisHref({ timeframe: command }),
        id: `analysis:timeframe:${command}`,
        keywords: ['analysis', 'timeframe', command],
        pageId: 'analysis',
        pageOrder: 4,
        pagePrefix: '/analysis',
        priority: 130 + index,
        subtitle: 'Analysis timeframe',
        tabOrder: scopeCommands.length + sectionCommands.length + index,
        title: `Analysis / Timeframe / ${command}`,
      }),
    ),
  ];
}

function buildWorkflowCommands() {
  return [
    createCommand({
      action: { href: '/catalog/skus/new', type: 'workflow' },
      aliases: ['create sku', 'new item'],
      emptyQueryRank: 17,
      id: 'workflow:new-sku',
      keywords: ['create', 'new', 'sku', 'catalog'],
      kind: 'workflow',
      pageId: 'catalog',
      pageOrder: 3,
      pagePrefixes: ['/catalog'],
      priority: 17,
      subtitle: 'Create a new SKU',
      title: 'New SKU',
    }),
    createCommand({
      action: { href: '/catalog/services/new', type: 'workflow' },
      aliases: ['create service'],
      emptyQueryRank: 18,
      id: 'workflow:new-service',
      keywords: ['create', 'new', 'service', 'catalog'],
      kind: 'workflow',
      pageId: 'catalog',
      pageOrder: 3,
      pagePrefixes: ['/catalog'],
      priority: 18,
      subtitle: 'Create a new service',
      title: 'New service',
    }),
    createCommand({
      action: { href: '/record-update', type: 'workflow' },
      aliases: ['capture update', 'start update'],
      emptyQueryRank: 19,
      id: 'workflow:start-update',
      keywords: ['start', 'update', 'record', 'observation'],
      kind: 'workflow',
      pageId: 'record-update',
      pageOrder: 1,
      pagePrefixes: ['/record-update', '/'],
      priority: 19,
      subtitle: 'Capture the next observation',
      title: 'Start update',
    }),
  ];
}

function buildSettingsCommands({
  currency,
  displayViewMode,
  language,
  senaEngineParameters,
  showExplanatoryTooltips,
  showFloatingTitleActions,
  showAnalysisPage,
  showRightRailCards,
  t,
}: {
  currency: 'USD' | 'KHR';
  displayViewMode: 'compact' | 'custom';
  language: 'en' | 'km';
  senaEngineParameters: { smoothingEnabled?: boolean };
  showExplanatoryTooltips: boolean;
  showFloatingTitleActions: boolean;
  showAnalysisPage: boolean;
  showRightRailCards: boolean;
  t: Translator;
}) {
  const smoothingEnabled = senaEngineParameters.smoothingEnabled ?? true;

  return [
    createCommand({
      action: { effect: 'set-language', href: '/settings', type: 'settings', value: 'en' },
      aliases: ['settings language english'],
      id: 'settings:language:en',
      keywords: ['settings', 'language', 'english', language === 'en' ? 'current' : ''],
      kind: 'workflow',
      pageId: 'settings',
      pageOrder: 6,
      pagePrefixes: ['/settings'],
      priority: 500,
      subtitle: 'Settings / Language',
      title: 'Set language to English',
    }),
    createCommand({
      action: { effect: 'set-language', href: '/settings', type: 'settings', value: 'km' },
      aliases: ['settings language khmer'],
      id: 'settings:language:km',
      keywords: ['settings', 'language', 'khmer', language === 'km' ? 'current' : ''],
      kind: 'workflow',
      pageId: 'settings',
      pageOrder: 6,
      pagePrefixes: ['/settings'],
      priority: 501,
      subtitle: 'Settings / Language',
      title: 'Set language to Khmer',
    }),
    createCommand({
      action: { effect: 'set-currency', href: '/settings', type: 'settings', value: 'USD' },
      aliases: ['settings currency usd'],
      id: 'settings:currency:usd',
      keywords: ['settings', 'currency', 'usd', currency === 'USD' ? 'current' : ''],
      kind: 'workflow',
      pageId: 'settings',
      pageOrder: 6,
      pagePrefixes: ['/settings'],
      priority: 502,
      subtitle: 'Settings / Currency',
      title: 'Set currency to USD',
    }),
    createCommand({
      action: { effect: 'set-currency', href: '/settings', type: 'settings', value: 'KHR' },
      aliases: ['settings currency khr'],
      id: 'settings:currency:khr',
      keywords: ['settings', 'currency', 'khr', currency === 'KHR' ? 'current' : ''],
      kind: 'workflow',
      pageId: 'settings',
      pageOrder: 6,
      pagePrefixes: ['/settings'],
      priority: 503,
      subtitle: 'Settings / Currency',
      title: 'Set currency to KHR',
    }),
    createCommand({
      action: { effect: 'set-display-mode', href: '/settings', type: 'settings', value: 'custom' },
      aliases: ['settings custom view', 'settings full view', 'settings maximal'],
      id: 'settings:view:maximal',
      keywords: ['settings', 'view', 'custom', 'maximal', displayViewMode === 'custom' ? 'current' : ''],
      kind: 'workflow',
      pageId: 'settings',
      pageOrder: 6,
      pagePrefixes: ['/settings'],
      priority: 504,
      subtitle: 'Settings / View mode',
      title: 'Set view mode to Custom View',
    }),
    createCommand({
      action: { effect: 'set-display-mode', href: '/settings', type: 'settings', value: 'compact' },
      aliases: ['settings compact view', 'settings minimal'],
      id: 'settings:view:minimal',
      keywords: ['settings', 'view', 'compact', 'minimal', displayViewMode === 'compact' ? 'current' : ''],
      kind: 'workflow',
      pageId: 'settings',
      pageOrder: 6,
      pagePrefixes: ['/settings'],
      priority: 505,
      subtitle: 'Settings / View mode',
      title: 'Set view mode to Compact View',
    }),
    createCommand({
      action: { effect: 'set-show-explanatory-tooltips', href: '/settings', type: 'settings', value: !showExplanatoryTooltips },
      aliases: ['settings optional help'],
      id: `settings:help:${showExplanatoryTooltips ? 'off' : 'on'}`,
      keywords: ['settings', 'help', 'tooltips', showExplanatoryTooltips ? 'disable' : 'enable'],
      kind: 'workflow',
      pageId: 'settings',
      pageOrder: 6,
      pagePrefixes: ['/settings'],
      priority: 506,
      subtitle: 'Settings / Interface visibility',
      title: `${showExplanatoryTooltips ? 'Hide' : 'Show'} optional help`,
    }),
    createCommand({
      action: { effect: 'set-show-floating-title-actions', href: '/settings', type: 'settings', value: !showFloatingTitleActions },
      aliases: ['settings floating actions'],
      id: `settings:floating-actions:${showFloatingTitleActions ? 'off' : 'on'}`,
      keywords: ['settings', 'floating', 'actions', showFloatingTitleActions ? 'disable' : 'enable'],
      kind: 'workflow',
      pageId: 'settings',
      pageOrder: 6,
      pagePrefixes: ['/settings'],
      priority: 507,
      subtitle: 'Settings / Interface visibility',
      title: `${showFloatingTitleActions ? 'Hide' : 'Show'} floating title actions`,
    }),
    createCommand({
      action: { effect: 'set-show-right-rail-cards', href: '/settings', type: 'settings', value: !showRightRailCards },
      aliases: ['settings right rail cards'],
      id: `settings:right-rail:${showRightRailCards ? 'off' : 'on'}`,
      keywords: ['settings', 'right rail', 'cards', showRightRailCards ? 'disable' : 'enable'],
      kind: 'workflow',
      pageId: 'settings',
      pageOrder: 6,
      pagePrefixes: ['/settings'],
      priority: 508,
      subtitle: 'Settings / Interface visibility',
      title: `${showRightRailCards ? 'Hide' : 'Show'} right rail cards`,
    }),
    createCommand({
      action: { effect: 'set-show-analysis-page', href: '/settings', type: 'settings', value: !showAnalysisPage },
      aliases: ['settings analysis page'],
      id: `settings:analysis-page:${showAnalysisPage ? 'off' : 'on'}`,
      keywords: ['settings', 'analysis', 'page', showAnalysisPage ? 'disable' : 'enable'],
      kind: 'workflow',
      pageId: 'settings',
      pageOrder: 6,
      pagePrefixes: ['/settings'],
      priority: 509,
      subtitle: 'Settings / Interface visibility',
      title: `${showAnalysisPage ? 'Hide' : 'Show'} analysis page`,
    }),
    createCommand({
      action: { effect: 'set-smoothing-enabled', href: '/settings', type: 'settings', value: !smoothingEnabled },
      aliases: ['settings smoothing'],
      id: `settings:smoothing:${smoothingEnabled ? 'off' : 'on'}`,
      keywords: ['settings', 'smoothing', smoothingEnabled ? 'disable' : 'enable'],
      kind: 'workflow',
      pageId: 'settings',
      pageOrder: 6,
      pagePrefixes: ['/settings'],
      priority: 510,
      subtitle: `${t('navSettings')} / ${t('settingsSenaParametersPanelTitle')}`,
      title: `${smoothingEnabled ? 'Disable' : 'Enable'} smoothing`,
    }),
    createCommand({
      action: { effect: 'create-backup-snapshot', href: '/settings', type: 'settings', value: 'excel' },
      aliases: ['settings backup snapshot', 'backup workspace'],
      id: 'settings:workspace:create-backup-snapshot',
      keywords: ['settings', 'backup', 'snapshot', 'workspace', 'local data'],
      kind: 'workflow',
      pageId: 'settings',
      pageOrder: 6,
      pagePrefixes: ['/settings'],
      priority: 510,
      subtitle: `${t('navSettings')} / ${t('settingsLocalWorkspaceStorageTitle')}`,
      title: t('settingsBackupSnapshotAction'),
    }),
    createCommand({
      action: { effect: 'restore-backup-snapshot', href: '/settings', type: 'settings', value: 'excel' },
      aliases: ['settings restore snapshot', 'restore backup'],
      id: 'settings:workspace:restore-backup-snapshot',
      keywords: ['settings', 'restore', 'snapshot', 'backup', 'workspace', 'local data'],
      kind: 'workflow',
      pageId: 'settings',
      pageOrder: 6,
      pagePrefixes: ['/settings'],
      priority: 511,
      subtitle: `${t('navSettings')} / ${t('settingsLocalWorkspaceStorageTitle')}`,
      title: t('settingsRestoreSnapshotAction'),
    }),
    createCommand({
      action: { effect: 'export-logs', href: '/settings', type: 'settings', value: 'excel' },
      aliases: ['settings export logs', 'export activity logs'],
      id: 'settings:workspace:export-logs',
      keywords: ['settings', 'export', 'logs', 'activity', 'workspace', 'local data', 'excel'],
      kind: 'workflow',
      pageId: 'settings',
      pageOrder: 6,
      pagePrefixes: ['/settings'],
      priority: 512,
      subtitle: `${t('navSettings')} / ${t('settingsLocalWorkspaceStorageTitle')}`,
      title: `${t('settingsExportLogsAction')}: Excel`,
    }),
    createCommand({
      action: { effect: 'export-planning-data', href: '/settings', type: 'settings', value: 'excel' },
      aliases: ['settings export planning data', 'export sena data'],
      id: 'settings:workspace:export-planning-data',
      keywords: ['settings', 'export', 'planning', 'data', 'sena', 'workspace', 'local data', 'excel'],
      kind: 'workflow',
      pageId: 'settings',
      pageOrder: 6,
      pagePrefixes: ['/settings'],
      priority: 513,
      subtitle: `${t('navSettings')} / ${t('settingsLocalWorkspaceStorageTitle')}`,
      title: `${t('settingsExportSenaDataAction')}: Excel`,
    }),
  ];
}

function buildSkuEntityCommands(catalog: SenaCatalog) {
  const visibleCatalog = activeSenaCatalog(catalog) ?? catalog;

  return visibleCatalog.skus.flatMap((sku) => {
    const commands: CommandDescriptor[] = [
      createCommand({
        action: { href: buildSkuDetailHref(sku.skuId), type: 'entity' },
        aliases: [sku.name],
        id: `sku:open:${sku.skuId}`,
        keywords: ['sku', 'open', sku.name],
        kind: 'entity',
        pageId: 'catalog',
        pageOrder: 3,
        pagePrefixes: ['/catalog', `/catalog/skus/${sku.skuId}`],
        priority: 200,
        subtitle: 'SKU',
        title: sku.name,
      }),
      createCommand({
        action: { href: `/catalog/skus/${sku.skuId}/edit`, type: 'workflow' },
        aliases: [sku.name, 'edit sku'],
        id: `sku:edit:${sku.skuId}`,
        keywords: ['sku', 'edit', sku.name],
        kind: 'workflow',
        pageId: 'catalog',
        pageOrder: 3,
        pagePrefixes: ['/catalog', `/catalog/skus/${sku.skuId}`],
        priority: 210,
        subtitle: 'SKU',
        title: `Edit ${sku.name}`,
      }),
      createCommand({
        action: {
          entityId: sku.skuId,
          entityName: sku.name,
          entityType: 'sku',
          mutation: 'archive',
          type: 'catalog-mutation',
        },
        aliases: [sku.name, 'archive sku'],
        id: `sku:archive:${sku.skuId}`,
        keywords: ['sku', 'archive', sku.name],
        kind: 'workflow',
        pageId: 'catalog',
        pageOrder: 3,
        pagePrefixes: ['/catalog'],
        priority: 211,
        subtitle: 'SKU',
        title: `Archive ${sku.name}`,
      }),
    ];
    const sheetCommands: Array<{ label: string; mode: SkuActionValue }> = [
      { label: 'Record stock', mode: 'stock' },
      { label: 'Log order', mode: 'order' },
      { label: 'Log receipt', mode: 'receipt' },
    ];

    if (sku.soldAsProduct) {
      sheetCommands.push({ label: 'Update price', mode: 'price' });
    }

    return [
      ...commands,
      ...sheetCommands.map((command, index) =>
        createCommand({
          action: { href: buildSkuDetailHref(sku.skuId, command.mode), type: 'sheet' },
          aliases: [command.mode, sku.name],
          id: `sku:sheet:${command.mode}:${sku.skuId}`,
          keywords: ['sku', 'sheet', command.mode, sku.name],
          kind: 'sheet',
          pageId: 'catalog',
          pageOrder: 3,
          pagePrefixes: [`/catalog/skus/${sku.skuId}`],
          priority: 220 + index,
          subtitle: 'SKU action',
          title: `${command.label} for ${sku.name}`,
        }),
      ),
    ];
  });
}

function buildServiceEntityCommands(catalog: SenaCatalog) {
  const visibleCatalog = activeSenaCatalog(catalog) ?? catalog;

  return visibleCatalog.services.flatMap((service) => {
    const sheetCommands: Array<{ label: string; mode: ServiceActionValue }> = [
      { label: 'Record stock', mode: 'stock' },
      { label: 'Log receipt', mode: 'receipt' },
      { label: 'Update price', mode: 'price' },
    ];

    return [
      createCommand({
        action: { href: buildServiceDetailHref(service.serviceId), type: 'entity' },
        aliases: [service.serviceId],
        id: `service:open:${service.serviceId}`,
        keywords: ['service', 'open', service.serviceId],
        kind: 'entity',
        pageId: 'catalog',
        pageOrder: 3,
        pagePrefixes: ['/catalog', `/catalog/services/${service.serviceId}`],
        priority: 230,
        subtitle: `Service · ${service.serviceId}`,
        title: service.name,
      }),
      createCommand({
        action: { href: `/catalog/services/${service.serviceId}/edit`, type: 'workflow' },
        aliases: [service.serviceId, 'edit service'],
        id: `service:edit:${service.serviceId}`,
        keywords: ['service', 'edit', service.serviceId],
        kind: 'workflow',
        pageId: 'catalog',
        pageOrder: 3,
        pagePrefixes: ['/catalog', `/catalog/services/${service.serviceId}`],
        priority: 240,
        subtitle: `Service · ${service.serviceId}`,
        title: `Edit ${service.name}`,
      }),
      createCommand({
        action: {
          entityId: service.serviceId,
          entityName: service.name,
          entityType: 'service',
          mutation: 'archive',
          type: 'catalog-mutation',
        },
        aliases: [service.serviceId, 'archive service'],
        id: `service:archive:${service.serviceId}`,
        keywords: ['service', 'archive', service.serviceId],
        kind: 'workflow',
        pageId: 'catalog',
        pageOrder: 3,
        pagePrefixes: ['/catalog'],
        priority: 241,
        subtitle: `Service · ${service.serviceId}`,
        title: `Archive ${service.name}`,
      }),
      ...sheetCommands.map((command, index) =>
        createCommand({
          action: { href: buildServiceDetailHref(service.serviceId, command.mode), type: 'sheet' },
          aliases: [service.serviceId, command.mode, service.name],
          id: `service:sheet:${command.mode}:${service.serviceId}`,
          keywords: ['service', 'sheet', command.mode, service.serviceId],
          kind: 'sheet',
          pageId: 'catalog',
          pageOrder: 3,
          pagePrefixes: [`/catalog/services/${service.serviceId}`],
          priority: 250 + index,
          subtitle: `Service action · ${service.serviceId}`,
          title: `${command.label} for ${service.name}`,
        }),
      ),
    ];
  });
}

function buildArchivedEntityCommands(catalog: SenaCatalog) {
  const skuCommands = archivedSenaSkus(catalog).map((sku) =>
    createCommand({
      action: {
        entityId: sku.skuId,
        entityName: sku.name,
        entityType: 'sku',
        mutation: 'unarchive',
        type: 'catalog-mutation',
      },
      aliases: [sku.name, 'restore sku'],
      id: `sku:unarchive:${sku.skuId}`,
      keywords: ['sku', 'unarchive', 'restore', sku.name],
      kind: 'workflow',
      pageId: 'archive',
      pageOrder: 6,
      pagePrefixes: ['/operations/archive'],
      priority: 260,
      subtitle: 'Archived SKU',
      title: `Unarchive ${sku.name}`,
    }),
  );
  const serviceCommands = archivedSenaServices(catalog).map((service) =>
    createCommand({
      action: {
        entityId: service.serviceId,
        entityName: service.name,
        entityType: 'service',
        mutation: 'unarchive',
        type: 'catalog-mutation',
      },
      aliases: [service.serviceId, 'restore service'],
      id: `service:unarchive:${service.serviceId}`,
      keywords: ['service', 'unarchive', 'restore', service.serviceId],
      kind: 'workflow',
      pageId: 'archive',
      pageOrder: 6,
      pagePrefixes: ['/operations/archive'],
      priority: 261,
      subtitle: `Archived Service · ${service.serviceId}`,
      title: `Unarchive ${service.name}`,
    }),
  );

  return [...skuCommands, ...serviceCommands];
}

function buildOverviewTaskCommands(inventory: InventoryContextValue, language: AppLanguage) {
  const model = buildOverviewModel({
    catalog: inventory.catalog,
    detailBySkuId: {},
    language,
    observations: inventory.observations,
    staleUpdateReminderSnoozeUntil: null,
    workspaceSummary: inventory.workspaceSummary,
  });
  const commands: CommandDescriptor[] = [];

  for (const task of model.tasks) {
    if (!isOverviewSkuTask(task)) {
      commands.push(
        createCommand({
          action: { href: '/record-update', type: 'workflow' },
          aliases: ['stale update', 'reminder'],
          id: 'overview:stale-update',
          keywords: ['overview', 'task', 'record', 'update'],
          kind: 'workflow',
          pageId: 'overview',
          pageOrder: 0,
          pagePrefixes: ['/'],
          priority: 300,
          subtitle: task.whyNow,
          title: task.actionLabel,
        }),
      );
      continue;
    }

    commands.push(
      createCommand({
        action: {
          href: buildOverviewHref({
            filter: task.state,
            taskId: task.id,
            taskMode: task.defaultDrawerMode as OverviewTaskModeValue,
          }),
          type: 'workflow',
        },
        aliases: [task.skuName, task.action, task.state],
        id: `overview:task:${task.skuId}:${task.action}`,
        keywords: ['overview', 'task', task.action, task.state, ...task.linkedServiceNames],
        kind: 'workflow',
        pageId: 'overview',
        pageOrder: 0,
        pagePrefixes: ['/', `/catalog/skus/${task.skuId}`],
        priority: 310,
        subtitle: `${task.stateLabel} · ${task.whyNow}`,
        title: `${task.actionLabel} for ${task.skuName}`,
      }),
    );
  }

  return commands;
}

export function buildCommandDescriptors({
  currency,
  displayViewMode,
  inventory,
  language,
  senaEngineParameters,
  showExplanatoryTooltips,
  showFloatingTitleActions,
  showAnalysisPage,
  showRightRailCards,
  t,
}: {
  currency: 'USD' | 'KHR';
  displayViewMode: 'compact' | 'custom';
  inventory: InventoryContextValue;
  language: AppLanguage;
  senaEngineParameters: { smoothingEnabled?: boolean };
  showExplanatoryTooltips: boolean;
  showFloatingTitleActions: boolean;
  showAnalysisPage: boolean;
  showRightRailCards: boolean;
  t: Translator;
}) {
  const commands = [
    ...buildPageCommands(t, { showAnalysisPage }),
    ...buildWorkflowCommands(),
    ...buildSettingsCommands({
      currency,
      displayViewMode,
      language,
      senaEngineParameters,
      showExplanatoryTooltips,
      showFloatingTitleActions,
      showAnalysisPage,
      showRightRailCards,
      t,
    }),
    ...buildOverviewCommands(),
    ...buildCatalogCommands(),
    ...buildOperationsCommands(),
    ...buildArchiveCommands(),
    ...buildPerformanceCommands(),
    ...(showAnalysisPage ? buildAnalysisCommands() : []),
  ];

  if (!inventory.catalog) {
    return commands;
  }

  return [
    ...commands,
    ...buildSkuEntityCommands(inventory.catalog),
    ...buildServiceEntityCommands(inventory.catalog),
    ...buildArchivedEntityCommands(inventory.catalog),
    ...buildOverviewTaskCommands(inventory, language),
  ];
}

function buildFuse(commands: CommandDescriptor[]) {
  return new Fuse(commands, {
    ignoreLocation: true,
    includeScore: true,
    keys: ['title', 'subtitle', 'aliases', 'keywords', 'searchTerms'],
    threshold: 0.34,
    getFn: (command, path) => {
      if (path === 'searchTerms') {
        return commandSearchTerms(command);
      }
      return Fuse.config.getFn(command, path);
    },
  });
}

function commandMatchesPath(command: CommandDescriptor, pathname: string) {
  return command.pagePrefixes.some((prefix) =>
    prefix === '/'
      ? pathname === '/'
      : pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

function isOpaqueSkuIdQuery(query: string) {
  return /^sku-[a-z0-9_-]+$/.test(query);
}

function commandTargetsSku(command: CommandDescriptor) {
  if (command.id.startsWith('sku:') || command.id.startsWith('overview:task:')) {
    return true;
  }

  return command.pagePrefixes.some((prefix) => prefix.includes('/catalog/skus/'));
}

function dedupeCommands(commands: CommandDescriptor[]) {
  const seenIds = new Set<string>();
  return commands.filter((command) => {
    if (seenIds.has(command.id)) {
      return false;
    }
    seenIds.add(command.id);
    return true;
  });
}

export function searchCommandDescriptors({
  commands,
  currentPathname,
  query,
}: {
  commands: CommandDescriptor[];
  currentPathname: string;
  query: string;
}) {
  const normalizedQuery = normalizeText(query);
  const opaqueSkuIdQuery = isOpaqueSkuIdQuery(normalizedQuery);
  if (!normalizedQuery) {
    const currentPageCommands = dedupeCommands(
      commands
        .filter((command) => commandMatchesPath(command, currentPathname) && command.emptyQueryRank != null)
        .sort((left, right) => (left.emptyQueryRank ?? left.priority) - (right.emptyQueryRank ?? right.priority)),
    );
    const globalCommands = dedupeCommands(
      commands
        .filter((command) => command.emptyQueryRank != null && !commandMatchesPath(command, currentPathname))
        .sort((left, right) => (left.emptyQueryRank ?? left.priority) - (right.emptyQueryRank ?? right.priority)),
    );
    return [...currentPageCommands, ...globalCommands].slice(0, 20);
  }

  const fuse = buildFuse(commands);
  const scoreById = new Map(
    fuse.search(normalizedQuery, { limit: 60 }).map((result) => [result.item.id, result.score ?? 1]),
  );

  return commands
    .map((command) => {
      const haystacks = commandSearchTerms(command);
      const exact = haystacks.some((value) => value === normalizedQuery);
      const prefix = haystacks.some((value) => value.startsWith(normalizedQuery));
      const contains = haystacks.some((value) => value.includes(normalizedQuery));
      const fuseScore =
        opaqueSkuIdQuery && commandTargetsSku(command)
          ? undefined
          : scoreById.get(command.id);

      if (!exact && !prefix && !contains && fuseScore == null) {
        return null;
      }

      return {
        command,
        containsRank: contains ? 0 : 1,
        currentPageRank: commandMatchesPath(command, currentPathname) ? 0 : 1,
        exactRank: exact ? 0 : 1,
        fuseScore: fuseScore ?? 1.5,
        prefixRank: prefix ? 0 : 1,
      };
    })
    .filter((value): value is NonNullable<typeof value> => value != null)
    .sort((left, right) =>
      left.exactRank - right.exactRank ||
      left.prefixRank - right.prefixRank ||
      left.currentPageRank - right.currentPageRank ||
      left.fuseScore - right.fuseScore ||
      left.containsRank - right.containsRank ||
      left.command.priority - right.command.priority ||
      left.command.title.localeCompare(right.command.title),
    )
    .map((value) => value.command)
    .slice(0, 40);
}

export function commandBadgeLabel(command: CommandDescriptor) {
  return commandKindLabel(command.kind);
}

export function groupCommandDescriptors(
  commands: CommandDescriptor[],
  options?: {
    bestMatchCount?: number;
    includeBestMatches?: boolean;
  },
) {
  const includeBestMatches = options?.includeBestMatches ?? false;
  const bestMatchCount = options?.bestMatchCount ?? 5;
  const bestMatches = includeBestMatches ? commands.slice(0, bestMatchCount) : [];
  const bestMatchIds = new Set(bestMatches.map((command) => command.id));
  const remainingCommands = commands.filter((command) => !bestMatchIds.has(command.id));

  const pages = remainingCommands
    .filter((command) => command.kind === 'page')
    .sort((left, right) => left.pageOrder - right.pageOrder || left.priority - right.priority);
  const tabs = remainingCommands
    .filter((command) => command.kind === 'tab')
    .sort(
      (left, right) =>
        left.pageOrder - right.pageOrder ||
        (left.tabOrder ?? Number.MAX_SAFE_INTEGER) - (right.tabOrder ?? Number.MAX_SAFE_INTEGER) ||
        left.priority - right.priority,
    );
  const actions = remainingCommands
    .filter((command) => command.kind !== 'page' && command.kind !== 'tab')
    .sort((left, right) => left.title.localeCompare(right.title) || left.priority - right.priority);

  return [
    { id: 'best-matches', items: bestMatches, title: 'Best Matches' },
    { id: 'pages', items: pages, title: 'Pages' },
    { id: 'tabs', items: tabs, title: 'Tabs' },
    { id: 'actions', items: actions, title: 'Actions' },
  ].filter((section) => section.items.length > 0) satisfies CommandPaletteSection[];
}
