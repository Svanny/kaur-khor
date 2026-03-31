import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom';

export const SIDEBAR_NAVIGATION_SOURCE = 'sidebar';

type NavigationEntry = {
  key: string;
  to: string;
};

type NavigationHistoryContextValue = {
  canGoBack: boolean;
  goBack: () => void;
  previousLocation: string | null;
};

const STORAGE_KEY = 'banji.navigation-history';

const NavigationHistoryContext = createContext<NavigationHistoryContextValue | null>(null);

function currentLocationTarget(location: ReturnType<typeof useLocation>) {
  return `${location.pathname}${location.search}${location.hash}`;
}

function isSidebarNavigation(location: ReturnType<typeof useLocation>) {
  const state = location.state;
  if (!state || typeof state !== 'object') {
    return false;
  }

  return 'banjiNavigationSource' in state && state.banjiNavigationSource === SIDEBAR_NAVIGATION_SOURCE;
}

function readEntries(): NavigationEntry[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const rawValue = window.sessionStorage.getItem(STORAGE_KEY);
    if (!rawValue) {
      return [];
    }

    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (entry): entry is NavigationEntry =>
        Boolean(entry) &&
        typeof entry === 'object' &&
        typeof entry.key === 'string' &&
        typeof entry.to === 'string',
    );
  } catch {
    return [];
  }
}

function writeEntries(entries: NavigationEntry[]) {
  if (typeof window === 'undefined') {
    return;
  }

  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(entries.slice(-50)));
}

function nextEntriesForLocation({
  currentEntry,
  currentEntries,
  navigationType,
  resetHistory,
}: {
  currentEntry: NavigationEntry;
  currentEntries: NavigationEntry[];
  navigationType: ReturnType<typeof useNavigationType>;
  resetHistory: boolean;
}) {
  if (resetHistory) {
    return [currentEntry];
  }

  if (currentEntries.length === 0) {
    return [currentEntry];
  }

  if (navigationType === 'PUSH') {
    if (currentEntries[currentEntries.length - 1]?.to === currentEntry.to) {
      return currentEntries;
    }

    return [...currentEntries, currentEntry];
  }

  if (navigationType === 'REPLACE') {
    if (currentEntries.length > 1 && currentEntries[currentEntries.length - 2]?.to === currentEntry.to) {
      return currentEntries.slice(0, -1);
    }

    const nextEntries = [...currentEntries];
    nextEntries[nextEntries.length - 1] = currentEntry;
    return nextEntries;
  }

  const existingIndex = currentEntries.findIndex((entry) => entry.key === currentEntry.key);
  if (existingIndex >= 0) {
    return currentEntries.slice(0, existingIndex + 1);
  }

  if (currentEntries[currentEntries.length - 1]?.to === currentEntry.to) {
    return currentEntries;
  }

  return [...currentEntries, currentEntry];
}

export function NavigationHistoryProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigationType = useNavigationType();
  const navigate = useNavigate();
  const [entries, setEntries] = useState<NavigationEntry[]>(() => readEntries());
  const resetHistory = isSidebarNavigation(location);
  const currentEntry = useMemo<NavigationEntry>(
    () => ({ key: location.key, to: currentLocationTarget(location) }),
    [location],
  );

  useEffect(() => {
    setEntries((currentEntries) =>
      nextEntriesForLocation({
        currentEntry,
        currentEntries,
        navigationType,
        resetHistory,
      }),
    );
  }, [currentEntry, navigationType, resetHistory]);

  useEffect(() => {
    writeEntries(entries);
  }, [entries]);

  const value = useMemo<NavigationHistoryContextValue>(() => {
    const previousEntry = entries.length > 1 ? entries[entries.length - 2] : null;

    return {
      canGoBack: previousEntry != null,
      previousLocation: previousEntry?.to ?? null,
      goBack: () => {
        if (!previousEntry) {
          return;
        }

        navigate(previousEntry.to, { replace: true });
      },
    };
  }, [entries, navigate]);

  return (
    <NavigationHistoryContext.Provider value={value}>
      {children}
    </NavigationHistoryContext.Provider>
  );
}

export function useNavigationHistory() {
  const context = useContext(NavigationHistoryContext);
  if (!context) {
    return {
      canGoBack: false,
      goBack: () => {},
      previousLocation: null,
    };
  }

  return context;
}
