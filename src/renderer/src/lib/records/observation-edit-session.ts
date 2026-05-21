import type { SenaObservationRecord } from '@shared/sena';
import {
  captureSessionFlashTargetKey,
  normalizeCaptureSessionFlashTargetKeys,
  RECORD_UPDATE_CUSTOMER_PENDING_PATH,
  RECORD_UPDATE_STOCK_COUNT_PATH,
  RECORD_UPDATE_SUPPLIER_PENDING_PATH,
  RECORD_UPDATE_SUPPLIER_RECEIPT_PATH,
} from '@/lib/navigation/record-update-routes';

export interface RecordUpdateEditSession {
  observationId: string;
  input: SenaObservationRecord['input'];
}

export interface RecordUpdateLocationState {
  editSession?: RecordUpdateEditSession | null;
}

export function createRecordUpdateEditSession(observation: SenaObservationRecord): RecordUpdateEditSession {
  return {
    observationId: observation.observationId,
    input: observation.input,
  };
}

function primaryTicketEventForEditInput(input: SenaObservationRecord['input']) {
  const ticketEvents = input.ticketEvents ?? [];
  return ticketEvents.find((event) => event.ticketFamily === 'supplier')
    ?? ticketEvents.find((event) => event.ticketFamily === 'customer')
    ?? null;
}

export function recordUpdateEditSessionPathForInput(input: SenaObservationRecord['input']) {
  const primaryTicket = primaryTicketEventForEditInput(input);
  const supplierTicket = primaryTicket?.ticketFamily === 'supplier' ? primaryTicket : null;
  if (supplierTicket) {
    const isReceipt =
      supplierTicket.eventType === 'partial_received' ||
      supplierTicket.eventType === 'fully_received' ||
      supplierTicket.stage === 'partial_received' ||
      supplierTicket.stage === 'received' ||
      supplierTicket.lines.some((line) => (line.receivedQuantity ?? 0) > 0);
    return isReceipt ? RECORD_UPDATE_SUPPLIER_RECEIPT_PATH : RECORD_UPDATE_SUPPLIER_PENDING_PATH;
  }
  if (primaryTicket?.ticketFamily === 'customer') {
    return RECORD_UPDATE_CUSTOMER_PENDING_PATH;
  }
  return RECORD_UPDATE_STOCK_COUNT_PATH;
}

export function recordUpdateEditSessionFlashTargetKeysForInput(input: SenaObservationRecord['input']) {
  const ticketEvent = primaryTicketEventForEditInput(input);
  if (!ticketEvent) {
    return [];
  }

  const supplierAction =
    recordUpdateEditSessionPathForInput(input) === RECORD_UPDATE_SUPPLIER_RECEIPT_PATH
      ? 'supplier-receipt'
      : 'supplier-order';

  return normalizeCaptureSessionFlashTargetKeys(
    ticketEvent.lines
      .map((line) => {
        if (ticketEvent.ticketFamily === 'supplier') {
          return line.entityType === 'sku'
            ? captureSessionFlashTargetKey({ action: supplierAction, targetId: line.entityId, targetType: 'sku' })
            : null;
        }
        if (line.entityType === 'sku' || line.entityType === 'service') {
          return captureSessionFlashTargetKey({
            action: 'customer-order',
            targetId: line.entityId,
            targetType: line.entityType,
          });
        }
        return null;
      })
      .filter((key): key is string => key != null),
  );
}

export function recordUpdateEditSessionSearchForInput(input: SenaObservationRecord['input']) {
  const ticketEvent = primaryTicketEventForEditInput(input);
  if (!ticketEvent) {
    return '';
  }

  const params = new URLSearchParams();
  params.set('ticketMode', 'edit');
  params.set('ticketId', ticketEvent.ticketId);
  const flashTargetKeys = recordUpdateEditSessionFlashTargetKeysForInput(input);
  if (flashTargetKeys.length > 0) {
    params.set('flashTargets', flashTargetKeys.join(','));
  }
  return `?${params.toString()}`;
}

export function readRecordUpdateEditSession(state: unknown): RecordUpdateEditSession | null {
  if (!state || typeof state !== 'object' || !('editSession' in state)) {
    return null;
  }
  const editSession = (state as Record<string, unknown>).editSession;
  if (!editSession || typeof editSession !== 'object') {
    return null;
  }
  const observationId = (editSession as Record<string, unknown>).observationId;
  const input = (editSession as Record<string, unknown>).input;
  if (typeof observationId !== 'string' || !input || typeof input !== 'object') {
    return null;
  }
  return {
    observationId,
    input: input as SenaObservationRecord['input'],
  };
}
