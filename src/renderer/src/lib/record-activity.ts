import type {
  SenaDeliveryFeeBucket,
  SenaDeliveryFeeMetadata,
  SenaCatalog,
  SenaObservationRecord,
  SenaRecordActivityEntry,
  SenaRecordUpdateContext,
  SenaTicketFamily,
  SenaTicketLine,
  SenaTicketSummary,
} from '@shared/sena';
import { formatPhoneForDisplay } from '@shared/phone';
import { formatWholeNumber } from '@/lib/format';
import { translateUiLiteral } from '@/lib/translations';
import type { AppLanguage } from '@shared/inventory';
import { buildCustomerLinkDirectoryFromParties, type CustomerLinkDirectory } from './ticketing';

export interface RecordTicketOption {
  description: string;
  id: string;
  label: string;
  metadata: string;
  sortAt: string | null;
}

type TicketDisplayCatalog = Pick<SenaCatalog, 'services' | 'skus'> | null | undefined;

function ticketLineFallbackLabel(line: Pick<SenaTicketLine, 'entityType'>) {
  return line.entityType === 'service' ? 'Service' : 'SKU';
}

export function ticketLineDisplayName(
  line: Pick<SenaTicketLine, 'entityId' | 'entityType'>,
  catalog?: TicketDisplayCatalog,
) {
  if (line.entityType === 'sku') {
    return catalog?.skus.find((sku) => sku.skuId === line.entityId)?.name ?? ticketLineFallbackLabel(line);
  }
  return catalog?.services.find((service) => service.serviceId === line.entityId)?.name ?? ticketLineFallbackLabel(line);
}

function ticketLineDisplayQuantity(line: Pick<SenaTicketLine, 'orderedQuantity' | 'quantityDelta' | 'receivedQuantity'>) {
  return line.orderedQuantity ?? line.receivedQuantity ?? (line.quantityDelta != null ? Math.abs(line.quantityDelta) : null);
}

export function ticketLineMetadataLabel(line: SenaTicketLine, catalog?: TicketDisplayCatalog) {
  const quantity = ticketLineDisplayQuantity(line);
  return `${ticketLineDisplayName(line, catalog)}${quantity ? ` · ${quantity}u` : ''}`;
}

export function ticketSummaryLabel(
  ticket: Pick<SenaTicketSummary, 'lines' | 'party' | 'ticketId'>,
  catalog?: TicketDisplayCatalog,
) {
  const partyName = ticket.party?.customerName ?? ticket.party?.supplierName ?? null;
  const lineSummary = ticket.lines
    .map((line) => ticketLineDisplayName(line, catalog))
    .slice(0, 2)
    .join(', ');
  return partyName ?? (lineSummary || 'Ticket');
}

function ticketDisplayDate(value: string | null | undefined) {
  if (!value) {
    return new Date().toISOString().slice(0, 10);
  }
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return value.slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

function ticketDisplayLabels(
  context: SenaRecordUpdateContext | null,
  family: Extract<SenaTicketFamily, 'customer' | 'supplier'>,
) {
  const labels = new Map<string, string>();
  const ticketsById = new Map<string, SenaTicketSummary>();
  for (const ticket of Object.values(context?.latestTicketsById ?? {}).map((anchor) => anchor.value)) {
    if (ticket.ticketFamily === family) {
      ticketsById.set(ticket.ticketId, ticket);
    }
  }
  for (const ticket of openTicketSummaries(context, family)) {
    ticketsById.set(ticket.ticketId, ticket);
  }

  const tickets = [...ticketsById.values()].sort((left, right) =>
    ticketDisplayDate(left.occurredAt).localeCompare(ticketDisplayDate(right.occurredAt)) ||
    left.occurredAt.localeCompare(right.occurredAt) ||
    left.ticketId.localeCompare(right.ticketId),
  );
  const countByDate = new Map<string, number>();
  for (const ticket of tickets) {
    const date = ticketDisplayDate(ticket.occurredAt);
    const count = (countByDate.get(date) ?? 0) + 1;
    countByDate.set(date, count);
    labels.set(ticket.ticketId, `${date}-#${count}`);
  }

  return labels;
}

export function openTicketSummaries(
  context: SenaRecordUpdateContext | null,
  family: Extract<SenaTicketFamily, 'customer' | 'supplier'>,
) {
  return context?.openTicketsByFamily[family] ?? [];
}

export function recordTicketOptions(
  context: SenaRecordUpdateContext | null,
  family: Extract<SenaTicketFamily, 'customer' | 'supplier'>,
  catalog?: TicketDisplayCatalog,
): RecordTicketOption[] {
  const displayLabels = ticketDisplayLabels(context, family);
  return openTicketSummaries(context, family).map((ticket) => {
    if (family === 'customer') {
      const channel = ticket.party?.channelLabel ?? ticket.party?.channelKey ?? 'No channel';
      const summary = ticketSummaryLabel(ticket, catalog);
      const displayTicketId = displayLabels.get(ticket.ticketId) ?? `${ticketDisplayDate(ticket.occurredAt)}-#1`;
      return {
        id: ticket.ticketId,
        label: `Ticket ID: ${displayTicketId}`,
        description: `${summary} · ${channel} · ${ticket.lines.length} item${ticket.lines.length === 1 ? '' : 's'}`,
        metadata: ticket.party?.phone ? formatPhoneForDisplay(ticket.party.phone) : ticket.note ?? ticket.occurredAt,
        sortAt: ticket.occurredAt,
      };
    }
    return {
      id: ticket.ticketId,
      label: ticketSummaryLabel(ticket, catalog),
      description: ticket.party?.supplierName ?? ticket.stage,
      metadata: ticket.lines.map((line) => ticketLineMetadataLabel(line, catalog)).join(', ') || ticket.note || ticket.occurredAt,
      sortAt: ticket.occurredAt,
    };
  });
}

function ticketOptionSortValue(option: Pick<RecordTicketOption, 'sortAt'>) {
  if (!option.sortAt) {
    return 0;
  }
  const time = new Date(option.sortAt).getTime();
  return Number.isFinite(time) ? time : 0;
}

export function sortRecordTicketOptionsByRecent<TOption extends Pick<RecordTicketOption, 'sortAt'>>(
  options: TOption[],
) {
  return [...options].sort((left, right) => ticketOptionSortValue(right) - ticketOptionSortValue(left));
}

export function buildCustomerLinkDirectoryFromContext(
  context: SenaRecordUpdateContext | null,
  fallbackObservations: SenaObservationRecord[] = [],
): CustomerLinkDirectory {
  const ticketSources = context
    ? Object.values(context.latestTicketsById).map((anchor) => anchor.value)
    : fallbackObservations.flatMap((observation) => observation.input.ticketEvents ?? []);

  return buildCustomerLinkDirectoryFromParties(
    ticketSources
      .filter((ticket) => ticket.ticketFamily === 'customer')
      .map((ticket) => ticket.party),
  );
}

export function latestDeliveryFeeMetadataFromContext(
  context: SenaRecordUpdateContext | null,
  bucket: SenaDeliveryFeeBucket,
  fallbackObservations: SenaObservationRecord[] = [],
): SenaDeliveryFeeMetadata | null {
  const contextMetadata = context?.latestDeliveryFeeByBucket[bucket]?.value;
  if (contextMetadata) {
    return contextMetadata;
  }
  const candidates: Array<{ at: string; metadata: SenaDeliveryFeeMetadata }> = [];
  for (const observation of fallbackObservations) {
    if (observation.input.deliveryFee?.bucket === bucket) {
      candidates.push({ at: observation.input.observedAt, metadata: observation.input.deliveryFee });
    }
    for (const event of observation.input.ticketEvents ?? []) {
      if (event.deliveryFee?.bucket === bucket) {
        candidates.push({ at: event.occurredAt, metadata: event.deliveryFee });
      }
    }
  }
  candidates.sort((left, right) => right.at.localeCompare(left.at));
  return candidates[0]?.metadata ?? null;
}

export function observationRecordActivityEntries(
  observation: SenaObservationRecord,
  language: AppLanguage = 'en',
): SenaRecordActivityEntry[] {
  const observedAt = observation.input.observedAt;
  const rows: SenaRecordActivityEntry[] = [];
  for (const snapshot of observation.input.stockSnapshot) {
    rows.push({
      activityId: `${observation.observationId}:stock:${snapshot.skuId}`,
      activityType: 'stock',
      entityId: snapshot.skuId,
      observationId: observation.observationId,
      observedAt,
      summary: translateUiLiteral(language, 'Stock counted'),
      detail: translateUiLiteral(language, '{count} units', {
        count: formatWholeNumber(snapshot.unitsInStock, language),
      }),
    });
  }
  for (const signal of observation.input.orderSignals) {
    if (signal.orderPlaced) {
      rows.push({
        activityId: `${observation.observationId}:order:${signal.skuId}`,
        activityType: 'order',
        entityId: signal.skuId,
        observationId: observation.observationId,
        observedAt: signal.placementTimestamp ?? observedAt,
        summary: translateUiLiteral(language, 'Order signal captured'),
        detail: signal.approximateOrderQuantity != null
          ? translateUiLiteral(language, '{count} units', {
              count: formatWholeNumber(signal.approximateOrderQuantity, language),
            })
          : null,
      });
    }
    if (signal.receiptArrived) {
      rows.push({
        activityId: `${observation.observationId}:receipt:${signal.skuId}`,
        activityType: 'receipt',
        entityId: signal.skuId,
        observationId: observation.observationId,
        observedAt: signal.receiptTimestamp ?? observedAt,
        summary: translateUiLiteral(language, 'Receipt signal captured'),
        detail: signal.approximateReceiptQuantity != null
          ? translateUiLiteral(language, '{count} units', {
              count: formatWholeNumber(signal.approximateReceiptQuantity, language),
            })
          : null,
      });
    }
  }
  for (const ticket of observation.input.ticketEvents ?? []) {
    rows.push({
      activityId: `${observation.observationId}:ticket:${ticket.ticketId}:${ticket.revision}`,
      activityType: 'ticket',
      entityId: ticket.ticketId,
      eventType: ticket.eventType,
      lifecycle: ticket.lifecycle,
      observationId: observation.observationId,
      observedAt: ticket.occurredAt,
      summary: translateUiLiteral(
        language,
        ticket.ticketFamily === 'customer'
          ? 'Customer ticket updated'
          : ticket.ticketFamily === 'supplier'
            ? 'Supplier ticket updated'
            : 'Adjustment updated',
      ),
      detail: ticket.note ?? `${ticket.lines.length} item${ticket.lines.length === 1 ? '' : 's'}`,
      ticketFamily: ticket.ticketFamily,
      ticketId: ticket.ticketId,
    });
  }
  return rows.sort((left, right) => right.observedAt.localeCompare(left.observedAt) || right.activityId.localeCompare(left.activityId));
}
