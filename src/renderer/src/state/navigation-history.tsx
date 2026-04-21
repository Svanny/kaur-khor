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
const DEFAULT_NESTED_FALLBACK = '/catalog';

export type BanjiNavigationState = {
  banjiNavigationFallback?: string | null;
  banjiNavigationOrigin?: string | null;
  banjiNavigationSource?: string;
};

type NavigationEntry = {
  fallbackTo?: string | null;
  origin?: string | null;
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

function currentLocationTarget(location: Pick<ReturnType<typeof useLocation>, 'hash' | 'pathname' | 'search'>) {
  return `${location.pathname}${location.search}${location.hash}`;
}

function readBanjiNavigationState(state: unknown): BanjiNavigationState {
  if (!state || typeof state !== 'object') {
    return {};
  }

  return {
    banjiNavigationFallback:
      'banjiNavigationFallback' in state && (typeof state.banjiNavigationFallback === 'string' || state.banjiNavigationFallback == null)
        ? state.banjiNavigationFallback
        : undefined,
    banjiNavigationOrigin:
      'banjiNavigationOrigin' in state && (typeof state.banjiNavigationOrigin === 'string' || state.banjiNavigationOrigin == null)
        ? state.banjiNavigationOrigin
        : undefined,
    banjiNavigationSource:
      'banjiNavigationSource' in state && typeof state.banjiNavigationSource === 'string' ? state.banjiNavigationSource : undefined,
  };
}

function nestedFallbackForPath(pathname: string) {
  if (pathname.startsWith('/catalog/skus/') || pathname.startsWith('/catalog/services/')) {
    return DEFAULT_NESTED_FALLBACK;
  }
  return null;
}

export function buildBanjiNavigationState(
  location: Pick<ReturnType<typeof useLocation>, 'hash' | 'pathname' | 'search' | 'state'>,
  fallbackTo?: string | null,
): BanjiNavigationState {
  const currentState = readBanjiNavigationState(location.state);
  return {
    banjiNavigationFallback: currentState.banjiNavigationFallback ?? fallbackTo ?? nestedFallbackForPath(location.pathname),
    banjiNavigationOrigin: currentState.banjiNavigationOrigin ?? currentLocationTarget(location),
  };
}

function isSidebarNavigation(location: ReturnType<typeof useLocation>) {
  return readBanjiNavigationState(location.state).banjiNavigationSource === SIDEBAR_NAVIGATION_SOURCE;
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
        typeof entry.to === 'string' &&
        ('origin' in entry ? typeof entry.origin === 'string' || entry.origin == null : true) &&
        ('fallbackTo' in entry ? typeof entry.fallbackTo === 'string' || entry.fallbackTo == null : true),
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
  const currentState = readBanjiNavigationState(location.state);
  const currentEntry = useMemo<NavigationEntry>(
    () => ({
      fallbackTo: currentState.banjiNavigationFallback ?? nestedFallbackForPath(location.pathname),
      key: location.key,
      origin: currentState.banjiNavigationOrigin ?? null,
      to: currentLocationTarget(location),
    }),
    [currentState.banjiNavigationFallback, currentState.banjiNavigationOrigin, location],
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
    const currentStackEntry = entries[entries.length - 1] ?? null;
    const previousEntry = entries.length > 1 ? entries[entries.length - 2] : null;
    const preferredBackTarget =
      currentStackEntry?.origin && currentStackEntry.origin !== currentStackEntry.to
        ? currentStackEntry.origin
        : previousEntry?.to ?? currentStackEntry?.fallbackTo ?? null;

    return {
      canGoBack: preferredBackTarget != null,
      previousLocation: preferredBackTarget,
      goBack: () => {
        if (!preferredBackTarget) {
          return;
        }

        navigate(preferredBackTarget, { replace: true });
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
