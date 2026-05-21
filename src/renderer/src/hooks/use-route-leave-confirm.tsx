import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ActionSaveIcon } from '@icons/actions';
import { ConfirmActionDialog } from '@/components/system/confirm-action-dialog';
import { translateUiLiteral } from '@/lib/localization/translations';
import { usePreferences } from '@/state/preferences';

const DEFAULT_DISCARD_TITLE = 'Discard changes?';
const DEFAULT_DISCARD_CONFIRM_LABEL = 'Discard changes';
const DEFAULT_DISCARD_CANCEL_LABEL = 'Keep editing';
const DEFAULT_DISCARD_SAVE_LABEL = 'Save changes';

type ContinueAfterSave = () => void;
type SaveBeforeContinueHandler = (continueAfterSave: ContinueAfterSave) => void | boolean | Promise<void | boolean>;

export function resolveInternalNavigationPath(anchor: HTMLAnchorElement) {
  if (anchor.hasAttribute('download')) {
    return null;
  }

  const rawHref = anchor.getAttribute('href')?.trim() ?? '';
  if (rawHref.startsWith('#') && !rawHref.startsWith('#/')) {
    return null;
  }

  const target = anchor.getAttribute('target')?.trim().toLowerCase();
  if (target && target !== '_self') {
    return null;
  }

  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) {
    return null;
  }
  if (url.hash.startsWith('#/')) {
    return url.hash.slice(1);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function currentInternalNavigationPath() {
  if (window.location.hash.startsWith('#/')) {
    return window.location.hash.slice(1);
  }
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function navigationAnchorFromClick(event: MouseEvent) {
  const target = event.target;
  if (target instanceof Element) {
    const anchor = target.closest('a[href]');
    if (anchor instanceof HTMLAnchorElement) {
      return anchor;
    }
  }

  for (const targetElement of event.composedPath()) {
    if (targetElement instanceof HTMLAnchorElement) {
      return targetElement;
    }
  }

  return null;
}

export function useDiscardChangesConfirm({
  enabled,
  title = DEFAULT_DISCARD_TITLE,
  description,
  confirmLabel = DEFAULT_DISCARD_CONFIRM_LABEL,
  cancelLabel = DEFAULT_DISCARD_CANCEL_LABEL,
  saveLabel = DEFAULT_DISCARD_SAVE_LABEL,
  isSaveDisabled = false,
  onDiscard,
  onSave,
}: {
  enabled: boolean;
  title?: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  saveLabel?: string;
  isSaveDisabled?: boolean;
  onDiscard?: () => void;
  onSave?: SaveBeforeContinueHandler;
}) {
  const { language } = usePreferences();
  const resolvedTitle = title === DEFAULT_DISCARD_TITLE ? translateUiLiteral(language, DEFAULT_DISCARD_TITLE) : title;
  const resolvedConfirmLabel = confirmLabel === DEFAULT_DISCARD_CONFIRM_LABEL
    ? translateUiLiteral(language, DEFAULT_DISCARD_CONFIRM_LABEL)
    : confirmLabel;
  const resolvedCancelLabel = cancelLabel === DEFAULT_DISCARD_CANCEL_LABEL
    ? translateUiLiteral(language, DEFAULT_DISCARD_CANCEL_LABEL)
    : cancelLabel;
  const resolvedSaveLabel = saveLabel === DEFAULT_DISCARD_SAVE_LABEL
    ? translateUiLiteral(language, DEFAULT_DISCARD_SAVE_LABEL)
    : saveLabel;
  const [open, setOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const pendingActionRef = useRef<(() => void) | null>(null);

  const cancelDiscard = useCallback(() => {
    if (isSaving) {
      return;
    }
    pendingActionRef.current = null;
    setOpen(false);
  }, [isSaving]);

  const confirmDiscard = useCallback(() => {
    if (isSaving) {
      return;
    }
    const pendingAction = pendingActionRef.current;
    pendingActionRef.current = null;
    onDiscard?.();
    setOpen(false);
    pendingAction?.();
  }, [isSaving, onDiscard]);

  const saveAndContinue = useCallback(async () => {
    if (!onSave || isSaving) {
      return;
    }

    setIsSaving(true);
    try {
      let didContinue = false;
      const pendingAction = pendingActionRef.current;
      const continueAfterSave = () => {
        if (didContinue) {
          return;
        }
        didContinue = true;
        pendingActionRef.current = null;
        setOpen(false);
        pendingAction?.();
      };
      const result = await onSave(continueAfterSave);
      if (result === false) {
        return;
      }
      continueAfterSave();
    } catch (error) {
      console.error('Failed to save changes before continuing.', error);
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, onSave]);

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
        cancelLabel={resolvedCancelLabel}
        confirmIcon={onSave ? <ActionSaveIcon data-icon="inline-start" /> : undefined}
        confirmLabel={onSave ? resolvedSaveLabel : resolvedConfirmLabel}
        confirmVariant={onSave ? 'default' : 'destructive'}
        destructiveActionLabel={onSave ? resolvedConfirmLabel : undefined}
        description={description}
        isConfirmDisabled={onSave ? isSaveDisabled : false}
        isSubmitting={isSaving}
        open={open}
        title={resolvedTitle}
        onCancel={cancelDiscard}
        onConfirm={onSave ? () => { void saveAndContinue(); } : confirmDiscard}
        onDestructiveAction={onSave ? confirmDiscard : undefined}
      />
    ),
    isDiscardConfirmOpen: open,
  };
}

export function useRouteLeaveConfirm({
  enabled,
  description,
  isSaveDisabled,
  message,
  onDiscard,
  onSave,
  saveLabel,
}: {
  enabled: boolean;
  description?: ReactNode;
  isSaveDisabled?: boolean;
  message?: string;
  onDiscard?: () => void;
  onSave?: SaveBeforeContinueHandler;
  saveLabel?: string;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPathRef = useRef(`${location.pathname}${location.search}${location.hash}`);
  const enabledRef = useRef(enabled);
  const replayingAnchorClickRef = useRef(false);
  const { discardConfirmDialog, requestDiscard } = useDiscardChangesConfirm({
    enabled,
    description: description ?? message,
    isSaveDisabled,
    onDiscard,
    onSave,
    saveLabel,
  });
  const requestDiscardRef = useRef(requestDiscard);

  currentPathRef.current = `${location.pathname}${location.search}${location.hash}`;
  enabledRef.current = enabled;
  requestDiscardRef.current = requestDiscard;

  useEffect(() => {
    function handleDocumentClick(event: MouseEvent) {
      if (replayingAnchorClickRef.current) {
        return;
      }
      if (event.defaultPrevented || event.button !== 0) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
        return;
      }

      const anchor = navigationAnchorFromClick(event);
      if (!anchor) {
        return;
      }

      const nextPath = resolveInternalNavigationPath(anchor);
      if (!nextPath || nextPath === currentPathRef.current) {
        return;
      }
      if (!enabledRef.current) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      requestDiscardRef.current(() => {
        if (!anchor.isConnected) {
          navigate(nextPath);
          return;
        }
        replayingAnchorClickRef.current = true;
        try {
          anchor.click();
        } finally {
          window.setTimeout(() => {
            replayingAnchorClickRef.current = false;
          }, 0);
        }
      });
    }

    function handleHistoryNavigation() {
      if (!enabledRef.current) {
        return;
      }

      const previousPath = currentPathRef.current;
      const nextPath = currentInternalNavigationPath();
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
