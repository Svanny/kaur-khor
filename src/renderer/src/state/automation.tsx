import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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
  AutomationReadIntakeThreadPayload,
  AutomationSendIntakeThreadMessagePayload,
  AutomationResolveIntakePayload,
} from '@shared/ipc';
import type { PromoteAutomationIntakePayload } from '@shared/automation';
import { useInventoryActions, useInventoryState } from './inventory';

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
  readIntakeThread: (payload: AutomationReadIntakeThreadPayload) => Promise<{
    conversation: AutomationConversationSummary;
    intake: AutomationOrderIntake;
    messages: AutomationMessageRecord[];
  }>;
  sendIntakeThreadMessage: (payload: AutomationSendIntakeThreadMessagePayload) => Promise<{
    conversation: AutomationConversationSummary;
    intake: AutomationOrderIntake;
    messages: AutomationMessageRecord[];
  }>;
  listIntakes: (payload?: AutomationListIntakesPayload) => Promise<AutomationOrderIntake[]>;
  readIntake: (payload: AutomationReadIntakePayload) => Promise<AutomationOrderIntake | null>;
  resolveIntake: (payload: AutomationResolveIntakePayload) => Promise<AutomationOrderIntake>;
  promoteIntake: (payload: PromoteAutomationIntakePayload) => Promise<PromoteAutomationIntakeResult>;
  testTelegramConnection: () => Promise<AutomationChannelConnection>;
}

const AutomationContext = createContext<AutomationContextValue | null>(null);
const automationUnavailableErrorMessage = 'Automations is unavailable in this environment.';
const connectedAutomationRefreshIntervalMs = 2_000;

function shouldRefreshAutomationWorkspace(connection: AutomationChannelConnection | null) {
  return connection?.status === 'connected' || (connection?.status === 'error' && connection.hasBotToken);
}

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
  readIntakeThread: rejectUnavailableAutomation,
  sendIntakeThreadMessage: rejectUnavailableAutomation,
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
  const inventory = useInventoryState();
  const { loadWorkSupportData } = useInventoryActions();
  const initialLoadStartedRef = useRef(false);
  const loadRequestSeqRef = useRef(0);
  const savingRequestCountRef = useRef(0);

  const setStatePartial = useCallback((patch: Partial<typeof state>) => {
    setState((current) => ({ ...current, ...patch }));
  }, []);

  const beginSaving = useCallback(() => {
    savingRequestCountRef.current += 1;
    setStatePartial({ isSaving: true, error: null });
  }, [setStatePartial]);

  const finishSaving = useCallback(() => {
    savingRequestCountRef.current = Math.max(0, savingRequestCountRef.current - 1);
    setStatePartial({ isSaving: savingRequestCountRef.current > 0 });
  }, [setStatePartial]);

  const loadWorkspaceForRequest = useCallback(async (requestId: number) => {
    if (!window.kaurKhorDesktop.automation) {
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
      if (loadRequestSeqRef.current === requestId) {
        setState(fallback);
      }
      throw new Error(fallback.error);
    }
    const workspace = await window.kaurKhorDesktop.automation.getWorkspace();
    if (loadRequestSeqRef.current === requestId) {
      setStatePartial({
        connection: workspace.connection,
        conversations: workspace.conversations,
        exposures: workspace.exposures,
        intakes: workspace.intakes,
        metrics: workspace.metrics,
        error: null,
        isLoading: false,
      });
    }
    return workspace;
  }, [setStatePartial]);

  const loadWorkspace = useCallback(async () => {
    loadRequestSeqRef.current += 1;
    return loadWorkspaceForRequest(loadRequestSeqRef.current);
  }, [loadWorkspaceForRequest]);

  const reload = useCallback(async () => {
    loadRequestSeqRef.current += 1;
    const requestId = loadRequestSeqRef.current;
    setStatePartial({ isLoading: true, error: null });
    try {
      await loadWorkspaceForRequest(requestId);
    } catch (error) {
      if (loadRequestSeqRef.current === requestId) {
        setStatePartial({
          isLoading: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }, [loadWorkspaceForRequest, setStatePartial]);

  useEffect(() => {
    if (initialLoadStartedRef.current || inventory.isLoading || inventory.isPreparingWorkspace) {
      return;
    }
    initialLoadStartedRef.current = true;
    void reload();
  }, [inventory.isLoading, inventory.isPreparingWorkspace, reload]);

  useEffect(() => {
    if (!shouldRefreshAutomationWorkspace(state.connection)) {
      return;
    }

    let stopped = false;
    let refreshInFlight = false;
    const refreshConnectedWorkspace = async () => {
      if (stopped || refreshInFlight || document.visibilityState === 'hidden') {
        return;
      }
      refreshInFlight = true;
      try {
        await loadWorkspace();
      } catch (error) {
        if (!stopped) {
          setStatePartial({
            error: error instanceof Error ? error.message : String(error),
            isLoading: false,
          });
        }
      } finally {
        refreshInFlight = false;
      }
    };

    const intervalId = window.setInterval(() => {
      void refreshConnectedWorkspace();
    }, connectedAutomationRefreshIntervalMs);

    return () => {
      stopped = true;
      window.clearInterval(intervalId);
    };
  }, [loadWorkspace, setStatePartial, state.connection]);

  const saveConnection = useCallback(async (payload: AutomationConnectionPatch) => {
    if (!window.kaurKhorDesktop.automation) {
      throw new Error('Automations is unavailable in this environment.');
    }
    beginSaving();
    try {
      const connection = await window.kaurKhorDesktop.automation.saveConnection(payload);
      await reload();
      return connection;
    } finally {
      finishSaving();
    }
  }, [beginSaving, finishSaving, reload]);

  const patchExposureRow = useCallback(async (payload: AutomationExposurePatch) => {
    if (!window.kaurKhorDesktop.automation) {
      throw new Error('Automations is unavailable in this environment.');
    }
    beginSaving();
    try {
      const row = await window.kaurKhorDesktop.automation.patchExposureRow(payload);
      await reload();
      return row;
    } finally {
      finishSaving();
    }
  }, [beginSaving, finishSaving, reload]);

  const readConversation = useCallback(async (payload: AutomationReadConversationPayload) => {
    if (!window.kaurKhorDesktop.automation) {
      throw new Error('Automations is unavailable in this environment.');
    }
    return window.kaurKhorDesktop.automation.readConversation(payload);
  }, []);

  const readIntakeThread = useCallback(async (payload: AutomationReadIntakeThreadPayload) => {
    if (!window.kaurKhorDesktop.automation) {
      throw new Error('Automations is unavailable in this environment.');
    }
    return window.kaurKhorDesktop.automation.readIntakeThread(payload);
  }, []);

  const sendIntakeThreadMessage = useCallback(async (payload: AutomationSendIntakeThreadMessagePayload) => {
    if (!window.kaurKhorDesktop.automation) {
      throw new Error('Automations is unavailable in this environment.');
    }
    beginSaving();
    try {
      return await window.kaurKhorDesktop.automation.sendIntakeThreadMessage(payload);
    } finally {
      finishSaving();
    }
  }, [beginSaving, finishSaving]);

  const listIntakes = useCallback(async (payload?: AutomationListIntakesPayload) => {
    if (!window.kaurKhorDesktop.automation) {
      throw new Error('Automations is unavailable in this environment.');
    }
    return window.kaurKhorDesktop.automation.listIntakes(payload);
  }, []);

  const readIntake = useCallback(async (payload: AutomationReadIntakePayload) => {
    if (!window.kaurKhorDesktop.automation) {
      throw new Error('Automations is unavailable in this environment.');
    }
    return window.kaurKhorDesktop.automation.readIntake(payload);
  }, []);

  const resolveIntake = useCallback(async (payload: AutomationResolveIntakePayload) => {
    if (!window.kaurKhorDesktop.automation) {
      throw new Error('Automations is unavailable in this environment.');
    }
    beginSaving();
    try {
      const intake = await window.kaurKhorDesktop.automation.resolveIntake(payload);
      await reload();
      return intake;
    } finally {
      finishSaving();
    }
  }, [beginSaving, finishSaving, reload]);

  const promoteIntake = useCallback(async (payload: PromoteAutomationIntakePayload) => {
    if (!window.kaurKhorDesktop.automation) {
      throw new Error('Automations is unavailable in this environment.');
    }
    beginSaving();
    try {
      const result = await window.kaurKhorDesktop.automation.promoteIntake(payload);
      await Promise.all([
        reload(),
        loadWorkSupportData({ includeObservations: true }),
      ]);
      return result;
    } finally {
      finishSaving();
    }
  }, [beginSaving, finishSaving, loadWorkSupportData, reload]);

  const testTelegramConnection = useCallback(async () => {
    if (!window.kaurKhorDesktop.automation) {
      throw new Error('Automations is unavailable in this environment.');
    }
    beginSaving();
    try {
      const connection = await window.kaurKhorDesktop.automation.testTelegramConnection();
      await reload();
      return connection;
    } finally {
      finishSaving();
    }
  }, [beginSaving, finishSaving, reload]);

  const value = useMemo<AutomationContextValue>(() => ({
    ...state,
    reload,
    loadWorkspace,
    saveConnection,
    patchExposureRow,
    readConversation,
    readIntakeThread,
    sendIntakeThreadMessage,
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
    readIntakeThread,
    sendIntakeThreadMessage,
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
