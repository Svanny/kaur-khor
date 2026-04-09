import type { SenaObservationRecord } from '@shared/sena';

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
