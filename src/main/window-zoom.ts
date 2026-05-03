import { type BrowserWindow } from 'electron';
import {
  deriveResponsiveViewportPolicy,
  selectResponsiveZoomLevel,
  zoomLevelToScale,
  type ResponsiveViewportDimensions,
} from '@shared/responsive-zoom';

export const PREFERRED_BASELINE_ZOOM_LEVEL = 0;
export const ZOOM_LEVEL_STEP = 0.5;
export const MIN_WINDOW_ZOOM_LEVEL = -3;
export const MAX_WINDOW_ZOOM_LEVEL = 3;

export type ManagedWindowZoomState = {
  appliedLevel: number | null;
  automaticLevel: number;
  manualOffsetLevel: number;
};

type WindowZoomDimensions = Pick<ResponsiveViewportDimensions, 'height' | 'width'>;

function normalizeWindowZoomDimensions(dimensions: WindowZoomDimensions | number, height?: number): WindowZoomDimensions {
  if (typeof dimensions === 'object') {
    return dimensions;
  }
  return {
    height: height ?? Number.POSITIVE_INFINITY,
    width: dimensions,
  };
}

export function clampWindowZoomLevel(level: number) {
  return Math.max(MIN_WINDOW_ZOOM_LEVEL, Math.min(MAX_WINDOW_ZOOM_LEVEL, level));
}

export function createManagedWindowZoomState(dimensions: WindowZoomDimensions | number, height?: number): ManagedWindowZoomState {
  const normalizedDimensions = normalizeWindowZoomDimensions(dimensions, height);
  return {
    appliedLevel: null,
    automaticLevel: selectResponsiveZoomLevel(normalizedDimensions),
    manualOffsetLevel: 0,
  };
}

export function managedWindowZoomLevel(state: ManagedWindowZoomState) {
  return clampWindowZoomLevel(state.automaticLevel + state.manualOffsetLevel);
}

export function managedWindowZoomFactor(state: ManagedWindowZoomState) {
  return zoomLevelToScale(managedWindowZoomLevel(state));
}

export function updateAutomaticWindowZoomLevel(
  state: ManagedWindowZoomState,
  dimensions: WindowZoomDimensions | number,
  height?: number,
) {
  const normalizedDimensions = normalizeWindowZoomDimensions(dimensions, height);
  state.automaticLevel = selectResponsiveZoomLevel({
    ...normalizedDimensions,
    previousLevel: state.automaticLevel,
  });
  return state;
}

export function changeManualWindowZoomLevel(state: ManagedWindowZoomState, stepDelta: number) {
  state.manualOffsetLevel = clampWindowZoomLevel(state.manualOffsetLevel + stepDelta * ZOOM_LEVEL_STEP);
  return state;
}

export function resetManualWindowZoomLevel(state: ManagedWindowZoomState) {
  state.manualOffsetLevel = 0;
  return state;
}

export function initialWindowZoomFactor(dimensions: WindowZoomDimensions | number, height?: number) {
  return zoomLevelToScale(selectResponsiveZoomLevel(normalizeWindowZoomDimensions(dimensions, height)));
}

export function deriveEmbeddedWindowViewportPolicy(width: number, height: number, previousLevel?: number | null) {
  return deriveResponsiveViewportPolicy({ height, previousLevel, width });
}

export function installWindowResizeZoomListeners(window: BrowserWindow, apply: () => void) {
  window.on('resize', apply);
  window.on('resized', apply);
  window.on('maximize', apply);
  window.on('unmaximize', apply);
  window.on('restore', apply);
  window.on('enter-full-screen', apply);
  window.on('leave-full-screen', apply);
}
