import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SenaCatalog, SenaObservationRecord, SenaRecordUpdateContext, SenaTicketSummary, SenaWorkspaceSummary } from '@shared/sena';
import {
  buildOverviewModel as buildOverviewModelBase,
  isOverviewSupplierTicketTask,
  nextCheckLabel,
  relativeReceiptLabel,
} from './view-model';

type BuildOverviewModelInput = Parameters<typeof buildOverviewModelBase>[0];

function buildOverviewModel(input: Omit<BuildOverviewModelInput, 'orderBatches'> & Partial<Pick<BuildOverviewModelInput, 'orderBatches'>>) {
  return buildOverviewModelBase({
    orderBatches: [],
    recordUpdateContext: null,
    ...input,
  });
}

const taskCatalog: SenaCatalog = {
  schemaVersion: 1,
  skus: [
    {
      archived: false,
      skuId: 'sku-1',
      name: 'Shampoo Classic',
      description: 'Retail shampoo',
      costPerUnit: 5,
      soldAsProduct: true,
      productPrice: 20,
      leadTimeMeanDaysHint: 4,
      leadTimeStdDaysHint: 1,
    },
  ],
  services: [],
  bundles: [],
  sharingMask: [],
};

const taskWorkspaceSummary: SenaWorkspaceSummary = {
  ownerSub: 'desktop-owner',
  runId: 'run-1',
  latestObservedAt: '2026-04-01T10:00:00.000Z',
  skuCount: 1,
  serviceCount: 0,
  intervalCount: 0,
  pendingReorderCount: 0,
  topRegime: 'normal',
  highRiskSkuIds: [],
  skuSummaries: [
    {
      skuId: 'sku-1',
      latestPosteriorUnits: 5,
      credibleIntervalLow: 3,
      credibleIntervalHigh: 10,
      demandPerDayMean: 4,
      stockoutRisk: 0.82,
      daysOfCover: 2,
      expectedLeadTimeDemand: 12,
      safetyStock: 2,
      reorderPoint: 14,
      reorderTriggerProbability: 0.88,
      reorderQuantity: {
        recommendedUnits: 14.2,
        ungatedRecommendedUnits: 14.2,
        likelyRangeLow: 10,
        likelyRangeHigh: 18,
        needProbability: 0.78,
        recommendationIssued: true,
        recommendationQuantile: 0.7,
        intervalLowQuantile: 0.1,
        intervalHighQuantile: 0.9,
        needProbabilityGate: 0.5,
        reviewDelayDays: 0,
      },
      leadTimeMeanDays: 4,
      leadTimeStdDays: 1,
      regimeProbabilities: { promo: 0.8, normal: 0.2 },
    },
  ],
};

const reminderCatalog: SenaCatalog = {
  schemaVersion: 1,
  skus: [],
  services: [],
  bundles: [],
  sharingMask: [],
};

const reminderWorkspaceSummary: SenaWorkspaceSummary = {
  ...taskWorkspaceSummary,
  skuCount: 0,
  skuSummaries: [],
};

function makeObservation(observedAt: string): SenaObservationRecord {
  return {
    observationId: `obs-${observedAt}`,
    ownerSub: 'desktop-owner',
    input: {
      observedAt,
      stockSnapshot: [],
      serviceRankings: [],
      retailRankings: [],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [],
      servicePrices: [],
      retailPrices: [],
      leadTimeHints: [],
      adjustmentSignals: [],
      recipeUsageHints: [],
      notes: null,
    },
  };
}

function recordUpdateContextWithSupplierTickets(tickets: SenaTicketSummary[]): SenaRecordUpdateContext {
  const latestObservedAt = tickets[0]?.occurredAt ?? '2026-04-09T09:59:00.000Z';
  return {
    observationFingerprint: { count: tickets.length, latestObservedAt, latestObservationId: 'obs-ticket' },
    latestObservedAt,
    latestStockBySku: {},
    latestRetailSaleBySku: {},
    latestServiceSaleByService: {},
    latestOrderBySku: {},
    latestReceiptBySku: {},
    openTicketsByFamily: { customer: [], supplier: tickets.filter((ticket) => ticket.lifecycle === 'open') },
    latestTicketsById: Object.fromEntries(tickets.map((ticket) => [
      ticket.ticketId,
      {
        observationId: 'obs-ticket',
        observedAt: ticket.occurredAt,
        value: ticket,
      },
    ])),
    latestDeliveryFeeByBucket: {},
    recentActivity: [],
  };
}

function localDateKey(value: string) {
  const date = new Date(value);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

describe('buildOverviewModel stale update reminder', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-12T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('adds a reminder task when the last recorded update is more than 7 days old', () => {
    const model = buildOverviewModel({
      catalog: reminderCatalog,
      detailBySkuId: {},
      language: 'en',
      observations: [makeObservation('2026-04-01T10:00:00.000Z')],
      workspaceSummary: reminderWorkspaceSummary,
    });

    expect(model.tasks).toHaveLength(1);
    expect(model.tasks[0]).toMatchObject({
      kind: 'stale_update_reminder',
      actionLabel: 'Start update',
      snoozeActionLabel: 'Remind tomorrow',
      staleDays: 11,
    });
  });

  it('does not add a reminder task when the last recorded update is 7 days old or newer', () => {
    const model = buildOverviewModel({
      catalog: reminderCatalog,
      detailBySkuId: {},
      language: 'en',
      observations: [makeObservation('2026-04-05T10:00:00.000Z')],
      workspaceSummary: reminderWorkspaceSummary,
    });

    expect(model.tasks).toHaveLength(0);
  });

  it('suppresses the reminder while snoozed and brings it back after the snooze day passes', () => {
    const baseInput = {
      catalog: reminderCatalog,
      detailBySkuId: {},
      language: 'en' as const,
      observations: [makeObservation('2026-04-01T10:00:00.000Z')],
      workspaceSummary: reminderWorkspaceSummary,
    };

    const suppressedModel = buildOverviewModel({
      ...baseInput,
      staleUpdateReminderSnoozeUntil: '2026-04-13T00:00:00.000Z',
    });
    expect(suppressedModel.tasks).toHaveLength(0);

    const visibleAgainModel = buildOverviewModel({
      ...baseInput,
      staleUpdateReminderSnoozeUntil: '2026-04-12T00:00:00.000Z',
    });
    expect(visibleAgainModel.tasks).toHaveLength(1);
    expect(visibleAgainModel.tasks[0]?.kind).toBe('stale_update_reminder');
  });

  it('can force the reminder visible in dev even when the last update is recent', () => {
    const model = buildOverviewModel({
      catalog: reminderCatalog,
      detailBySkuId: {},
      forceStaleUpdateReminder: true,
      language: 'en',
      observations: [makeObservation('2026-04-10T10:00:00.000Z')],
      workspaceSummary: reminderWorkspaceSummary,
    });

    expect(model.tasks).toHaveLength(1);
    expect(model.tasks[0]).toMatchObject({
      kind: 'stale_update_reminder',
      actionLabel: 'Start update',
    });
  });

  it('builds localized signals from stable task state instead of English labels', () => {
    const model = buildOverviewModel({
      catalog: taskCatalog,
      detailBySkuId: {
        'sku-1': {
          summary: taskWorkspaceSummary.skuSummaries[0]!,
          inventoryPosterior: [],
          demandPosterior: [],
          pipelinePosterior: [],
          leadTimePosterior: [],
        },
      },
      language: 'km',
      observations: [
        {
          ...makeObservation('2026-04-10T10:00:00.000Z'),
          input: {
            ...makeObservation('2026-04-10T10:00:00.000Z').input,
            retailPrices: [{ price: 18, skuId: 'sku-1' }],
          },
        },
      ],
      workspaceSummary: taskWorkspaceSummary,
    });

    expect(model.signals.some((signal) => signal.text.includes('Shampoo Classic'))).toBe(true);
    expect(model.signals.some((signal) => signal.text.includes('promo'))).toBe(false);
    expect(model.signals).toHaveLength(2);
  });

  it('does not build SKU tasks for archived catalog items', () => {
    const model = buildOverviewModel({
      catalog: {
        ...taskCatalog,
        skus: taskCatalog.skus.map((sku) => ({ ...sku, archived: true })),
      },
      detailBySkuId: {},
      language: 'en',
      observations: [],
      workspaceSummary: taskWorkspaceSummary,
    });

    expect(model.tasks).toHaveLength(0);
  });

  it('formats relative receipt and next-check labels in Khmer without forced English dates', () => {
    expect(relativeReceiptLabel(null, 'km')).toBe('ថ្មីៗ');
    expect(relativeReceiptLabel('2026-04-12T08:00:00.000Z', 'km')).toBe('ថ្ងៃនេះ');
    expect(relativeReceiptLabel('2026-04-11T00:00:00.000Z', 'km')).toBe('ម្សិលមិញ');
    expect(nextCheckLabel(null, 'km')).toBe('កំពុងរង់ចាំពេលពិនិត្យបន្ទាប់');
    expect(nextCheckLabel('2026-04-12T18:00:00.000Z', 'km')).toBe('ពិនិត្យថ្ងៃនេះ');
    expect(nextCheckLabel('2026-04-13T12:00:00.000Z', 'km')).toBe('ពិនិត្យថ្ងៃស្អែក');
  });

  it('does not create a receipt-ready task from a stock-only update with no order signal', () => {
    const model = buildOverviewModel({
      catalog: taskCatalog,
      detailBySkuId: {
        'sku-1': {
          summary: {
            ...taskWorkspaceSummary.skuSummaries[0]!,
            reorderQuantity: undefined,
            reorderTriggerProbability: 0.05,
            stockoutRisk: 0.1,
            daysOfCover: 10,
          },
          inventoryPosterior: [],
          demandPosterior: [],
          pipelinePosterior: [
            {
              intervalIndex: 0,
              inTransitMean: 6,
              orderProbability: 0,
              orderQuantityMean: 0,
              receiptQuantityMean: 0,
              ageDaysMean: 0,
            },
          ],
          leadTimePosterior: [
            {
              intervalIndex: 0,
              logMeanDays: 0,
              logStdDays: 0,
              meanDays: 4,
              stdDays: 1,
              observedVariabilityClass: 'normal',
              observedRelativeWidth: null,
            },
          ],
        },
      },
      language: 'en',
      observations: [
        {
          ...makeObservation('2026-04-10T10:00:00.000Z'),
          input: {
            ...makeObservation('2026-04-10T10:00:00.000Z').input,
            stockSnapshot: [{ skuId: 'sku-1', unitsInStock: 12, costPerUnit: 5, productPrice: 20 }],
          },
        },
      ],
      workspaceSummary: {
        ...taskWorkspaceSummary,
        latestObservedAt: '2026-04-10T10:00:00.000Z',
        skuSummaries: [
          {
            ...taskWorkspaceSummary.skuSummaries[0]!,
            reorderQuantity: undefined,
            reorderTriggerProbability: 0.05,
            stockoutRisk: 0.1,
            daysOfCover: 10,
          },
        ],
      },
    });

    expect(model.tasks).toHaveLength(0);
    expect(model.todayCounts.readyToReceive).toBe(0);
  });

  it('sanitizes dirty numeric SKU summaries before building overview tasks', () => {
    const dirtySummary = {
      ...taskWorkspaceSummary.skuSummaries[0]!,
      latestPosteriorUnits: Number.NaN,
      credibleIntervalLow: Number.NaN,
      credibleIntervalHigh: Number.POSITIVE_INFINITY,
      stockoutRisk: Number.POSITIVE_INFINITY,
      daysOfCover: Number.NaN,
      safetyStock: Number.NaN,
      reorderPoint: Number.POSITIVE_INFINITY,
      reorderTriggerProbability: Number.POSITIVE_INFINITY,
      reorderQuantity: {
        ...taskWorkspaceSummary.skuSummaries[0]!.reorderQuantity!,
        recommendedUnits: Number.POSITIVE_INFINITY,
        ungatedRecommendedUnits: Number.POSITIVE_INFINITY,
        needProbability: Number.POSITIVE_INFINITY,
        needProbabilityGate: 0.5,
      },
      leadTimeMeanDays: Number.POSITIVE_INFINITY,
      leadTimeStdDays: Number.NaN,
    };
    const orderObservation = makeObservation('2026-04-10T10:00:00.000Z');
    const model = buildOverviewModel({
      catalog: {
        ...taskCatalog,
        skus: [{
          ...taskCatalog.skus[0]!,
          costPerUnit: Number.POSITIVE_INFINITY,
          productPrice: Number.NaN,
        }],
      },
      detailBySkuId: {
        'sku-1': {
          summary: dirtySummary,
          inventoryPosterior: [],
          demandPosterior: [],
          pipelinePosterior: [{
            intervalIndex: 0,
            inTransitMean: Number.POSITIVE_INFINITY,
            orderProbability: Number.POSITIVE_INFINITY,
            orderQuantityMean: Number.POSITIVE_INFINITY,
            receiptQuantityMean: Number.NaN,
            ageDaysMean: Number.NaN,
          }],
          leadTimePosterior: [{
            intervalIndex: 0,
            logMeanDays: 0,
            logStdDays: 0,
            meanDays: Number.POSITIVE_INFINITY,
            stdDays: Number.NaN,
            observedVariabilityClass: null,
            observedRelativeWidth: null,
          }],
        },
      },
      language: 'en',
      observations: [{
        ...orderObservation,
        input: {
          ...orderObservation.input,
          orderSignals: [{
            skuId: 'sku-1',
            orderPlaced: true,
            receiptArrived: false,
            approximateOrderQuantity: Number.POSITIVE_INFINITY,
            approximateReceiptQuantity: null,
          }],
        },
      }],
      workspaceSummary: {
        ...taskWorkspaceSummary,
        skuSummaries: [dirtySummary],
      },
    });

    expect(model.tasks).toHaveLength(1);
    const task = model.tasks[0];
    expect(task?.kind).toBe('sku');
    if (!task || task.kind !== 'sku') {
      throw new Error('Expected SKU overview task.');
    }
    expect(task.state).toBe('awaiting_receipt');
    expect(task.currentStock).toBe(0);
    expect(task.costPerUnit).toBe(0);
    expect(task.productPrice).toBeNull();
    expect(task.stockoutRisk).toBe(0);
    expect(task.reorderTriggerProbability).toBe(0);
    expect(task.daysOfCover).toBeNull();
    expect(task.leadTimeMeanDays).toBeNull();
    expect(task.leadTimeStdDays).toBeNull();
    expect(task.suggestedOrderQuantity).toBe(0);
    expect(task.heartbeat.join(' ')).not.toMatch(/NaN|Infinity|∞/);
  });

  it('sorts supplier queue tasks by oldest relevant activity first', () => {
    const model = buildOverviewModel({
      catalog: {
        ...taskCatalog,
        skus: [
          {
            ...taskCatalog.skus[0]!,
            skuId: 'sku-newer',
            name: 'Newer high risk',
          },
          {
            ...taskCatalog.skus[0]!,
            skuId: 'sku-older',
            name: 'Older low risk',
          },
        ],
      },
      detailBySkuId: {},
      language: 'en',
      observations: [
        {
          ...makeObservation('2026-04-10T10:00:00.000Z'),
          input: {
            ...makeObservation('2026-04-10T10:00:00.000Z').input,
            stockSnapshot: [{ skuId: 'sku-older', unitsInStock: 1, costPerUnit: 5, productPrice: 20 }],
          },
        },
        {
          ...makeObservation('2026-04-11T10:00:00.000Z'),
          input: {
            ...makeObservation('2026-04-11T10:00:00.000Z').input,
            stockSnapshot: [{ skuId: 'sku-newer', unitsInStock: 1, costPerUnit: 5, productPrice: 20 }],
          },
        },
      ],
      workspaceSummary: {
        ...taskWorkspaceSummary,
        skuSummaries: [
          {
            ...taskWorkspaceSummary.skuSummaries[0]!,
            skuId: 'sku-newer',
            stockoutRisk: 0.95,
          },
          {
            ...taskWorkspaceSummary.skuSummaries[0]!,
            skuId: 'sku-older',
            stockoutRisk: 0.1,
          },
        ],
      },
    });

    expect(model.tasks.map((task) => task.id)).toEqual(['sku-older', 'sku-newer']);
  });

  it('keeps supplier orders visible when a later receipt observation has a malformed timestamp', () => {
    const orderObservation = makeObservation('2026-04-10T10:00:00.000Z');
    const dirtyReceiptObservation = makeObservation('not-a-date');
    const model = buildOverviewModel({
      catalog: taskCatalog,
      detailBySkuId: {},
      language: 'en',
      observations: [
        {
          ...orderObservation,
          input: {
            ...orderObservation.input,
            orderSignals: [{
              skuId: 'sku-1',
              orderPlaced: true,
              receiptArrived: false,
              approximateOrderQuantity: 8,
              approximateReceiptQuantity: null,
            }],
          },
        },
        {
          ...dirtyReceiptObservation,
          input: {
            ...dirtyReceiptObservation.input,
            orderSignals: [{
              skuId: 'sku-1',
              orderPlaced: false,
              receiptArrived: true,
              approximateOrderQuantity: null,
              approximateReceiptQuantity: 8,
            }],
          },
        },
      ],
      workspaceSummary: {
        ...taskWorkspaceSummary,
        skuSummaries: [
          {
            ...taskWorkspaceSummary.skuSummaries[0]!,
            reorderQuantity: undefined,
            reorderTriggerProbability: 0.05,
            stockoutRisk: 0.1,
            daysOfCover: 10,
          },
        ],
      },
    });

    expect(model.tasks[0]).toMatchObject({
      id: 'sku-1',
      state: 'awaiting_receipt',
    });
  });

  it('groups multiple SKU reorder tasks that share a supplier ticket', () => {
    const ticket: SenaTicketSummary = {
      ticketId: 'supplier-ticket-42',
      ticketFamily: 'supplier',
      lifecycle: 'open',
      stage: 'ordered_waiting',
      revision: 2,
      eventType: 'created',
      occurredAt: '2026-04-09T09:59:00.000Z',
      nextTouchAt: '2026-04-14T05:00:00.000Z',
      party: { role: 'supplier', supplierName: 'Mekong Looms' },
      lines: [
        { entityType: 'sku', entityId: 'sku-a', orderedQuantity: 5, receivedQuantity: null, expectedArrivalAt: '2026-04-14T05:00:00.000Z' },
        { entityType: 'sku', entityId: 'sku-b', orderedQuantity: 8, receivedQuantity: null, expectedArrivalAt: '2026-04-14T05:00:00.000Z' },
      ],
      note: null,
    };
    const model = buildOverviewModel({
      catalog: {
        ...taskCatalog,
        skus: [
          { ...taskCatalog.skus[0]!, skuId: 'sku-a', name: 'Ticket A', supplierName: 'Mekong Looms' },
          { ...taskCatalog.skus[0]!, skuId: 'sku-b', name: 'Ticket B', supplierName: 'Mekong Looms' },
          { ...taskCatalog.skus[0]!, skuId: 'sku-c', name: 'Unticketed C', supplierName: 'Mekong Looms' },
        ],
      },
      detailBySkuId: {},
      language: 'en',
      observations: [],
      orderBatches: [],
      recordUpdateContext: recordUpdateContextWithSupplierTickets([ticket]),
      workspaceSummary: {
        ...taskWorkspaceSummary,
        skuSummaries: [
          { ...taskWorkspaceSummary.skuSummaries[0]!, skuId: 'sku-a' },
          { ...taskWorkspaceSummary.skuSummaries[0]!, skuId: 'sku-b' },
          { ...taskWorkspaceSummary.skuSummaries[0]!, skuId: 'sku-c' },
        ],
      },
    });

    expect(model.tasks).toHaveLength(2);
    const ticketTask = model.tasks.find(isOverviewSupplierTicketTask);
    expect(ticketTask).toMatchObject({
      kind: 'supplier_ticket',
      displayTicketId: '2026-04-09-#1',
      displayTicketLabel: 'Supplier Ticket ID: 2026-04-09-#1',
      ticketId: 'supplier-ticket-42',
      skuCount: 2,
    });
    expect(ticketTask?.childTasks.map((task) => task.skuId).sort()).toEqual(['sku-a', 'sku-b']);
    expect(model.tasks.some((task) => task.kind === 'sku' && task.id === 'sku-c')).toBe(true);
  });

  it('groups supplier tickets discovered from observations when record-update context is missing', () => {
    const ticket: SenaTicketSummary = {
      ticketId: 'supplier-ticket-from-observation',
      ticketFamily: 'supplier',
      lifecycle: 'open',
      stage: 'ordered_waiting',
      revision: 1,
      eventType: 'created',
      occurredAt: '2026-04-09T09:59:00.000Z',
      nextTouchAt: '2026-04-14T05:00:00.000Z',
      party: { role: 'supplier', supplierName: 'Mekong Looms' },
      lines: [{ entityType: 'sku', entityId: 'sku-1', orderedQuantity: 8, receivedQuantity: null, expectedArrivalAt: '2026-04-14T05:00:00.000Z' }],
      note: null,
    };
    const model = buildOverviewModel({
      catalog: {
        ...taskCatalog,
        skus: [{ ...taskCatalog.skus[0]!, supplierName: 'Mekong Looms' }],
      },
      detailBySkuId: {},
      language: 'en',
      observations: [{
        ...makeObservation('2026-04-09T09:59:00.000Z'),
        input: {
          ...makeObservation('2026-04-09T09:59:00.000Z').input,
          orderSignals: [{
            skuId: 'sku-1',
            orderPlaced: true,
            receiptArrived: false,
            approximateOrderQuantity: 8,
            approximateReceiptQuantity: null,
          }],
          ticketEvents: [ticket],
        },
      }],
      orderBatches: [],
      recordUpdateContext: null,
      workspaceSummary: taskWorkspaceSummary,
    });

    const ticketTask = model.tasks.find(isOverviewSupplierTicketTask);
    expect(ticketTask).toMatchObject({
      kind: 'supplier_ticket',
      defaultDrawerMode: 'ordered_waiting',
      ticketId: 'supplier-ticket-from-observation',
      skuCount: 1,
    });
    expect(ticketTask?.whyDetail).toMatch(/^Ordered Apr 9/);
    expect(ticketTask?.whyDetail).not.toContain('arrival window');
    expect(model.tasks.some((task) => task.kind === 'sku' && task.id === 'sku-1')).toBe(false);
  });

  it('prefers valid supplier ticket timestamps over dirty revisions', () => {
    const baseTicket: SenaTicketSummary = {
      ticketId: 'supplier-ticket-dirty-revision',
      ticketFamily: 'supplier',
      lifecycle: 'open',
      stage: 'ordered_waiting',
      revision: 1,
      eventType: 'created',
      occurredAt: 'not-a-date',
      nextTouchAt: null,
      party: { role: 'supplier', supplierName: 'Mekong Looms' },
      lines: [{ entityType: 'sku', entityId: 'sku-1', orderedQuantity: 8, receivedQuantity: null, expectedArrivalAt: null }],
      note: null,
    };
    const model = buildOverviewModel({
      catalog: {
        ...taskCatalog,
        skus: [{ ...taskCatalog.skus[0]!, supplierName: 'Mekong Looms' }],
      },
      detailBySkuId: {},
      language: 'en',
      observations: [{
        ...makeObservation('2026-04-09T09:59:00.000Z'),
        input: {
          ...makeObservation('2026-04-09T09:59:00.000Z').input,
          ticketEvents: [
            baseTicket,
            { ...baseTicket, occurredAt: '2026-04-09T09:59:00.000Z', revision: 2 },
          ],
        },
      }],
      recordUpdateContext: null,
      workspaceSummary: taskWorkspaceSummary,
    });

    const ticketTask = model.tasks.find(isOverviewSupplierTicketTask);

    expect(ticketTask).toMatchObject({
      ticketId: 'supplier-ticket-dirty-revision',
      displayTicketLabel: 'Supplier Ticket ID: 2026-04-09-#1',
    });
    expect(ticketTask?.whyDetail).toMatch(/^Ordered Apr 9/);
  });

  it('groups observation-backed multi-SKU supplier tickets without record-update context', () => {
    const ticket: SenaTicketSummary = {
      ticketId: 'supplier-ticket-observed-multi',
      ticketFamily: 'supplier',
      lifecycle: 'open',
      stage: 'ordered_waiting',
      revision: 1,
      eventType: 'created',
      occurredAt: '2026-04-09T09:59:00.000Z',
      nextTouchAt: '2026-04-14T05:00:00.000Z',
      party: { role: 'supplier', supplierName: 'Mekong Looms' },
      lines: [
        { entityType: 'sku', entityId: 'sku-a', orderedQuantity: 5, receivedQuantity: null, expectedArrivalAt: '2026-04-14T05:00:00.000Z' },
        { entityType: 'sku', entityId: 'sku-b', orderedQuantity: 8, receivedQuantity: null, expectedArrivalAt: '2026-04-14T05:00:00.000Z' },
      ],
      note: null,
    };
    const observation = makeObservation('2026-04-09T09:59:00.000Z');
    const model = buildOverviewModel({
      catalog: {
        ...taskCatalog,
        skus: [
          { ...taskCatalog.skus[0]!, skuId: 'sku-a', name: 'Ticket A', supplierName: 'Mekong Looms' },
          { ...taskCatalog.skus[0]!, skuId: 'sku-b', name: 'Ticket B', supplierName: 'Mekong Looms' },
          { ...taskCatalog.skus[0]!, skuId: 'sku-c', name: 'Unticketed C', supplierName: 'Mekong Looms' },
        ],
      },
      detailBySkuId: {},
      language: 'en',
      observations: [{
        ...observation,
        input: {
          ...observation.input,
          orderSignals: [
            { skuId: 'sku-a', orderPlaced: true, receiptArrived: false, approximateOrderQuantity: 5, approximateReceiptQuantity: null },
            { skuId: 'sku-b', orderPlaced: true, receiptArrived: false, approximateOrderQuantity: 8, approximateReceiptQuantity: null },
          ],
          ticketEvents: [ticket],
        },
      }],
      orderBatches: [],
      recordUpdateContext: null,
      workspaceSummary: {
        ...taskWorkspaceSummary,
        skuSummaries: [
          { ...taskWorkspaceSummary.skuSummaries[0]!, skuId: 'sku-a' },
          { ...taskWorkspaceSummary.skuSummaries[0]!, skuId: 'sku-b' },
          { ...taskWorkspaceSummary.skuSummaries[0]!, skuId: 'sku-c' },
        ],
      },
    });

    const ticketTask = model.tasks.find(isOverviewSupplierTicketTask);
    expect(ticketTask).toMatchObject({
      kind: 'supplier_ticket',
      displayTicketId: '2026-04-09-#1',
      ticketId: 'supplier-ticket-observed-multi',
      skuCount: 2,
    });
    expect(ticketTask?.childTasks.map((task) => task.skuId).sort()).toEqual(['sku-a', 'sku-b']);
    expect(model.tasks.some((task) => task.kind === 'sku' && task.id === 'sku-c')).toBe(true);
  });

  it('groups supplier tickets by line membership when supplier names differ', () => {
    const ticket: SenaTicketSummary = {
      ticketId: 'supplier-ticket-name-mismatch',
      ticketFamily: 'supplier',
      lifecycle: 'open',
      stage: 'ordered_waiting',
      revision: 1,
      eventType: 'created',
      occurredAt: '2026-04-09T09:59:00.000Z',
      nextTouchAt: '2026-04-14T05:00:00.000Z',
      party: { role: 'supplier', supplierName: 'Old Supplier Name' },
      lines: [
        { entityType: 'sku', entityId: 'sku-a', orderedQuantity: 5, receivedQuantity: null, expectedArrivalAt: '2026-04-14T05:00:00.000Z' },
        { entityType: 'sku', entityId: 'sku-b', orderedQuantity: 8, receivedQuantity: null, expectedArrivalAt: '2026-04-14T05:00:00.000Z' },
      ],
      note: null,
    };
    const model = buildOverviewModel({
      catalog: {
        ...taskCatalog,
        skus: [
          { ...taskCatalog.skus[0]!, skuId: 'sku-a', name: 'Ticket A', supplierName: 'Current Supplier Name' },
          { ...taskCatalog.skus[0]!, skuId: 'sku-b', name: 'Ticket B', supplierName: 'Current Supplier Name' },
        ],
      },
      detailBySkuId: {},
      language: 'en',
      observations: [],
      orderBatches: [],
      recordUpdateContext: recordUpdateContextWithSupplierTickets([ticket]),
      workspaceSummary: {
        ...taskWorkspaceSummary,
        skuSummaries: [
          { ...taskWorkspaceSummary.skuSummaries[0]!, skuId: 'sku-a' },
          { ...taskWorkspaceSummary.skuSummaries[0]!, skuId: 'sku-b' },
        ],
      },
    });

    const ticketTask = model.tasks.find(isOverviewSupplierTicketTask);
    expect(ticketTask).toMatchObject({
      kind: 'supplier_ticket',
      ticketId: 'supplier-ticket-name-mismatch',
      skuCount: 2,
      supplierName: 'Old Supplier Name',
    });
    expect(model.tasks.some((task) => task.kind === 'sku')).toBe(false);
  });

  it('keeps canceled supplier ticket groups in canceled state instead of not ordered', () => {
    const ticket: SenaTicketSummary = {
      ticketId: 'supplier-ticket-canceled',
      ticketFamily: 'supplier',
      lifecycle: 'canceled',
      stage: 'to_order',
      revision: 2,
      eventType: 'canceled',
      occurredAt: '2026-04-09T09:59:00.000Z',
      nextTouchAt: null,
      party: { role: 'supplier', supplierName: 'Mekong Looms' },
      lines: [{ entityType: 'sku', entityId: 'sku-1', orderedQuantity: null, receivedQuantity: null, expectedArrivalAt: null }],
      note: null,
    };
    const model = buildOverviewModel({
      catalog: {
        ...taskCatalog,
        skus: [{ ...taskCatalog.skus[0]!, supplierName: 'Mekong Looms' }],
      },
      detailBySkuId: {},
      language: 'en',
      observations: [],
      orderBatches: [],
      recordUpdateContext: recordUpdateContextWithSupplierTickets([ticket]),
      workspaceSummary: taskWorkspaceSummary,
    });

    const ticketTask = model.tasks.find(isOverviewSupplierTicketTask);
    expect(ticketTask).toMatchObject({
      defaultDrawerMode: 'order_canceled',
      displayTicketId: '2026-04-09-#1',
      displayTicketLabel: 'Supplier Ticket ID: 2026-04-09-#1',
      etaLabel: 'Order canceled',
      stateLabel: 'Order canceled',
      ticketId: 'supplier-ticket-canceled',
    });
  });

  it('shows daily sequential supplier ticket ids while preserving internal ids', () => {
    const tickets: SenaTicketSummary[] = [
      {
        ticketId: 'internal-ticket-later',
        ticketFamily: 'supplier',
        lifecycle: 'open',
        stage: 'ordered_waiting',
        revision: 1,
        eventType: 'created',
        occurredAt: '2026-04-09T12:00:00.000Z',
        nextTouchAt: '2026-04-14T05:00:00.000Z',
        party: { role: 'supplier', supplierName: 'Mekong Looms' },
        lines: [{ entityType: 'sku', entityId: 'sku-b', orderedQuantity: 8, receivedQuantity: null, expectedArrivalAt: '2026-04-14T05:00:00.000Z' }],
        note: null,
      },
      {
        ticketId: 'internal-ticket-earlier',
        ticketFamily: 'supplier',
        lifecycle: 'open',
        stage: 'ordered_waiting',
        revision: 1,
        eventType: 'created',
        occurredAt: '2026-04-09T09:00:00.000Z',
        nextTouchAt: '2026-04-14T05:00:00.000Z',
        party: { role: 'supplier', supplierName: 'Mekong Looms' },
        lines: [{ entityType: 'sku', entityId: 'sku-a', orderedQuantity: 5, receivedQuantity: null, expectedArrivalAt: '2026-04-14T05:00:00.000Z' }],
        note: null,
      },
    ];
    const model = buildOverviewModel({
      catalog: {
        ...taskCatalog,
        skus: [
          { ...taskCatalog.skus[0]!, skuId: 'sku-a', name: 'Ticket A', supplierName: 'Mekong Looms' },
          { ...taskCatalog.skus[0]!, skuId: 'sku-b', name: 'Ticket B', supplierName: 'Mekong Looms' },
        ],
      },
      detailBySkuId: {},
      language: 'en',
      observations: [],
      orderBatches: [],
      recordUpdateContext: recordUpdateContextWithSupplierTickets(tickets),
      workspaceSummary: {
        ...taskWorkspaceSummary,
        skuSummaries: [
          { ...taskWorkspaceSummary.skuSummaries[0]!, skuId: 'sku-a' },
          { ...taskWorkspaceSummary.skuSummaries[0]!, skuId: 'sku-b' },
        ],
      },
    });

    const ticketTasks = model.tasks.filter(isOverviewSupplierTicketTask);
    expect(ticketTasks.map((task) => [task.ticketId, task.displayTicketId])).toEqual([
      ['internal-ticket-earlier', '2026-04-09-#1'],
      ['internal-ticket-later', '2026-04-09-#2'],
    ]);
  });

  it('assigns supplier ticket display ids after valid timestamps before dirty dates', () => {
    const tickets: SenaTicketSummary[] = [
      {
        ticketId: 'internal-ticket-dirty',
        ticketFamily: 'supplier',
        lifecycle: 'open',
        stage: 'ordered_waiting',
        revision: 1,
        eventType: 'created',
        occurredAt: 'not-a-date',
        party: { role: 'supplier', supplierName: 'Mekong Looms' },
        lines: [{ entityType: 'sku', entityId: 'sku-b', orderedQuantity: 8, receivedQuantity: null }],
        note: null,
      },
      {
        ticketId: 'internal-ticket-valid',
        ticketFamily: 'supplier',
        lifecycle: 'open',
        stage: 'ordered_waiting',
        revision: 1,
        eventType: 'created',
        occurredAt: '2026-04-09T09:00:00.000Z',
        party: { role: 'supplier', supplierName: 'Mekong Looms' },
        lines: [{ entityType: 'sku', entityId: 'sku-a', orderedQuantity: 5, receivedQuantity: null }],
        note: null,
      },
    ];
    const model = buildOverviewModel({
      catalog: {
        ...taskCatalog,
        skus: [
          { ...taskCatalog.skus[0]!, skuId: 'sku-a', name: 'Ticket A', supplierName: 'Mekong Looms' },
          { ...taskCatalog.skus[0]!, skuId: 'sku-b', name: 'Ticket B', supplierName: 'Mekong Looms' },
        ],
      },
      detailBySkuId: {},
      language: 'en',
      observations: [],
      orderBatches: [],
      recordUpdateContext: recordUpdateContextWithSupplierTickets(tickets),
      workspaceSummary: {
        ...taskWorkspaceSummary,
        skuSummaries: [
          { ...taskWorkspaceSummary.skuSummaries[0]!, skuId: 'sku-a' },
          { ...taskWorkspaceSummary.skuSummaries[0]!, skuId: 'sku-b' },
        ],
      },
    });

    const ticketTasks = model.tasks.filter(isOverviewSupplierTicketTask);
    expect(ticketTasks.map((task) => [task.ticketId, task.displayTicketId])).toEqual([
      ['internal-ticket-valid', '2026-04-09-#1'],
      ['internal-ticket-dirty', 'not-a-date-#1'],
    ]);
  });

  it('assigns supplier ticket display ids by local calendar date', () => {
    const occurredAt = '2026-04-21T17:30:00.000Z';
    const tickets: SenaTicketSummary[] = [{
      ticketId: 'internal-ticket-local-date',
      ticketFamily: 'supplier',
      lifecycle: 'open',
      stage: 'ordered_waiting',
      revision: 1,
      eventType: 'created',
      occurredAt,
      party: { role: 'supplier', supplierName: 'Mekong Looms' },
      lines: [{ entityType: 'sku', entityId: 'sku-a', orderedQuantity: 5, receivedQuantity: null }],
      note: null,
    }];
    const model = buildOverviewModel({
      catalog: {
        ...taskCatalog,
        skus: [{ ...taskCatalog.skus[0]!, skuId: 'sku-a', name: 'Ticket A', supplierName: 'Mekong Looms' }],
      },
      detailBySkuId: {},
      language: 'en',
      observations: [],
      orderBatches: [],
      recordUpdateContext: recordUpdateContextWithSupplierTickets(tickets),
      workspaceSummary: {
        ...taskWorkspaceSummary,
        skuSummaries: [{ ...taskWorkspaceSummary.skuSummaries[0]!, skuId: 'sku-a' }],
      },
    });

    const ticketTasks = model.tasks.filter(isOverviewSupplierTicketTask);
    expect(ticketTasks[0]?.displayTicketId).toBe(`${localDateKey(occurredAt)}-#1`);
  });

  it('shows daily sequential supplier ticket ids for observation-backed tickets', () => {
    const tickets: SenaTicketSummary[] = [
      {
        ticketId: 'observed-ticket-later',
        ticketFamily: 'supplier',
        lifecycle: 'open',
        stage: 'ordered_waiting',
        revision: 1,
        eventType: 'created',
        occurredAt: '2026-04-09T12:00:00.000Z',
        nextTouchAt: '2026-04-14T05:00:00.000Z',
        party: { role: 'supplier', supplierName: 'Mekong Looms' },
        lines: [{ entityType: 'sku', entityId: 'sku-b', orderedQuantity: 8, receivedQuantity: null, expectedArrivalAt: '2026-04-14T05:00:00.000Z' }],
        note: null,
      },
      {
        ticketId: 'observed-ticket-earlier',
        ticketFamily: 'supplier',
        lifecycle: 'open',
        stage: 'ordered_waiting',
        revision: 1,
        eventType: 'created',
        occurredAt: '2026-04-09T09:00:00.000Z',
        nextTouchAt: '2026-04-14T05:00:00.000Z',
        party: { role: 'supplier', supplierName: 'Mekong Looms' },
        lines: [{ entityType: 'sku', entityId: 'sku-a', orderedQuantity: 5, receivedQuantity: null, expectedArrivalAt: '2026-04-14T05:00:00.000Z' }],
        note: null,
      },
    ];
    const observation = makeObservation('2026-04-09T12:00:00.000Z');
    const model = buildOverviewModel({
      catalog: {
        ...taskCatalog,
        skus: [
          { ...taskCatalog.skus[0]!, skuId: 'sku-a', name: 'Ticket A', supplierName: 'Mekong Looms' },
          { ...taskCatalog.skus[0]!, skuId: 'sku-b', name: 'Ticket B', supplierName: 'Mekong Looms' },
        ],
      },
      detailBySkuId: {},
      language: 'en',
      observations: [{
        ...observation,
        input: {
          ...observation.input,
          orderSignals: [
            { skuId: 'sku-a', orderPlaced: true, receiptArrived: false, approximateOrderQuantity: 5, approximateReceiptQuantity: null },
            { skuId: 'sku-b', orderPlaced: true, receiptArrived: false, approximateOrderQuantity: 8, approximateReceiptQuantity: null },
          ],
          ticketEvents: tickets,
        },
      }],
      orderBatches: [],
      recordUpdateContext: null,
      workspaceSummary: {
        ...taskWorkspaceSummary,
        skuSummaries: [
          { ...taskWorkspaceSummary.skuSummaries[0]!, skuId: 'sku-a' },
          { ...taskWorkspaceSummary.skuSummaries[0]!, skuId: 'sku-b' },
        ],
      },
    });

    const ticketTasks = model.tasks.filter(isOverviewSupplierTicketTask);
    expect(ticketTasks.map((task) => [task.ticketId, task.displayTicketId])).toEqual([
      ['observed-ticket-earlier', '2026-04-09-#1'],
      ['observed-ticket-later', '2026-04-09-#2'],
    ]);
  });
});
