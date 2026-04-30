import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type {
  AutomationChannelConnection,
  AutomationConversationSummary,
  AutomationExposureRow,
  AutomationMessageRecord,
  AutomationOrderIntake,
  AutomationOverviewMetrics,
  AutomationWorkspace,
  PromoteAutomationIntakeResult,
} from '@shared/automation';
import type {
  AutomationConnectionPatch,
  AutomationExposurePatch,
  AutomationListIntakesPayload,
  AutomationReadConversationPayload,
  AutomationReadIntakePayload,
  AutomationResolveIntakePayload,
} from '@shared/ipc';
import type { PromoteAutomationIntakePayload } from '@shared/automation';
import { useInventoryActions } from './inventory';

export interface AutomationContextValue {
  connection: AutomationChannelConnection | null;
  conversations: AutomationConversationSummary[];
  exposures: AutomationExposureRow[];
  intakes: AutomationOrderIntake[];
  metrics: AutomationOverviewMetrics | null;
  error: string | null;
  isLoading: boolean;
  isSaving: boolean;
  reload: () => Promise<void>;
  loadWorkspace: () => Promise<AutomationWorkspace>;
  saveConnection: (payload: AutomationConnectionPatch) => Promise<AutomationChannelConnection>;
  patchExposureRow: (payload: AutomationExposurePatch) => Promise<AutomationExposureRow>;
  readConversation: (payload: AutomationReadConversationPayload) => Promise<{
    conversation: AutomationConversationSummary;
    messages: AutomationMessageRecord[];
    intakes: AutomationOrderIntake[];
  }>;
  listIntakes: (payload?: AutomationListIntakesPayload) => Promise<AutomationOrderIntake[]>;
  readIntake: (payload: AutomationReadIntakePayload) => Promise<AutomationOrderIntake | null>;
  resolveIntake: (payload: AutomationResolveIntakePayload) => Promise<AutomationOrderIntake>;
  promoteIntake: (payload: PromoteAutomationIntakePayload) => Promise<PromoteAutomationIntakeResult>;
  testTelegramConnection: () => Promise<AutomationChannelConnection>;
}

const AutomationContext = createContext<AutomationContextValue | null>(null);
const automationUnavailableErrorMessage = 'Automations is unavailable in this environment.';

async function rejectUnavailableAutomation(): Promise<never> {
  throw new Error(automationUnavailableErrorMessage);
}

const optionalAutomationFallback: AutomationContextValue = {
  connection: null,
  conversations: [],
  exposures: [],
  intakes: [],
  metrics: null,
  error: null,
  isLoading: false,
  isSaving: false,
  reload: rejectUnavailableAutomation,
  loadWorkspace: rejectUnavailableAutomation,
  saveConnection: rejectUnavailableAutomation,
  patchExposureRow: rejectUnavailableAutomation,
  readConversation: rejectUnavailableAutomation,
  listIntakes: rejectUnavailableAutomation,
  readIntake: rejectUnavailableAutomation,
  resolveIntake: rejectUnavailableAutomation,
  promoteIntake: rejectUnavailableAutomation,
  testTelegramConnection: rejectUnavailableAutomation,
};

function emptyState() {
  return {
    connection: null as AutomationChannelConnection | null,
    conversations: [] as AutomationConversationSummary[],
    exposures: [] as AutomationExposureRow[],
    intakes: [] as AutomationOrderIntake[],
    metrics: null as AutomationOverviewMetrics | null,
    error: null as string | null,
    isLoading: true,
    isSaving: false,
  };
}

export function AutomationProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(() => emptyState());
  const { loadWorkSupportData } = useInventoryActions();

  const setStatePartial = useCallback((patch: Partial<typeof state>) => {
    setState((current) => ({ ...current, ...patch }));
  }, []);

  const loadWorkspace = useCallback(async () => {
    if (!window.banjiDesktop.automation) {
      const fallback = {
        connection: null,
        conversations: [],
        exposures: [],
        intakes: [],
        metrics: null,
        error: 'Automations is unavailable in this environment.',
        isLoading: false,
        isSaving: false,
      };
      setState(fallback);
      throw new Error(fallback.error);
    }
    const workspace = await window.banjiDesktop.automation.getWorkspace();
    setStatePartial({
      connection: workspace.connection,
      conversations: workspace.conversations,
      exposures: workspace.exposures,
      intakes: workspace.intakes,
      metrics: workspace.metrics,
      error: null,
      isLoading: false,
    });
    return workspace;
  }, [setStatePartial]);

  const reload = useCallback(async () => {
    setStatePartial({ isLoading: true, error: null });
    try {
      await loadWorkspace();
    } catch (error) {
      setStatePartial({
        isLoading: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [loadWorkspace, setStatePartial]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const saveConnection = useCallback(async (payload: AutomationConnectionPatch) => {
    if (!window.banjiDesktop.automation) {
      throw new Error('Automations is unavailable in this environment.');
    }
    setStatePartial({ isSaving: true, error: null });
    try {
      const connection = await window.banjiDesktop.automation.saveConnection(payload);
      await reload();
      return connection;
    } finally {
      setStatePartial({ isSaving: false });
    }
  }, [reload, setStatePartial]);

  const patchExposureRow = useCallback(async (payload: AutomationExposurePatch) => {
    if (!window.banjiDesktop.automation) {
      throw new Error('Automations is unavailable in this environment.');
    }
    setStatePartial({ isSaving: true, error: null });
    try {
      const row = await window.banjiDesktop.automation.patchExposureRow(payload);
      await reload();
      return row;
    } finally {
      setStatePartial({ isSaving: false });
    }
  }, [reload, setStatePartial]);

  const readConversation = useCallback(async (payload: AutomationReadConversationPayload) => {
    if (!window.banjiDesktop.automation) {
      throw new Error('Automations is unavailable in this environment.');
    }
    return window.banjiDesktop.automation.readConversation(payload);
  }, []);

  const listIntakes = useCallback(async (payload?: AutomationListIntakesPayload) => {
    if (!window.banjiDesktop.automation) {
      throw new Error('Automations is unavailable in this environment.');
    }
    return window.banjiDesktop.automation.listIntakes(payload);
  }, []);

  const readIntake = useCallback(async (payload: AutomationReadIntakePayload) => {
    if (!window.banjiDesktop.automation) {
      throw new Error('Automations is unavailable in this environment.');
    }
    return window.banjiDesktop.automation.readIntake(payload);
  }, []);

  const resolveIntake = useCallback(async (payload: AutomationResolveIntakePayload) => {
    if (!window.banjiDesktop.automation) {
      throw new Error('Automations is unavailable in this environment.');
    }
    setStatePartial({ isSaving: true, error: null });
    try {
      const intake = await window.banjiDesktop.automation.resolveIntake(payload);
      await reload();
      return intake;
    } finally {
      setStatePartial({ isSaving: false });
    }
  }, [reload, setStatePartial]);

  const promoteIntake = useCallback(async (payload: PromoteAutomationIntakePayload) => {
    if (!window.banjiDesktop.automation) {
      throw new Error('Automations is unavailable in this environment.');
    }
    setStatePartial({ isSaving: true, error: null });
    try {
      const result = await window.banjiDesktop.automation.promoteIntake(payload);
      await Promise.all([
        reload(),
        loadWorkSupportData({ includeObservations: true }),
      ]);
      return result;
    } finally {
      setStatePartial({ isSaving: false });
    }
  }, [loadWorkSupportData, reload, setStatePartial]);

  const testTelegramConnection = useCallback(async () => {
    if (!window.banjiDesktop.automation) {
      throw new Error('Automations is unavailable in this environment.');
    }
    setStatePartial({ isSaving: true, error: null });
    try {
      const connection = await window.banjiDesktop.automation.testTelegramConnection();
      await reload();
      return connection;
    } finally {
      setStatePartial({ isSaving: false });
    }
  }, [reload, setStatePartial]);

  const value = useMemo<AutomationContextValue>(() => ({
    ...state,
    reload,
    loadWorkspace,
    saveConnection,
    patchExposureRow,
    readConversation,
    listIntakes,
    readIntake,
    resolveIntake,
    promoteIntake,
    testTelegramConnection,
  }), [
    state,
    reload,
    loadWorkspace,
    saveConnection,
    patchExposureRow,
    readConversation,
    listIntakes,
    readIntake,
    resolveIntake,
    promoteIntake,
    testTelegramConnection,
  ]);

  return (
    <AutomationContext.Provider value={value}>
      {children}
    </AutomationContext.Provider>
  );
}

export function useAutomation() {
  const value = useContext(AutomationContext);
  if (!value) {
    throw new Error('useAutomation must be used within an AutomationProvider.');
  }
  return value;
}

export function useOptionalAutomation() {
  return useContext(AutomationContext) ?? optionalAutomationFallback;
}
