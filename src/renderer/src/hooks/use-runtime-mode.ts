import { useEffect, useState } from 'react';

type RuntimeMode = 'desktop' | 'browser' | 'browser-demo';

function modeFromPlatform(platform: string | null | undefined): RuntimeMode {
  if (platform === 'web-demo') {
    return 'browser-demo';
  }
  if (platform === 'web' || platform === 'browser') {
    return 'browser';
  }
  return 'desktop';
}

export function useRuntimeMode() {
  const [mode, setMode] = useState<RuntimeMode>('desktop');

  useEffect(() => {
    let mounted = true;
    window.kaurKhorDesktop?.system?.getAppContext?.()
      .then((context) => {
        if (mounted) {
          setMode(modeFromPlatform(context.platform));
        }
      })
      .catch(() => {
        if (mounted) {
          setMode('desktop');
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  return {
    isBrowserRuntime: mode === 'browser' || mode === 'browser-demo',
    isBrowserDemoRuntime: mode === 'browser-demo',
    mode,
  };
}
