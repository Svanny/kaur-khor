import type {
  SenaCommercialEntityType,
  SenaObservationRecord,
  SenaTicketEvent,
  SenaTicketFamily,
  SenaTicketPartyMetadata,
} from '@shared/sena';

export const TICKET_CHANNEL_PRESETS = [
  'Walk-in',
  'Call',
  'Telegram',
  'WhatsApp',
  'Facebook',
  'SMS',
  'Other',
] as const;

export interface CustomerIdentityDraft {
  channel: string;
  customChannel: string;
  customerName: string;
  phone: string;
}

export interface CustomerLinkDirectory {
  names: string[];
  nameToPhone: Map<string, string>;
  phoneToName: Map<string, string>;
}

function collapseSpaces(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

export function normalizeTicketLookupValue(value: string) {
  return collapseSpaces(value).toLowerCase();
}

export function normalizeTicketPhone(value: string) {
  return value.replace(/[^\d+]/g, '').toLowerCase();
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
  const phone = collapseSpaces(draft.phone);
  return {
    role: 'customer',
    channelKey: channel.key,
    channelLabel: channel.label,
    customerName: customerName || null,
    customerNameKey: customerName ? normalizeTicketLookupValue(customerName) : null,
    phone: phone || null,
    phoneKey: phone ? normalizeTicketPhone(phone) : null,
  };
}

export function buildCustomerLinkDirectory(observations: SenaObservationRecord[]): CustomerLinkDirectory {
  const nameByKey = new Map<string, string>();
  const nameToPhone = new Map<string, string>();
  const phoneToName = new Map<string, string>();

  for (const event of observations.flatMap((observation) => observation.input.ticketEvents ?? [])) {
    if (event.ticketFamily !== 'customer' || event.party?.role !== 'customer') {
      continue;
    }
    const name = collapseSpaces(event.party.customerName ?? '');
    const phone = collapseSpaces(event.party.phone ?? '');
    const nameKey = event.party.customerNameKey ?? normalizeTicketLookupValue(name);
    const phoneKey = event.party.phoneKey ?? normalizeTicketPhone(phone);
    if (name && nameKey) {
      nameByKey.set(nameKey, name);
    }
    if (name && phone && nameKey && !nameToPhone.has(nameKey)) {
      nameToPhone.set(nameKey, phone);
    }
    if (name && phone && phoneKey && !phoneToName.has(phoneKey)) {
      phoneToName.set(phoneKey, name);
    }
  }

  return {
    names: [...nameByKey.values()].sort((left, right) => left.localeCompare(right)),
    nameToPhone,
    phoneToName,
  };
}

export function customerLinkWarning(draft: CustomerIdentityDraft, directory: CustomerLinkDirectory) {
  const nameKey = normalizeTicketLookupValue(draft.customerName);
  const phoneKey = normalizeTicketPhone(draft.phone);
  if (!nameKey || !phoneKey) {
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
  return `ticket:${family}:${timestamp}:${eventType}:${lineKey || 'unscoped'}`;
}

export function latestTicketEvents(observations: SenaObservationRecord[]) {
  return observations
    .flatMap((observation) => observation.input.ticketEvents ?? [])
    .sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime());
}

export function ticketLabel(event: SenaTicketEvent) {
  const partyName = event.party?.customerName ?? event.party?.supplierName ?? null;
  const lineSummary = event.lines
    .map((line) => line.entityId)
    .slice(0, 2)
    .join(', ');
  return partyName ?? lineSummary ?? event.ticketId;
}
