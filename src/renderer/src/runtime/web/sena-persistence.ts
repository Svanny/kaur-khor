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
  catalog: SenaCatalog | null;
  diagnostics: SenaDiagnostics | null;
  latestRun: SenaAnalysisRunRecord | null;
  observations: SenaObservationRecord[];
  orderBatches: SenaOrderBatchRecord[];
  serviceDetails: Record<string, SenaServiceDetail>;
  skuDetails: Record<string, SenaSkuDetail>;
  workspaceSummary: SenaWorkspaceSummary | null;
  automation: AutomationWorkspace;
  automationMessages: Record<string, AutomationMessageRecord[]>;
};
