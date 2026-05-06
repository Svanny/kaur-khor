const truthyValues = new Set(['1', 'true', 'yes', 'on']);

function envTraceEnabled() {
  const raw = import.meta.env.VITE_KAUR_KHOR_DESKTOP_TRACE_RENDERER;
  return typeof raw === 'string' && truthyValues.has(raw.toLowerCase());
}

function storageTraceEnabled() {
  if (typeof window === 'undefined') {
    return false;
  }
  const storage = window.localStorage;
  if (!storage || typeof storage.getItem !== 'function') {
    return false;
  }
  const raw = storage.getItem('KAUR_KHOR_DESKTOP_TRACE_RENDERER');
  return typeof raw === 'string' && truthyValues.has(raw.toLowerCase());
}

export function rendererTraceEnabled() {
  return envTraceEnabled() || storageTraceEnabled();
}

function serializeDetails(details: Record<string, unknown>) {
  try {
    return JSON.stringify(details);
  } catch {
    return '[unserializable-details]';
  }
}

export function traceRenderer(scope: string, message: string, details?: Record<string, unknown>) {
  if (!rendererTraceEnabled()) {
    return;
  }
  const suffix = details ? ` ${serializeDetails(details)}` : '';
  console.log(`[kaur-khor-renderer:${scope}] ${message}${suffix}`);
}
