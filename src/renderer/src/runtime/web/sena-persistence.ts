import type { DesktopAppContext, DesktopPreferences } from '@shared/ipc';
import type {
  SenaAnalysisRunRecord,
  SenaCatalog,
  SenaDiagnostics,
  SenaObservationRecord,
  SenaOrderBatchRecord,
  SenaServiceDetail,
  SenaSkuDetail,
  SenaWorkspaceSummary,
} from '@shared/sena';
import type { AutomationMessageRecord, AutomationWorkspace } from '@shared/automation';

export type BrowserSenaPersistState = {
  appContext: DesktopAppContext;
  preferences: DesktopPreferences;
  catalog: SenaCatalog;
  diagnostics: SenaDiagnostics;
  latestRun: SenaAnalysisRunRecord;
  observations: SenaObservationRecord[];
  orderBatches: SenaOrderBatchRecord[];
  serviceDetails: Record<string, SenaServiceDetail>;
  skuDetails: Record<string, SenaSkuDetail>;
  workspaceSummary: SenaWorkspaceSummary;
  automation: AutomationWorkspace;
  automationMessages: Record<string, AutomationMessageRecord[]>;
};
