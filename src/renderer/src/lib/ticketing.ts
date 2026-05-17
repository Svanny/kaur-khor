import type {
  SenaDeliveryFeeBucket,
  SenaDeliveryFeeMetadata,
  SenaDeliveryFeePayer,
  SenaDiscountMetadata,
  SenaDiscountMode,
  SenaCommercialEntityType,
  SenaObservationRecord,
  SenaTicketEvent,
  SenaTicketFamily,
  SenaTicketPartyMetadata,
} from '@shared/sena';
import {
  formatPhoneForDisplay,
  normalizePhoneLookupKey,
  normalizePhoneNumber,
} from '@shared/phone';

export const TICKET_CHANNEL_PRESETS = [
  'Walk-in',
  'Call',
  'Telegram',
  'WhatsApp',
  'Facebook',
  'Instagram',
  'SMS',
  'Other',
] as const;

export interface CustomerIdentityDraft {
  channel: string;
  customChannel: string;
  customerName: string;
  phone: string;
  location: string;
}

export interface CustomerLinkDirectoryEntry {
  name: string;
  phone: string;
}

export interface CustomerLinkDirectory {
  entries: CustomerLinkDirectoryEntry[];
  names: string[];
  nameToPhone: Map<string, string>;
  phoneToName: Map<string, string>;
}

export interface DeliveryFeeSummary {
  subtotalUsd: number | null;
  displayDeliveryUsd: number | null;
  displayTotalUsd: number | null;
  netSettlementUsd: number | null;
}

export interface DiscountSummary {
  subtotalUsd: number | null;
  displayDiscountUsd: number | null;
  discountedSubtotalUsd: number | null;
}

function collapseSpaces(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

export function normalizeTicketLookupValue(value: string) {
  return collapseSpaces(value).toLowerCase();
}

export function normalizeTicketPhone(value: string) {
  return normalizePhoneLookupKey(value);
}

export function normalizeTicketChannel(value: string) {
  return normalizeTicketLookupValue(value);
}

export function resolveTicketChannel(draft: CustomerIdentityDraft) {
  const rawValue = draft.channel === 'custom' ? draft.customChannel : draft.channel;
  const label = collapseSpaces(rawValue);
  const key = normalizeTicketChannel(label);
  return key ? { key, label } : { key: null, label: null };
}

export function buildTicketPartyMetadata(draft: CustomerIdentityDraft): SenaTicketPartyMetadata {
  const channel = resolveTicketChannel(draft);
  const customerName = collapseSpaces(draft.customerName);
  const phone = normalizePhoneNumber(draft.phone);
  const location = collapseSpaces(draft.location);
  return {
    role: 'customer',
    channelKey: channel.key,
    channelLabel: channel.label,
    customerName: customerName || null,
    customerNameKey: customerName ? normalizeTicketLookupValue(customerName) : null,
    phone: phone || null,
    phoneKey: phone ? normalizeTicketPhone(phone) : null,
    location: location || null,
  };
}

export function buildCustomerLinkDirectoryFromParties(parties: Array<SenaTicketPartyMetadata | null | undefined>): CustomerLinkDirectory {
  const entriesByKey = new Map<string, CustomerLinkDirectoryEntry>();
  const nameByKey = new Map<string, string>();
  const nameToPhone = new Map<string, string>();
  const phoneToName = new Map<string, string>();

  for (const party of parties) {
    if (party?.role !== 'customer') {
      continue;
    }
    const name = collapseSpaces(party.customerName ?? '');
    const phone = formatPhoneForDisplay(party.phone ?? '');
    const nameKey = party.customerNameKey ?? normalizeTicketLookupValue(name);
    const phoneKey = normalizePhoneLookupKey(party.phone ?? party.phoneKey ?? '');
    if (name && nameKey) {
      nameByKey.set(nameKey, name);
      entriesByKey.set(`${nameKey}:${phoneKey}`, { name, phone });
    }
    if (name && phone && nameKey && !nameToPhone.has(nameKey)) {
      nameToPhone.set(nameKey, phone);
    }
    if (name && phone && phoneKey && !phoneToName.has(phoneKey)) {
      phoneToName.set(phoneKey, name);
    }
  }

  return {
    entries: [...entriesByKey.values()].sort((left, right) =>
      left.name.localeCompare(right.name) || left.phone.localeCompare(right.phone),
    ),
    names: [...nameByKey.values()].sort((left, right) => left.localeCompare(right)),
    nameToPhone,
    phoneToName,
  };
}

export function buildCustomerLinkDirectory(observations: SenaObservationRecord[]): CustomerLinkDirectory {
  return buildCustomerLinkDirectoryFromParties(
    observations
      .flatMap((observation) => observation.input.ticketEvents ?? [])
      .filter((event) => event.ticketFamily === 'customer')
      .map((event) => event.party),
  );
}

export function customerLinkWarning(draft: CustomerIdentityDraft, directory: CustomerLinkDirectory) {
  const nameKey = normalizeTicketLookupValue(draft.customerName);
  const phoneKey = normalizeTicketPhone(draft.phone);
  if (!nameKey || !phoneKey) {
    return null;
  }
  if (directory.entries.some((entry) => normalizeTicketLookupValue(entry.name) === nameKey && normalizeTicketPhone(entry.phone) === phoneKey)) {
    return null;
  }
  const linkedPhone = directory.nameToPhone.get(nameKey);
  if (linkedPhone && normalizeTicketPhone(linkedPhone) !== phoneKey) {
    return 'This customer name was previously linked to a different phone. Save if this is intentional.';
  }
  const linkedName = directory.phoneToName.get(phoneKey);
  if (linkedName && normalizeTicketLookupValue(linkedName) !== nameKey) {
    return 'This phone was previously linked to a different customer. Save if this is intentional.';
  }
  return null;
}

export function makeTicketId({
  eventType,
  family,
  lines,
  observedAt,
}: {
  eventType: string;
  family: SenaTicketFamily;
  lines: Array<{ entityType: SenaCommercialEntityType; entityId: string }>;
  observedAt: string;
}) {
  const timestamp = Number.isNaN(new Date(observedAt).getTime())
    ? Date.now()
    : new Date(observedAt).getTime();
  const lineKey = lines
    .map((line) => `${line.entityType}-${line.entityId}`)
    .sort()
    .join('-')
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .slice(0, 80);
  return `ticket:${family}:${timestamp}:${eventType}:${lineKey || 'unscoped'}`.slice(0, 80);
}

function sanitizeTicketIdSegment(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-').slice(0, 80);
}

export function makeTicketNonce() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    const values = new Uint32Array(2);
    globalThis.crypto.getRandomValues(values);
    return [...values].map((value) => value.toString(36)).join('-');
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

export function makeNewTicketId({
  nonce = makeTicketNonce(),
  ...ticket
}: Parameters<typeof makeTicketId>[0] & { nonce?: string }) {
  const nonceKey = sanitizeTicketIdSegment(nonce) || sanitizeTicketIdSegment(makeTicketNonce()) || 'new';
  const suffix = `:${nonceKey.slice(0, 24)}`;
  return `${makeTicketId(ticket).slice(0, Math.max(1, 80 - suffix.length))}${suffix}`;
}

export function latestTicketEvents(observations: SenaObservationRecord[]) {
  return observations
    .flatMap((observation) => observation.input.ticketEvents ?? [])
    .sort((left, right) => ticketEventSortValue(right.occurredAt) - ticketEventSortValue(left.occurredAt));
}

function ticketEventSortValue(value: string) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

export function deliveryFeeBucketForWorkflow({
  customerCompletedMode,
  isCustomerCompletedLane,
  isCustomerPendingLane,
  isSupplierPendingLane,
  isSupplierReceiptLane,
}: {
  customerCompletedMode: 'from_pending' | 'immediate_sale' | 'refund_reversal';
  isCustomerCompletedLane: boolean;
  isCustomerPendingLane: boolean;
  isSupplierPendingLane: boolean;
  isSupplierReceiptLane: boolean;
}): SenaDeliveryFeeBucket | null {
  if (isSupplierPendingLane || isSupplierReceiptLane) {
    return 'supplier';
  }
  if (isCustomerPendingLane) {
    return 'customer_order';
  }
  if (!isCustomerCompletedLane || customerCompletedMode === 'refund_reversal') {
    return null;
  }
  return customerCompletedMode === 'immediate_sale' ? 'immediate_sale' : 'customer_order';
}

export function summarizeDeliveryFee({
  bucket,
  feeUsd,
  payer,
  subtotalUsd,
}: {
  bucket: SenaDeliveryFeeBucket;
  feeUsd: number | null;
  payer: SenaDeliveryFeePayer;
  subtotalUsd: number | null;
}): DeliveryFeeSummary {
  if (subtotalUsd == null) {
    return {
      subtotalUsd: null,
      displayDeliveryUsd: null,
      displayTotalUsd: null,
      netSettlementUsd: null,
    };
  }
  const safeFee = feeUsd != null && Number.isFinite(feeUsd) && feeUsd > 0 ? feeUsd : 0;
  if (bucket === 'supplier') {
    return {
      subtotalUsd,
      displayDeliveryUsd: safeFee,
      displayTotalUsd: subtotalUsd + safeFee,
      netSettlementUsd: subtotalUsd + safeFee,
    };
  }
  if (payer === 'customer') {
    return {
      subtotalUsd,
      displayDeliveryUsd: safeFee,
      displayTotalUsd: subtotalUsd + safeFee,
      netSettlementUsd: subtotalUsd + safeFee,
    };
  }
  return {
    subtotalUsd,
    displayDeliveryUsd: 0,
    displayTotalUsd: subtotalUsd,
    netSettlementUsd: subtotalUsd - safeFee,
  };
}

export function buildDeliveryFeeMetadata({
  bucket,
  feeUsd,
  payer,
  subtotalUsd,
}: {
  bucket: SenaDeliveryFeeBucket;
  feeUsd: number | null;
  payer: SenaDeliveryFeePayer;
  subtotalUsd: number | null;
}): SenaDeliveryFeeMetadata {
  return {
    feeUsd,
    payer,
    bucket,
    ...summarizeDeliveryFee({ bucket, feeUsd, payer, subtotalUsd }),
  };
}

export function summarizeDiscount({
  amountUsd,
  mode,
  percent,
  subtotalUsd,
}: {
  amountUsd: number | null;
  mode: SenaDiscountMode;
  percent: number | null;
  subtotalUsd: number | null;
}): DiscountSummary {
  if (subtotalUsd == null) {
    return {
      subtotalUsd: null,
      displayDiscountUsd: null,
      discountedSubtotalUsd: null,
    };
  }
  const safeSubtotal = Number.isFinite(subtotalUsd) && subtotalUsd > 0 ? subtotalUsd : 0;
  const rawDiscount =
    mode === 'percent'
      ? safeSubtotal * Math.min(100, Math.max(0, percent != null && Number.isFinite(percent) ? percent : 0)) / 100
      : (amountUsd != null && Number.isFinite(amountUsd) && amountUsd > 0 ? amountUsd : 0);
  const displayDiscountUsd = Math.min(safeSubtotal, rawDiscount);
  return {
    subtotalUsd: safeSubtotal,
    displayDiscountUsd,
    discountedSubtotalUsd: Math.max(0, safeSubtotal - displayDiscountUsd),
  };
}

export function buildDiscountMetadata({
  amountUsd,
  mode,
  percent,
  subtotalUsd,
}: {
  amountUsd: number | null;
  mode: SenaDiscountMode;
  percent: number | null;
  subtotalUsd: number | null;
}): SenaDiscountMetadata {
  return {
    mode,
    amountUsd: mode === 'amount' ? amountUsd : null,
    percent: mode === 'percent' ? percent : null,
    ...summarizeDiscount({ amountUsd, mode, percent, subtotalUsd }),
  };
}

export function latestDeliveryFeeMetadata(
  observations: SenaObservationRecord[],
  bucket: SenaDeliveryFeeBucket,
): SenaDeliveryFeeMetadata | null {
  const candidates: Array<{ at: string; metadata: SenaDeliveryFeeMetadata }> = [];
  for (const observation of observations) {
    if (observation.input.deliveryFee?.bucket === bucket) {
      candidates.push({
        at: observation.input.observedAt,
        metadata: observation.input.deliveryFee,
      });
    }
    for (const event of observation.input.ticketEvents ?? []) {
      if (event.deliveryFee?.bucket === bucket) {
        candidates.push({
          at: event.occurredAt,
          metadata: event.deliveryFee,
        });
      }
    }
  }
  candidates.sort((left, right) => ticketEventSortValue(right.at) - ticketEventSortValue(left.at));
  return candidates[0]?.metadata ?? null;
}

export function ticketLabel(event: SenaTicketEvent) {
  const partyName = event.party?.customerName ?? event.party?.supplierName ?? null;
  const lineSummary = event.lines
    .map((line) => line.entityId)
    .slice(0, 2)
    .join(', ');
  return (partyName ?? lineSummary) || event.ticketId;
}
