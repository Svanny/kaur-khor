import type {
  SenaAnalysisRunRecord,
  SenaObservationFingerprint,
  SenaObservationRecord,
  SenaWorkspaceSummary,
} from '@shared/sena';

export type ObservationCountSource = {
  latestRun?: Pick<SenaAnalysisRunRecord, 'observationCount'> | null;
  observationFingerprint?: Pick<SenaObservationFingerprint, 'count'> | null;
  observations?: SenaObservationRecord[] | null;
  workspaceSummary?: Pick<SenaWorkspaceSummary, 'intervalCount'> | null;
};

export function deriveAvailableObservationCount(source: ObservationCountSource) {
  return Math.max(
    source.observations?.length ?? 0,
    source.observationFingerprint?.count ?? 0,
    source.latestRun?.observationCount ?? 0,
    source.workspaceSummary?.intervalCount ?? 0,
  );
}

export function deriveSavedObservationCount(source: ObservationCountSource) {
  return Math.max(
    source.observations?.length ?? 0,
    source.observationFingerprint?.count ?? 0,
    source.latestRun?.observationCount ?? 0,
  );
}
