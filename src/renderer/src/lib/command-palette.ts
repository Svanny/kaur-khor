import Fuse from 'fuse.js';
import type { SenaCatalog } from '@shared/sena';
import type { AppLanguage } from '@shared/inventory';
import type { InventoryContextValue } from '@/state/inventory';
import {
  buildAnalysisHref,
  buildCatalogHref,
  buildOverviewHref,
  buildOperationsHref,
  buildPerformanceHref,
  buildServiceDetailHref,
  buildSkuDetailHref,
  type AnalysisScopeValue,
  type AnalysisSectionValue,
  type AnalysisTimeframeValue,
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
import { buildOverviewModel, isOverviewSkuTask } from '@/routes/overview/view-model';

export type CommandKind = 'page' | 'tab' | 'entity' | 'workflow' | 'sheet';

export type CommandAction =
  | { href: string; type: 'page' }
  | { href: string; type: 'tab' }
  | { href: string; type: 'entity' }
  | { href: string; type: 'workflow' }
  | { href: string; type: 'sheet' };

export interface CommandDescriptor {
  action: CommandAction;
  aliases: string[];
  emptyQueryRank?: number;
  id: string;
  keywords: string[];
  kind: CommandKind;
  pagePrefixes: string[];
  priority: number;
  subtitle?: string;
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
  pagePrefixes,
  priority,
  subtitle,
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
    pagePrefixes,
    priority,
    subtitle,
    title,
  } satisfies CommandDescriptor;
}

function pageCommand({
  aliases,
  href,
  id,
  keywords,
  pagePrefix,
  priority,
  subtitle,
  title,
}: {
  aliases?: string[];
  href: string;
  id: string;
  keywords?: string[];
  pagePrefix: string;
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
  priority,
  subtitle,
  title,
}: {
  aliases?: string[];
  href: string;
  id: string;
  keywords?: string[];
  pagePrefix: string;
  priority: number;
  subtitle?: string;
  title: string;
}) {
  return createCommand({
    action: { href, type: 'tab' },
    aliases,
    emptyQueryRank: priority,
    id,
    keywords,
    kind: 'tab',
    pagePrefixes: [pagePrefix],
    priority,
    subtitle,
    title,
  });
}

function buildPageCommands(t: Translator) {
  return [
    pageCommand({
      aliases: ['home', 'dashboard'],
      href: buildOverviewHref(),
      id: 'page:overview',
      keywords: ['queue', 'tasks', 'overview'],
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
      pagePrefix: '/performance',
      priority: 12,
      subtitle: 'Demand, capacity, and cash movement',
      title: t('navPerformance'),
    }),
    pageCommand({
      aliases: ['workbench', 'analysis'],
      href: buildAnalysisHref(),
      id: 'page:analysis',
      keywords: ['analysis', 'workbench', 'fragility', 'pressure'],
      pagePrefix: '/analysis',
      priority: 13,
      subtitle: 'Deep analysis workbench',
      title: t('navAnalysis'),
    }),
    pageCommand({
      aliases: ['inventory'],
      href: buildCatalogHref(),
      id: 'page:catalog',
      keywords: ['catalog', 'skus', 'services'],
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
      pagePrefix: '/operations',
      priority: 15,
      subtitle: 'Observation history and logs',
      title: t('navOperations'),
    }),
    pageCommand({
      aliases: ['preferences'],
      href: '/settings',
      id: 'page:settings',
      keywords: ['settings', 'preferences'],
      pagePrefix: '/settings',
      priority: 16,
      subtitle: 'Preferences and SENA parameters',
      title: t('navSettings'),
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
        pagePrefix: '/',
        priority: 40 + index,
        subtitle: 'Overview scope',
        title: command.label,
      }),
    ),
    ...filterCommands.map((command, index) =>
      tabCommand({
        aliases: ['overview', 'filter'],
        href: buildOverviewHref({ filter: command.value }),
        id: `overview:filter:${command.value}`,
        keywords: ['overview', 'filter', command.value],
        pagePrefix: '/',
        priority: 50 + index,
        subtitle: 'Overview filter',
        title: command.label,
      }),
    ),
  ];
}

function buildCatalogCommands() {
  const viewCommands: Array<{ label: string; value: CatalogViewValue }> = [
    { label: 'Catalog: all items', value: 'all' },
    { label: 'Catalog: SKUs', value: 'skus' },
    { label: 'Catalog: services', value: 'services' },
  ];

  return viewCommands.map((command, index) =>
    tabCommand({
      aliases: ['catalog', 'view'],
      href: buildCatalogHref({ view: command.value }),
      id: `catalog:view:${command.value}`,
      keywords: ['catalog', command.value],
      pagePrefix: '/catalog',
      priority: 60 + index,
      subtitle: 'Catalog view',
      title: command.label,
    }),
  );
}

function buildOperationsCommands() {
  const scopeCommands: Array<{ label: string; value: OperationsScopeValue }> = [
    { label: 'Logs: all items', value: 'all' },
    { label: 'Logs: SKUs', value: 'skus' },
    { label: 'Logs: services', value: 'services' },
  ];
  const viewCommands: Array<{ label: string; value: OperationsViewValue }> = [
    { label: 'Logs heatmap view', value: 'heatmap' },
    { label: 'Logs list view', value: 'all' },
  ];

  return [
    ...scopeCommands.map((command, index) =>
      tabCommand({
        aliases: ['logs', 'operations', 'scope'],
        href: buildOperationsHref({ scope: command.value }),
        id: `operations:scope:${command.value}`,
        keywords: ['operations', 'logs', command.value],
        pagePrefix: '/operations',
        priority: 70 + index,
        subtitle: 'Operations scope',
        title: command.label,
      }),
    ),
    ...viewCommands.map((command, index) =>
      tabCommand({
        aliases: ['logs', 'operations', 'view'],
        href: buildOperationsHref({ view: command.value }),
        id: `operations:view:${command.value}`,
        keywords: ['operations', 'logs', 'view', command.value],
        pagePrefix: '/operations',
        priority: 80 + index,
        subtitle: 'Operations view',
        title: command.label,
      }),
    ),
  ];
}

function buildPerformanceCommands() {
  const rangeCommands: Array<{ label: string; value: PerformanceRangeValue }> = [
    { label: 'Performance 7D', value: '7d' },
    { label: 'Performance 30D', value: '30d' },
    { label: 'Performance 90D', value: '90d' },
  ];
  const scopeCommands: Array<{ label: string; value: PerformanceScopeValue }> = [
    { label: 'Performance: all items', value: 'all' },
    { label: 'Performance: services', value: 'services' },
    { label: 'Performance: SKUs', value: 'skus' },
  ];

  return [
    ...rangeCommands.map((command, index) =>
      tabCommand({
        aliases: ['performance', 'range'],
        href: buildPerformanceHref({ range: command.value }),
        id: `performance:range:${command.value}`,
        keywords: ['performance', 'range', command.value],
        pagePrefix: '/performance',
        priority: 90 + index,
        subtitle: 'Performance range',
        title: command.label,
      }),
    ),
    ...scopeCommands.map((command, index) =>
      tabCommand({
        aliases: ['performance', 'scope'],
        href: buildPerformanceHref({ scope: command.value }),
        id: `performance:scope:${command.value}`,
        keywords: ['performance', 'scope', command.value],
        pagePrefix: '/performance',
        priority: 100 + index,
        subtitle: 'Performance scope',
        title: command.label,
      }),
    ),
    tabCommand({
      aliases: ['performance', 'compare'],
      href: buildPerformanceHref({ compare: true }),
      id: 'performance:compare:on',
      keywords: ['performance', 'compare', 'on'],
      pagePrefix: '/performance',
      priority: 104,
      subtitle: 'Performance comparison',
      title: 'Performance compare view',
    }),
    tabCommand({
      aliases: ['performance', 'compare'],
      href: buildPerformanceHref({ compare: false }),
      id: 'performance:compare:off',
      keywords: ['performance', 'compare', 'off'],
      pagePrefix: '/performance',
      priority: 105,
      subtitle: 'Performance comparison',
      title: 'Performance single view',
    }),
  ];
}

function buildAnalysisCommands() {
  const scopeCommands: Array<{ label: string; value: AnalysisScopeValue }> = [
    { label: 'Analysis: all items', value: 'all' },
    { label: 'Analysis: services', value: 'services' },
    { label: 'Analysis: SKUs', value: 'skus' },
  ];
  const sectionCommands: Array<{ label: string; value: AnalysisSectionValue }> = [
    { label: 'Analysis workbench', value: 'workbench' },
    { label: 'Analysis pressure', value: 'pressure' },
    { label: 'Analysis observations', value: 'observations' },
    { label: 'Analysis fragility', value: 'fragility' },
    { label: 'Analysis settings', value: 'settings' },
  ];
  const timeframeCommands: AnalysisTimeframeValue[] = ['Recent', '1M', '3M', 'YTD', '1Y', 'MAX'];

  return [
    ...scopeCommands.map((command, index) =>
      tabCommand({
        aliases: ['analysis', 'scope'],
        href: buildAnalysisHref({ scope: command.value }),
        id: `analysis:scope:${command.value}`,
        keywords: ['analysis', 'scope', command.value],
        pagePrefix: '/analysis',
        priority: 110 + index,
        subtitle: 'Analysis scope',
        title: command.label,
      }),
    ),
    ...sectionCommands.map((command, index) =>
      tabCommand({
        aliases: ['analysis', 'section'],
        href: buildAnalysisHref({ section: command.value }),
        id: `analysis:section:${command.value}`,
        keywords: ['analysis', 'section', command.value],
        pagePrefix: '/analysis',
        priority: 120 + index,
        subtitle: 'Analysis section',
        title: command.label,
      }),
    ),
    ...timeframeCommands.map((command, index) =>
      tabCommand({
        aliases: ['analysis', 'timeframe'],
        href: buildAnalysisHref({ timeframe: command }),
        id: `analysis:timeframe:${command}`,
        keywords: ['analysis', 'timeframe', command],
        pagePrefix: '/analysis',
        priority: 130 + index,
        subtitle: 'Analysis timeframe',
        title: `Analysis timeframe: ${command}`,
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
      pagePrefixes: ['/record-update', '/'],
      priority: 19,
      subtitle: 'Capture the next observation',
      title: 'Start update',
    }),
  ];
}

function buildSkuEntityCommands(catalog: SenaCatalog) {
  return catalog.skus.flatMap((sku) => {
    const commands: CommandDescriptor[] = [
      createCommand({
        action: { href: buildSkuDetailHref(sku.skuId), type: 'entity' },
        aliases: [sku.skuId],
        id: `sku:open:${sku.skuId}`,
        keywords: ['sku', 'open', sku.skuId],
        kind: 'entity',
        pagePrefixes: ['/catalog', `/catalog/skus/${sku.skuId}`],
        priority: 200,
        subtitle: `SKU · ${sku.skuId}`,
        title: sku.name,
      }),
      createCommand({
        action: { href: `/catalog/skus/${sku.skuId}/edit`, type: 'workflow' },
        aliases: [sku.skuId, 'edit sku'],
        id: `sku:edit:${sku.skuId}`,
        keywords: ['sku', 'edit', sku.skuId],
        kind: 'workflow',
        pagePrefixes: ['/catalog', `/catalog/skus/${sku.skuId}`],
        priority: 210,
        subtitle: `SKU · ${sku.skuId}`,
        title: `Edit ${sku.name}`,
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
          aliases: [sku.skuId, command.mode, sku.name],
          id: `sku:sheet:${command.mode}:${sku.skuId}`,
          keywords: ['sku', 'sheet', command.mode, sku.skuId],
          kind: 'sheet',
          pagePrefixes: [`/catalog/skus/${sku.skuId}`],
          priority: 220 + index,
          subtitle: `SKU action · ${sku.skuId}`,
          title: `${command.label} for ${sku.name}`,
        }),
      ),
    ];
  });
}

function buildServiceEntityCommands(catalog: SenaCatalog) {
  return catalog.services.flatMap((service) => {
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
        pagePrefixes: ['/catalog', `/catalog/services/${service.serviceId}`],
        priority: 240,
        subtitle: `Service · ${service.serviceId}`,
        title: `Edit ${service.name}`,
      }),
      ...sheetCommands.map((command, index) =>
        createCommand({
          action: { href: buildServiceDetailHref(service.serviceId, command.mode), type: 'sheet' },
          aliases: [service.serviceId, command.mode, service.name],
          id: `service:sheet:${command.mode}:${service.serviceId}`,
          keywords: ['service', 'sheet', command.mode, service.serviceId],
          kind: 'sheet',
          pagePrefixes: [`/catalog/services/${service.serviceId}`],
          priority: 250 + index,
          subtitle: `Service action · ${service.serviceId}`,
          title: `${command.label} for ${service.name}`,
        }),
      ),
    ];
  });
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
        aliases: [task.skuId, task.action, task.state],
        id: `overview:task:${task.skuId}:${task.action}`,
        keywords: ['overview', 'task', task.action, task.state, ...task.linkedServiceNames],
        kind: 'workflow',
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
  inventory,
  language,
  t,
}: {
  inventory: InventoryContextValue;
  language: AppLanguage;
  t: Translator;
}) {
  const commands = [
    ...buildPageCommands(t),
    ...buildWorkflowCommands(),
    ...buildOverviewCommands(),
    ...buildCatalogCommands(),
    ...buildOperationsCommands(),
    ...buildPerformanceCommands(),
    ...buildAnalysisCommands(),
  ];

  if (!inventory.catalog) {
    return commands;
  }

  return [
    ...commands,
    ...buildSkuEntityCommands(inventory.catalog),
    ...buildServiceEntityCommands(inventory.catalog),
    ...buildOverviewTaskCommands(inventory, language),
  ];
}

function buildFuse(commands: CommandDescriptor[]) {
  return new Fuse(commands, {
    ignoreLocation: true,
    includeScore: true,
    keys: ['title', 'subtitle', 'aliases', 'keywords'],
    threshold: 0.34,
  });
}

function commandMatchesPath(command: CommandDescriptor, pathname: string) {
  return command.pagePrefixes.some((prefix) =>
    prefix === '/'
      ? pathname === '/'
      : pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
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
      const haystacks = [command.title, command.subtitle, ...command.aliases, ...command.keywords]
        .filter((value): value is string => Boolean(value))
        .map((value) => normalizeText(value));
      const exact = haystacks.some((value) => value === normalizedQuery);
      const prefix = haystacks.some((value) => value.startsWith(normalizedQuery));
      const contains = haystacks.some((value) => value.includes(normalizedQuery));
      const fuseScore = scoreById.get(command.id);

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
