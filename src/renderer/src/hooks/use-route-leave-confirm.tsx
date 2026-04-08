import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ConfirmActionDialog } from '@/components/system/confirm-action-dialog';

const DEFAULT_DISCARD_TITLE = 'Discard changes?';
const DEFAULT_DISCARD_CONFIRM_LABEL = 'Discard changes';
const DEFAULT_DISCARD_CANCEL_LABEL = 'Keep editing';

export function useDiscardChangesConfirm({
  enabled,
  title = DEFAULT_DISCARD_TITLE,
  description,
  confirmLabel = DEFAULT_DISCARD_CONFIRM_LABEL,
  cancelLabel = DEFAULT_DISCARD_CANCEL_LABEL,
  onDiscard,
}: {
  enabled: boolean;
  title?: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  onDiscard?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const pendingActionRef = useRef<(() => void) | null>(null);

  const cancelDiscard = useCallback(() => {
    pendingActionRef.current = null;
    setOpen(false);
  }, []);

  const confirmDiscard = useCallback(() => {
    const pendingAction = pendingActionRef.current;
    pendingActionRef.current = null;
    onDiscard?.();
    setOpen(false);
    pendingAction?.();
  }, [onDiscard]);

  const requestDiscard = useCallback(
    (nextAction?: () => void) => {
      if (!enabled) {
        nextAction?.();
        return true;
      }

      pendingActionRef.current = nextAction ?? null;
      setOpen(true);
      return false;
    },
    [enabled],
  );

  return {
    cancelDiscard,
    confirmDiscard,
    requestDiscard,
    discardConfirmDialog: (
      <ConfirmActionDialog
        cancelLabel={cancelLabel}
        confirmLabel={confirmLabel}
        description={description}
        open={open}
        title={title}
        onCancel={cancelDiscard}
        onConfirm={confirmDiscard}
      />
    ),
    isDiscardConfirmOpen: open,
  };
}

export function useRouteLeaveConfirm({
  enabled,
  description,
  message,
  onDiscard,
}: {
  enabled: boolean;
  description?: ReactNode;
  message?: string;
  onDiscard?: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPathRef = useRef(`${location.pathname}${location.search}${location.hash}`);
  const enabledRef = useRef(enabled);
  const { discardConfirmDialog, requestDiscard } = useDiscardChangesConfirm({
    enabled,
    description: description ?? message,
    onDiscard,
  });
  const requestDiscardRef = useRef(requestDiscard);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    requestDiscardRef.current = requestDiscard;
  }, [requestDiscard]);

  useEffect(() => {
    currentPathRef.current = `${location.pathname}${location.search}${location.hash}`;
  }, [location]);

  useEffect(() => {
    function resolveTargetPath(anchor: HTMLAnchorElement) {
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) {
        return null;
      }
      if (url.hash.startsWith('#/')) {
        return url.hash.slice(1);
      }
      return `${url.pathname}${url.search}${url.hash}`;
    }

    function currentBrowserPath() {
      if (window.location.hash.startsWith('#/')) {
        return window.location.hash.slice(1);
      }
      return `${window.location.pathname}${window.location.search}${window.location.hash}`;
    }

    function handleDocumentClick(event: MouseEvent) {
      if (event.defaultPrevented || event.button !== 0) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }

      const anchor = target.closest('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) {
        return;
      }

      const nextPath = resolveTargetPath(anchor);
      if (!nextPath || nextPath === currentPathRef.current) {
        return;
      }
      if (!enabledRef.current) {
        return;
      }

      event.preventDefault();
      requestDiscardRef.current(() => navigate(nextPath));
    }

    function handleHistoryNavigation() {
      if (!enabledRef.current) {
        return;
      }

      const previousPath = currentPathRef.current;
      const nextPath = currentBrowserPath();
      if (nextPath === previousPath) {
        return;
      }

      navigate(previousPath, { replace: true });
      requestDiscardRef.current(() => navigate(nextPath));
    }

    document.addEventListener('click', handleDocumentClick, true);
    window.addEventListener('popstate', handleHistoryNavigation);
    window.addEventListener('hashchange', handleHistoryNavigation);

    return () => {
      document.removeEventListener('click', handleDocumentClick, true);
      window.removeEventListener('popstate', handleHistoryNavigation);
      window.removeEventListener('hashchange', handleHistoryNavigation);
    };
  }, [navigate]);

  return {
    confirmLeave: requestDiscard,
    discardConfirmDialog,
  };
}
