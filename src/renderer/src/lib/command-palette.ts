import Fuse from 'fuse.js';
import type { SenaCatalog } from '@shared/sena';
import type { AppLanguage } from '@shared/inventory';
import type { InterfaceViewMode } from '@shared/interface-view';
import type { InventoryContextValue } from '@/state/inventory';
import {
  buildServiceDetailHref,
  buildSkuDetailHref,
  type AnalysisScopeValue,
  type AnalysisSectionValue,
  type AnalysisTimeframeValue,
  type ArchiveViewValue,
  type CatalogViewValue,
  type FinancialsRangeValue,
  type FinancialsScopeValue,
  type OverviewSearchScope,
  type OverviewTaskFilterValue,
  type PerformanceRangeValue,
  type PerformanceScopeValue,
} from '@/lib/navigation-state';
import { buildCaptureSessionHref, type CaptureSessionAction, type CaptureSessionTargetType } from '@/lib/record-update-routes';
import {
  buildRememberedAnalysisHref,
  buildRememberedArchiveHref,
  buildRememberedCatalogHref,
  buildRememberedFinancialsHref,
  buildRememberedHistoryHref,
  buildRememberedInsightsHref,
  buildRememberedOverviewHref,
  buildRememberedPerformanceHref,
  buildRememberedSettingsHref,
} from '@/lib/page-state-memory';
import { deriveNavigationAvailability } from '@/lib/navigation-availability';
import { translateUiLiteral } from '@/lib/translations';
import {
  activeSenaCatalog,
  archivedSenaServices,
  archivedSenaSkus,
  supplierNameForSku,
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
        | 'set-show-automations-page'
        | 'set-smoothing-enabled'
        | 'create-backup-snapshot'
        | 'restore-backup-snapshot'
        | 'export-logs'
        | 'export-planning-data';
      value: boolean | 'en' | 'km' | 'USD' | 'KHR' | InterfaceViewMode | 'excel';
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

const khmerSettingsSearchTerms = ['ការកំណត់', 'ចំណូលចិត្ត'];
const khmerLanguageSearchTerms = ['ភាសា', 'អង់គ្លេស', 'ខ្មែរ'];
const khmerCurrencySearchTerms = ['រូបិយប័ណ្ណ', 'ដុល្លារ', 'រៀល'];
const khmerIntakeSearchTerms = ['សំណើចូល', 'សំណើតេលេក្រាម', 'តេលេក្រាម'];

function exportCommandTitle(language: AppLanguage, actionTitle: string) {
  return `${actionTitle}: ${translateUiLiteral(language, 'Excel file')}`;
}

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

function buildPageCommands(
  t: Translator,
  {
    hasCatalogTab,
    hasHistory,
    hasInsights,
    hasWork,
  }: {
    hasCatalogTab: boolean;
    hasHistory: boolean;
    hasInsights: boolean;
    hasWork: boolean;
  },
) {
  return [
    pageCommand({
      aliases: ['command home', 'dashboard'],
      href: '/',
      id: 'page:home',
      keywords: ['home', 'command', 'start'],
      pageId: 'home',
      pageOrder: 0,
      pagePrefix: '/',
      priority: 10,
      subtitle: 'Command home and daily entry point',
      title: t('navHome'),
    }),
    pageCommand({
      aliases: ['queue', 'daily work'],
      href: buildRememberedOverviewHref(),
      id: 'page:work',
      keywords: ['queue', 'tasks', 'work'],
      pageId: 'work',
      pageOrder: 1,
      pagePrefix: '/work',
      priority: 11,
      subtitle: 'Queue, capture, and intake work',
      title: t('navWork'),
    }),
    ...(hasInsights
      ? [
          pageCommand({
            aliases: ['metrics', 'pressure', 'money', 'explain'],
            href: buildRememberedInsightsHref(),
            id: 'page:insights',
            keywords: ['pressure', 'money', 'explain', 'insights', 'range', 'compare'],
            pageId: 'insights',
            pageOrder: 2,
            pagePrefix: '/insights',
            priority: 13,
            subtitle: 'Pressure, money, and explanation views',
            title: t('navInsights'),
          }),
        ]
      : []),
    ...(hasCatalogTab
      ? [
          pageCommand({
            aliases: ['inventory'],
            href: buildRememberedCatalogHref(),
            id: 'page:catalog',
            keywords: ['catalog', 'skus', 'services', 'archive', 'automation', 'exposure'],
            pageId: 'catalog',
            pageOrder: 3,
            pagePrefix: '/catalog',
            priority: 14,
            subtitle: 'Browse active and archived SKUs and services',
            title: t('navCatalog'),
          }),
        ]
      : []),
    ...(hasHistory
      ? [
          pageCommand({
            aliases: ['logs', 'history'],
            href: buildRememberedHistoryHref(),
            id: 'page:history',
            keywords: ['logs', 'history', 'heatmap'],
            pageId: 'history',
            pageOrder: 5,
            pagePrefix: '/settings/history',
            priority: 15,
            subtitle: 'Saved update history and reports',
            title: t('navHistory'),
          }),
        ]
      : []),
    pageCommand({
      aliases: ['archive', 'archived'],
      href: buildRememberedArchiveHref(),
      id: 'page:archive',
      keywords: ['archive', 'archived', 'catalog'],
      pageId: 'archive',
      pageOrder: 6,
      pagePrefix: '/catalog',
      priority: 16,
      subtitle: 'Archived SKUs and services',
      title: t('navArchive'),
    }),
    pageCommand({
      aliases: ['preferences'],
      href: buildRememberedSettingsHref(),
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
      href: '/settings/help',
      id: 'page:help',
      keywords: ['help', 'guide', 'docs', 'documentation', 'manual', 'faq', 'support'],
      pageId: 'help',
      pageOrder: 8,
      pagePrefix: '/settings',
      priority: 18,
      subtitle: 'User guide, feature explanations, and FAQ',
      title: t('navHelp'),
    }),
  ];
}

function buildOverviewCommands() {
  const scopeCommands: Array<{ label: string; value: OverviewSearchScope }> = [
    { label: 'All work items', value: 'all' },
    { label: 'Work SKU tasks', value: 'skus' },
    { label: 'Work service tasks', value: 'services' },
  ];
  const filterCommands: Array<{ label: string; value: OverviewTaskFilterValue }> = [
    { label: 'All work tasks', value: 'all' },
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
        href: buildRememberedOverviewHref({ scope: command.value }),
        id: `overview:scope:${command.value}`,
        keywords: ['overview', 'scope', command.value],
        pageId: 'overview',
        pageOrder: 0,
        pagePrefix: '/',
        priority: 40 + index,
        subtitle: 'Work scope',
        tabOrder: index,
        title: command.label,
      }),
    ),
    ...filterCommands.map((command, index) =>
      tabCommand({
        aliases: ['overview', 'filter'],
        href: buildRememberedOverviewHref({ filter: command.value }),
        id: `overview:filter:${command.value}`,
        keywords: ['overview', 'filter', command.value],
        pageId: 'overview',
        pageOrder: 0,
        pagePrefix: '/',
        priority: 50 + index,
        subtitle: 'Work filter',
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
      href: buildRememberedCatalogHref({ view: command.value }),
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

function buildArchiveCommands() {
  const viewCommands: Array<{ label: string; value: ArchiveViewValue }> = [
    { label: 'Archive / All items', value: 'all' },
    { label: 'Archive / SKUs', value: 'skus' },
    { label: 'Archive / Services', value: 'services' },
  ];

  return viewCommands.map((command, index) =>
    tabCommand({
      aliases: ['archive', 'view'],
      href: buildRememberedArchiveHref({ view: command.value }),
      id: `archive:view:${command.value}`,
      keywords: ['archive', command.value],
      pageId: 'archive',
      pageOrder: 6,
      pagePrefix: '/catalog',
      priority: 85 + index,
      subtitle: 'Archive view',
      tabOrder: index,
      title: command.label,
    }),
  );
}

function buildPerformanceCommands() {
  const rangeCommands: Array<{ label: string; value: PerformanceRangeValue }> = [
    { label: 'Pressure / 7D', value: '7d' },
    { label: 'Pressure / 30D', value: '30d' },
    { label: 'Pressure / 90D', value: '90d' },
  ];
  const scopeCommands: Array<{ label: string; value: PerformanceScopeValue }> = [
    { label: 'Pressure / All items', value: 'all' },
    { label: 'Pressure / Services', value: 'services' },
    { label: 'Pressure / SKUs', value: 'skus' },
  ];

  return [
    ...rangeCommands.map((command, index) =>
      tabCommand({
        aliases: ['performance', 'range'],
        href: buildRememberedPerformanceHref({ range: command.value }),
        id: `performance:range:${command.value}`,
        keywords: ['performance', 'range', command.value],
        pageId: 'performance',
        pageOrder: 2,
        pagePrefix: '/insights',
        priority: 90 + index,
        subtitle: 'Pressure range',
        tabOrder: index,
        title: command.label,
      }),
    ),
    ...scopeCommands.map((command, index) =>
      tabCommand({
        aliases: ['performance', 'scope'],
        href: buildRememberedPerformanceHref({ scope: command.value }),
        id: `performance:scope:${command.value}`,
        keywords: ['performance', 'scope', command.value],
        pageId: 'performance',
        pageOrder: 2,
        pagePrefix: '/insights',
        priority: 100 + index,
        subtitle: 'Pressure scope',
        tabOrder: rangeCommands.length + index,
        title: command.label,
      }),
    ),
    tabCommand({
      aliases: ['performance', 'compare'],
      href: buildRememberedPerformanceHref({ compare: true }),
      id: 'performance:compare:on',
      keywords: ['performance', 'compare', 'on'],
      pageId: 'performance',
      pageOrder: 2,
      pagePrefix: '/insights',
      priority: 104,
      subtitle: 'Pressure comparison',
      tabOrder: rangeCommands.length + scopeCommands.length,
      title: 'Pressure / Compare view',
    }),
    tabCommand({
      aliases: ['performance', 'compare'],
      href: buildRememberedPerformanceHref({ compare: false }),
      id: 'performance:compare:off',
      keywords: ['performance', 'compare', 'off'],
      pageId: 'performance',
      pageOrder: 2,
      pagePrefix: '/insights',
      priority: 105,
      subtitle: 'Pressure comparison',
      tabOrder: rangeCommands.length + scopeCommands.length + 1,
      title: 'Pressure / Single view',
    }),
  ];
}

function buildFinancialsCommands() {
  const rangeCommands: Array<{ label: string; value: FinancialsRangeValue }> = [
    { label: 'Money / 1D', value: '1d' },
    { label: 'Money / 7D', value: '7d' },
    { label: 'Money / 30D', value: '30d' },
    { label: 'Money / 90D', value: '90d' },
  ];
  const scopeCommands: Array<{ label: string; value: FinancialsScopeValue }> = [
    { label: 'Money / All items', value: 'all' },
    { label: 'Money / Services', value: 'services' },
    { label: 'Money / SKUs', value: 'skus' },
  ];

  return [
    ...rangeCommands.map((command, index) =>
      tabCommand({
        aliases: ['financials', 'range'],
        href: buildRememberedFinancialsHref({ range: command.value }),
        id: `financials:range:${command.value}`,
        keywords: ['financials', 'money', 'range', command.value],
        pageId: 'financials',
        pageOrder: 4,
        pagePrefix: '/insights',
        priority: 106 + index,
        subtitle: 'Money range',
        tabOrder: index,
        title: command.label,
      }),
    ),
    ...scopeCommands.map((command, index) =>
      tabCommand({
        aliases: ['financials', 'scope'],
        href: buildRememberedFinancialsHref({ scope: command.value }),
        id: `financials:scope:${command.value}`,
        keywords: ['financials', 'money', 'scope', command.value],
        pageId: 'financials',
        pageOrder: 4,
        pagePrefix: '/insights',
        priority: 109 + index,
        subtitle: 'Money scope',
        tabOrder: rangeCommands.length + index,
        title: command.label,
      }),
    ),
    tabCommand({
      aliases: ['financials', 'compare'],
      href: buildRememberedFinancialsHref({ compare: true }),
      id: 'financials:compare:on',
      keywords: ['financials', 'money', 'compare', 'on'],
      pageId: 'financials',
      pageOrder: 4,
      pagePrefix: '/insights',
      priority: 112,
      subtitle: 'Money comparison',
      tabOrder: rangeCommands.length + scopeCommands.length,
      title: 'Money / Compare view',
    }),
    tabCommand({
      aliases: ['financials', 'compare'],
      href: buildRememberedFinancialsHref({ compare: false }),
      id: 'financials:compare:off',
      keywords: ['financials', 'money', 'compare', 'off'],
      pageId: 'financials',
      pageOrder: 4,
      pagePrefix: '/insights',
      priority: 113,
      subtitle: 'Money comparison',
      tabOrder: rangeCommands.length + scopeCommands.length + 1,
      title: 'Money / Single view',
    }),
  ];
}

function buildAnalysisCommands() {
  const scopeCommands: Array<{ label: string; value: AnalysisScopeValue }> = [
    { label: 'Explain / All items', value: 'all' },
    { label: 'Explain / Services', value: 'services' },
    { label: 'Explain / SKUs', value: 'skus' },
  ];
  const sectionCommands: Array<{ label: string; value: AnalysisSectionValue }> = [
    { label: 'Explain / Main view', value: 'workbench' },
    { label: 'Explain / Pressure', value: 'pressure' },
    { label: 'Explain / Observations', value: 'observations' },
    { label: 'Explain / Fragility', value: 'fragility' },
    { label: 'Explain / Settings', value: 'settings' },
  ];
  const timeframeCommands: AnalysisTimeframeValue[] = ['Recent', '1M', '3M', 'YTD', '1Y', 'MAX'];

  return [
    ...scopeCommands.map((command, index) =>
      tabCommand({
        aliases: ['explain', 'analysis', 'scope'],
        href: buildRememberedAnalysisHref({ scope: command.value }),
        id: `analysis:scope:${command.value}`,
        keywords: ['explain', 'analysis', 'scope', command.value],
        pageId: 'analysis',
        pageOrder: 4,
        pagePrefix: '/insights',
        priority: 110 + index,
        subtitle: 'Explain scope',
        tabOrder: index,
        title: command.label,
      }),
    ),
    ...sectionCommands.map((command, index) =>
      tabCommand({
        aliases: ['explain', 'analysis', 'section'],
        href: buildRememberedAnalysisHref({ section: command.value }),
        id: `analysis:section:${command.value}`,
        keywords: ['explain', 'analysis', 'section', command.value],
        pageId: 'analysis',
        pageOrder: 4,
        pagePrefix: '/insights',
        priority: 120 + index,
        subtitle: 'Explain section',
        tabOrder: scopeCommands.length + index,
        title: command.label,
      }),
    ),
    ...timeframeCommands.map((command, index) =>
      tabCommand({
        aliases: ['explain', 'analysis', 'timeframe'],
        href: buildRememberedAnalysisHref({ timeframe: command }),
        id: `analysis:timeframe:${command}`,
        keywords: ['explain', 'analysis', 'timeframe', command],
        pageId: 'analysis',
        pageOrder: 4,
        pagePrefix: '/insights',
        priority: 130 + index,
        subtitle: 'Explain timeframe',
        tabOrder: scopeCommands.length + sectionCommands.length + index,
        title: `Explain / Timeframe / ${command}`,
      }),
    ),
  ];
}

function buildWorkflowCommands({ hasWork }: { hasWork: boolean }) {
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
    ...(hasWork
      ? [
          createCommand({
            action: { href: '/work/capture', type: 'workflow' },
            aliases: ['capture update', 'start update'],
            emptyQueryRank: 19,
            id: 'workflow:start-update',
            keywords: ['start', 'update', 'record', 'observation'],
            kind: 'workflow',
            pageId: 'capture',
            pageOrder: 1,
            pagePrefixes: ['/work', '/'],
            priority: 19,
            subtitle: 'Capture the next observation',
            title: 'Capture update',
          }),
        ]
      : []),
  ];
}

function buildSettingsCommands({
  currency,
  displayViewMode,
  language,
  senaEngineParameters,
  showExplanatoryTooltips,
  showFloatingTitleActions,
  showAutomationsPage,
  showRightRailCards,
  t,
}: {
  currency: 'USD' | 'KHR';
  displayViewMode: InterfaceViewMode;
  language: 'en' | 'km';
  senaEngineParameters: { smoothingEnabled?: boolean };
  showExplanatoryTooltips: boolean;
  showFloatingTitleActions: boolean;
  showAutomationsPage: boolean;
  showRightRailCards: boolean;
  t: Translator;
}) {
  const smoothingEnabled = senaEngineParameters.smoothingEnabled ?? true;

  return [
    createCommand({
      action: { effect: 'set-language', href: '/settings', type: 'settings', value: 'en' },
      aliases: ['settings language english', ...khmerSettingsSearchTerms, ...khmerLanguageSearchTerms],
      id: 'settings:language:en',
      keywords: ['settings', 'language', 'english', ...khmerSettingsSearchTerms, ...khmerLanguageSearchTerms, language === 'en' ? 'current' : ''],
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
      aliases: ['settings language khmer', ...khmerSettingsSearchTerms, ...khmerLanguageSearchTerms],
      id: 'settings:language:km',
      keywords: ['settings', 'language', 'khmer', ...khmerSettingsSearchTerms, ...khmerLanguageSearchTerms, language === 'km' ? 'current' : ''],
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
      aliases: ['settings currency usd', ...khmerSettingsSearchTerms, ...khmerCurrencySearchTerms],
      id: 'settings:currency:usd',
      keywords: ['settings', 'currency', 'usd', ...khmerSettingsSearchTerms, ...khmerCurrencySearchTerms, currency === 'USD' ? 'current' : ''],
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
      aliases: ['settings currency khr', ...khmerSettingsSearchTerms, ...khmerCurrencySearchTerms],
      id: 'settings:currency:khr',
      keywords: ['settings', 'currency', 'khr', ...khmerSettingsSearchTerms, ...khmerCurrencySearchTerms, currency === 'KHR' ? 'current' : ''],
      kind: 'workflow',
      pageId: 'settings',
      pageOrder: 6,
      pagePrefixes: ['/settings'],
      priority: 503,
      subtitle: 'Settings / Currency',
      title: 'Set currency to KHR',
    }),
    createCommand({
      action: { effect: 'set-display-mode', href: '/settings/interface', type: 'settings', value: 'default' },
      aliases: ['settings default view'],
      id: 'settings:view:default',
      keywords: ['settings', 'view', 'default', displayViewMode === 'default' ? 'current' : ''],
      kind: 'workflow',
      pageId: 'settings',
      pageOrder: 6,
      pagePrefixes: ['/settings'],
      priority: 504,
      subtitle: 'Settings / View mode',
      title: 'Set view mode to Default View',
    }),
    createCommand({
      action: { effect: 'set-display-mode', href: '/settings/interface', type: 'settings', value: 'minimal' },
      aliases: ['settings minimal view', 'settings compact view'],
      id: 'settings:view:minimal',
      keywords: ['settings', 'view', 'minimal', 'compact', displayViewMode === 'minimal' ? 'current' : ''],
      kind: 'workflow',
      pageId: 'settings',
      pageOrder: 6,
      pagePrefixes: ['/settings'],
      priority: 505,
      subtitle: 'Settings / View mode',
      title: 'Set view mode to Minimal View',
    }),
    createCommand({
      action: { effect: 'set-display-mode', href: '/settings/interface', type: 'settings', value: 'maximal' },
      aliases: ['settings maximal view', 'settings full view'],
      id: 'settings:view:maximal',
      keywords: ['settings', 'view', 'maximal', 'full', displayViewMode === 'maximal' ? 'current' : ''],
      kind: 'workflow',
      pageId: 'settings',
      pageOrder: 6,
      pagePrefixes: ['/settings'],
      priority: 506,
      subtitle: 'Settings / View mode',
      title: 'Set view mode to Maximal View',
    }),
    createCommand({
      action: { effect: 'set-show-explanatory-tooltips', href: '/settings', type: 'settings', value: !showExplanatoryTooltips },
      aliases: ['settings guidance labels', 'settings optional help'],
      id: `settings:help:${showExplanatoryTooltips ? 'off' : 'on'}`,
      keywords: ['settings', 'guidance', 'labels', 'help', 'tooltips', showExplanatoryTooltips ? 'disable' : 'enable'],
      kind: 'workflow',
      pageId: 'settings',
      pageOrder: 6,
      pagePrefixes: ['/settings'],
      priority: 507,
      subtitle: 'Settings / Interface visibility',
      title: `${showExplanatoryTooltips ? 'Hide' : 'Show'} guidance labels`,
    }),
    createCommand({
      action: { effect: 'set-show-floating-title-actions', href: '/settings', type: 'settings', value: !showFloatingTitleActions },
      aliases: ['settings floating page actions', 'settings floating actions'],
      id: `settings:floating-actions:${showFloatingTitleActions ? 'off' : 'on'}`,
      keywords: ['settings', 'floating', 'page', 'actions', showFloatingTitleActions ? 'disable' : 'enable'],
      kind: 'workflow',
      pageId: 'settings',
      pageOrder: 6,
      pagePrefixes: ['/settings'],
      priority: 507,
      subtitle: 'Settings / Interface visibility',
      title: `${showFloatingTitleActions ? 'Hide' : 'Show'} floating page actions`,
    }),
    createCommand({
      action: { effect: 'set-show-right-rail-cards', href: '/settings', type: 'settings', value: !showRightRailCards },
      aliases: ['settings right side context panels', 'settings right rail cards'],
      id: `settings:right-rail:${showRightRailCards ? 'off' : 'on'}`,
      keywords: ['settings', 'right side', 'context', 'panels', 'right rail', showRightRailCards ? 'disable' : 'enable'],
      kind: 'workflow',
      pageId: 'settings',
      pageOrder: 6,
      pagePrefixes: ['/settings'],
      priority: 508,
      subtitle: 'Settings / Interface visibility',
      title: `${showRightRailCards ? 'Hide' : 'Show'} right-side context panels`,
    }),
    createCommand({
      action: { effect: 'set-show-automations-page', href: '/settings/interface?highlight=automations', type: 'settings', value: !showAutomationsPage },
      aliases: ['settings automations and intake', 'automation', 'intake', 'telegram bot', ...khmerSettingsSearchTerms, ...khmerIntakeSearchTerms],
      id: `settings:automations-page:${showAutomationsPage ? 'off' : 'on'}`,
      keywords: ['settings', 'automation', 'automations', 'intake', 'telegram', 'bot', ...khmerSettingsSearchTerms, ...khmerIntakeSearchTerms, showAutomationsPage ? 'disable' : 'enable'],
      kind: 'workflow',
      pageId: 'settings',
      pageOrder: 6,
      pagePrefixes: ['/settings'],
      priority: 509,
      subtitle: 'Settings / Interface visibility',
      title: `${showAutomationsPage ? 'Hide' : 'Show'} automations and intake`,
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
      priority: 511,
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
      title: exportCommandTitle(language, t('settingsExportLogsAction')),
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
      title: exportCommandTitle(language, t('settingsExportSenaDataAction')),
    }),
  ];
}

function buildSkuEntityCommands(catalog: SenaCatalog) {
  const visibleCatalog = activeSenaCatalog(catalog) ?? catalog;

  return visibleCatalog.skus.flatMap((sku) => {
    const supplierName = supplierNameForSku(sku);
    const skuSubtitle = supplierName ? `SKU · Supplier: ${supplierName}` : 'SKU';
    const skuKeywords = supplierName ? ['sku', sku.name, supplierName] : ['sku', sku.name];
    const commands: CommandDescriptor[] = [
      createCommand({
        action: { href: buildSkuDetailHref(sku.skuId), type: 'entity' },
        aliases: supplierName ? [sku.name, supplierName] : [sku.name],
        id: `sku:open:${sku.skuId}`,
        keywords: ['open', ...skuKeywords],
        kind: 'entity',
        pageId: 'catalog',
        pageOrder: 3,
        pagePrefixes: ['/catalog', `/catalog/skus/${sku.skuId}`],
        priority: 200,
        subtitle: skuSubtitle,
        title: sku.name,
      }),
      createCommand({
        action: { href: `/catalog/skus/${sku.skuId}/edit`, type: 'workflow' },
        aliases: supplierName ? [sku.name, supplierName, 'edit sku'] : [sku.name, 'edit sku'],
        id: `sku:edit:${sku.skuId}`,
        keywords: ['edit', ...skuKeywords],
        kind: 'workflow',
        pageId: 'catalog',
        pageOrder: 3,
        pagePrefixes: ['/catalog', `/catalog/skus/${sku.skuId}`],
        priority: 210,
        subtitle: skuSubtitle,
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
        aliases: supplierName ? [sku.name, supplierName, 'archive sku'] : [sku.name, 'archive sku'],
        id: `sku:archive:${sku.skuId}`,
        keywords: ['archive', ...skuKeywords],
        kind: 'workflow',
        pageId: 'catalog',
        pageOrder: 3,
        pagePrefixes: ['/catalog'],
        priority: 211,
        subtitle: skuSubtitle,
        title: `Archive ${sku.name}`,
      }),
    ];
    const sheetCommands: Array<{ action: CaptureSessionAction; label: string; targetType: CaptureSessionTargetType }> = [
      { action: 'stock', label: 'Record stock', targetType: 'sku' },
      { action: 'supplier-order', label: 'Record Supplier order', targetType: 'sku' },
      { action: 'customer-order', label: 'Record Customer order', targetType: 'sku' },
      { action: 'immediate-sale', label: 'Record Immediate sale', targetType: 'sku' },
    ];

    if (sku.soldAsProduct) {
      sheetCommands.push({ action: 'sku-price', label: 'Update price', targetType: 'sku' });
    }

    return [
      ...commands,
      ...sheetCommands.map((command, index) =>
        createCommand({
          action: { href: buildCaptureSessionHref({ action: command.action, targetId: sku.skuId, targetType: command.targetType }), type: 'workflow' },
          aliases: supplierName ? [command.action, sku.name, supplierName] : [command.action, sku.name],
          id: `sku:capture:${command.action}:${sku.skuId}`,
          keywords: ['capture', command.action, ...skuKeywords],
          kind: 'workflow',
          pageId: 'catalog',
          pageOrder: 3,
          pagePrefixes: [`/catalog/skus/${sku.skuId}`],
          priority: 220 + index,
          subtitle: supplierName ? `SKU action · Supplier: ${supplierName}` : 'SKU action',
          title: `${command.label} for ${sku.name}`,
        }),
      ),
    ];
  });
}

function buildServiceEntityCommands(catalog: SenaCatalog) {
  const visibleCatalog = activeSenaCatalog(catalog) ?? catalog;

  return visibleCatalog.services.flatMap((service) => {
    const sheetCommands: Array<{ action: CaptureSessionAction; label: string; targetType: CaptureSessionTargetType }> = [
      { action: 'customer-order', label: 'Record Customer order', targetType: 'service' },
      { action: 'immediate-sale', label: 'Record Immediate sale', targetType: 'service' },
      { action: 'service-price', label: 'Update price', targetType: 'service' },
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
          action: { href: buildCaptureSessionHref({ action: command.action, targetId: service.serviceId, targetType: command.targetType }), type: 'workflow' },
          aliases: [service.serviceId, command.action, service.name],
          id: `service:capture:${command.action}:${service.serviceId}`,
          keywords: ['service', 'capture', command.action, service.serviceId],
          kind: 'workflow',
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
    {
      const supplierName = supplierNameForSku(sku);
      return createCommand({
        action: {
          entityId: sku.skuId,
          entityName: sku.name,
          entityType: 'sku',
          mutation: 'unarchive',
          type: 'catalog-mutation',
        },
        aliases: supplierName ? [sku.name, supplierName, 'restore sku'] : [sku.name, 'restore sku'],
        id: `sku:unarchive:${sku.skuId}`,
        keywords: supplierName ? ['sku', 'unarchive', 'restore', sku.name, supplierName] : ['sku', 'unarchive', 'restore', sku.name],
        kind: 'workflow',
        pageId: 'archive',
        pageOrder: 6,
        pagePrefixes: ['/catalog'],
        priority: 260,
        subtitle: supplierName ? `Archived SKU · Supplier: ${supplierName}` : 'Archived SKU',
        title: `Unarchive ${sku.name}`,
      });
    },
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
      pagePrefixes: ['/catalog'],
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
    orderBatches: inventory.orderBatches,
    staleUpdateReminderSnoozeUntil: null,
    workspaceSummary: inventory.workspaceSummary,
  });
  const commands: CommandDescriptor[] = [];

  for (const task of model.tasks) {
    if (!isOverviewSkuTask(task)) {
      commands.push(
        createCommand({
          action: { href: '/work/capture', type: 'workflow' },
          aliases: ['stale update', 'reminder'],
          id: 'work:stale-update',
          keywords: ['work', 'task', 'capture', 'update'],
          kind: 'workflow',
          pageId: 'work',
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
          href: buildRememberedOverviewHref({
            filter: task.state,
          }),
          type: 'workflow',
        },
        aliases: [task.skuName, task.action, task.state],
        id: `work:task:${task.skuId}:${task.action}`,
        keywords: ['work', 'task', task.action, task.state, ...task.linkedServiceNames],
        kind: 'workflow',
        pageId: 'work',
        pageOrder: 0,
        pagePrefixes: ['/work', `/catalog/skus/${task.skuId}`],
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
  showAutomationsPage,
  showAnalysisPage,
  showRightRailCards,
  t,
}: {
  currency: 'USD' | 'KHR';
  displayViewMode: InterfaceViewMode;
  inventory: InventoryContextValue;
  language: AppLanguage;
  senaEngineParameters: { smoothingEnabled?: boolean };
  showExplanatoryTooltips: boolean;
  showFloatingTitleActions: boolean;
  showAutomationsPage: boolean;
  showAnalysisPage: boolean;
  showRightRailCards: boolean;
  t: Translator;
}) {
  const availability = deriveNavigationAvailability(inventory);
  const commands = [
    ...buildPageCommands(t, {
      ...availability,
    }),
    ...buildWorkflowCommands({ hasWork: availability.hasWork }),
    ...buildSettingsCommands({
      currency,
      displayViewMode,
      language,
      senaEngineParameters,
      showExplanatoryTooltips,
      showFloatingTitleActions,
      showAutomationsPage,
      showRightRailCards,
      t,
    }),
    ...buildOverviewCommands(),
    ...buildCatalogCommands(),
    ...buildArchiveCommands(),
    ...(availability.hasInsights ? buildPerformanceCommands() : []),
    ...(availability.hasInsights ? buildFinancialsCommands() : []),
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
  if (command.id.startsWith('sku:') || command.id.startsWith('work:task:')) {
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
