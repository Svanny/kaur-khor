import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export function useRouteLeaveConfirm({
  enabled,
  message,
  onDiscard,
}: {
  enabled: boolean;
  message: string;
  onDiscard?: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const currentPathRef = useRef(`${location.pathname}${location.search}${location.hash}`);

  useEffect(() => {
    currentPathRef.current = `${location.pathname}${location.search}${location.hash}`;
  }, [location]);

  function confirmLeave() {
    if (!enabled) {
      return true;
    }

    if (window.confirm(message)) {
      onDiscard?.();
      return true;
    }

    return false;
  }

  useEffect(() => {
    if (!enabled) {
      return;
    }

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

      event.preventDefault();
      if (confirmLeave()) {
        navigate(nextPath);
      }
    }

    function handlePopState() {
      if (confirmLeave()) {
        return;
      }
      navigate(currentPathRef.current, { replace: true });
    }

    document.addEventListener('click', handleDocumentClick, true);
    window.addEventListener('popstate', handlePopState);

    return () => {
      document.removeEventListener('click', handleDocumentClick, true);
      window.removeEventListener('popstate', handlePopState);
    };
  }, [enabled, message, navigate, onDiscard]);

  return confirmLeave;
}
