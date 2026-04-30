// @vitest-environment node

import { readFileSync } from 'node:fs';

const mainSource = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const preloadSource = readFileSync(new URL('../preload/index.ts', import.meta.url), 'utf8');
const rendererHtml = readFileSync(new URL('../renderer/index.html', import.meta.url), 'utf8');
const windowActivationSource = readFileSync(new URL('./window-activation.ts', import.meta.url), 'utf8');
const benchmarkRunnerSource = readFileSync(new URL('./benchmark-runner.ts', import.meta.url), 'utf8');

describe('desktop runtime security contract', () => {
  it('creates the BrowserWindow with an isolated preload bridge', () => {
    expect(mainSource).toContain('function createMainWindowWebPreferences()');
    expect(mainSource).toContain("const benchmarkWindowBackgroundMode = process.env.BANJI_BENCHMARK_BACKGROUND === '1';");
    expect(mainSource).toContain("preload: join(__dirname, '../preload/index.mjs')");
    expect(mainSource).toContain('contextIsolation: true');
    expect(mainSource).toContain('nodeIntegration: false');
    expect(mainSource).toContain('zoomFactor: PREFERRED_BASELINE_ZOOM_FACTOR,');
    expect(mainSource).toContain('screen.getPrimaryDisplay().workArea');
    expect(mainSource).toContain('const PREFERRED_BASELINE_ZOOM_LEVEL = 0;');
    expect(mainSource).toContain('const PREFERRED_BASELINE_ZOOM_FACTOR = 1.2 ** PREFERRED_BASELINE_ZOOM_LEVEL;');
    expect(mainSource).toContain('const ZOOM_LEVEL_STEP = 0.5;');
    expect(mainSource).toContain('const windowZoomLevels = new WeakMap<BrowserWindow, number>();');
    expect(mainSource).toContain('installPreferredWindowZoomBehavior(mainWindow);');
    expect(mainSource).toContain('show: false,');
    expect(mainSource).toContain('focusable: !benchmarkWindowBackgroundMode,');
    expect(mainSource).toContain('skipTaskbar: benchmarkWindowBackgroundMode,');
    expect(mainSource).toContain('function installMacDockIcon()');
    expect(mainSource).toContain('app.dock.setIcon(nativeImage.createFromPath(iconAssets.dockIconPath));');
    expect(mainSource).toContain('installMacDockIcon();');
    expect(mainSource).toContain('prepareInactiveMacDevWindowLaunch({');
    expect(mainSource).toContain('showWindowWithoutStealingFocus({');
    expect(mainSource).toContain('restoreRegularActivationPolicy: shouldUseInactiveMacDevWindowLaunch,');
    expect(windowActivationSource).toContain("app.setActivationPolicy?.('accessory');");
    expect(windowActivationSource).toContain("app.setActivationPolicy?.('regular');");
    expect(windowActivationSource).toContain('targetWindow.showInactive();');
    expect(windowActivationSource).not.toContain("targetWindow.once('focus'");
    expect(mainSource.indexOf('prepareInactiveMacDevWindowLaunch({')).toBeGreaterThan(-1);
    expect(mainSource.indexOf('prepareInactiveMacDevWindowLaunch({')).toBeLessThan(mainSource.indexOf('app.whenReady()'));
    expect(mainSource.indexOf('showWindowWithoutStealingFocus({')).toBeLessThan(
      mainSource.indexOf("snapshotProcessMemory('main.window.renderer.loaded');"),
    );
  });

  it('remaps actual size to the preferred default zoom level and owns zoom controls itself', () => {
    expect(mainSource).toContain('Menu.setApplicationMenu(Menu.buildFromTemplate(template))');
    expect(mainSource).toContain("label: 'Actual Size'");
    expect(mainSource).toContain("accelerator: 'CmdOrCtrl+0'");
    expect(mainSource).toContain('setFocusedWindowToActualSize();');
    expect(mainSource).toContain("banji's \"Actual Size\" restores the app's preferred baseline zoom");
    expect(mainSource).toContain('setManagedWindowZoomLevel(window, PREFERRED_BASELINE_ZOOM_LEVEL);');
    expect(mainSource).toContain("label: 'Zoom In'");
    expect(mainSource).toContain("label: 'Zoom Out'");
    expect(mainSource).toContain('changeFocusedWindowZoom(1);');
    expect(mainSource).toContain('changeFocusedWindowZoom(-1);');
    expect(mainSource).not.toContain("role: 'resetZoom'");
    expect(mainSource).not.toContain("role: 'zoomIn'");
    expect(mainSource).not.toContain("role: 'zoomOut'");
  });

  it('reapplies the managed zoom baseline across renderer lifecycle boundaries', () => {
    expect(mainSource).toContain('function installOptionalWindowZoomLimits(window: BrowserWindow)');
    expect(mainSource).toContain("if (typeof webContents.setVisualZoomLevelLimits === 'function') {");
    expect(mainSource).toContain('webContents.setVisualZoomLevelLimits(1, 1).catch((error) => {');
    expect(mainSource).toContain("}).setLayoutZoomLevelLimits === 'function')");
    expect(mainSource).toContain('installOptionalWindowZoomLimits(window);');
    expect(mainSource).toContain("webContents.on('did-start-loading', () => {");
    expect(mainSource).toContain("webContents.on('did-navigate', () => {");
    expect(mainSource).toContain("webContents.on('did-navigate-in-page', () => {");
    expect(mainSource).toContain("webContents.on('dom-ready', () => {");
    expect(mainSource).toContain("webContents.on('did-finish-load', () => {");
    expect(mainSource).toContain("window.on('focus', () => {");
    expect(mainSource).toContain('applyManagedWindowZoomLevel(window);');
  });

  it('installs a renderer content security policy without unsafe-eval', () => {
    expect(mainSource).toContain('installRendererContentSecurityPolicy()');
    expect(mainSource).toContain('session.defaultSession.webRequest.onHeadersReceived');
    expect(mainSource).toContain("'Content-Security-Policy': [policy]");
    expect(mainSource).not.toContain('unsafe-eval');
  });

  it('loads React DevTools only for the development renderer session', () => {
    expect(mainSource).toContain("import installExtension, { REACT_DEVELOPER_TOOLS } from 'electron-devtools-installer';");
    expect(mainSource).toContain('async function installReactDevToolsForDevelopment()');
    expect(mainSource).toContain('if (app.isPackaged || !process.env.ELECTRON_RENDERER_URL) {');
    expect(mainSource).toContain('await installExtension(REACT_DEVELOPER_TOOLS, {');
    expect(mainSource).toContain('session: session.defaultSession,');
    expect(mainSource.indexOf('await installReactDevToolsForDevelopment();')).toBeLessThan(
      mainSource.indexOf('await createMainWindow();'),
    );
  });

  it('blocks renderer-created windows and top-level external navigation', () => {
    expect(mainSource).toContain("import { installMainWindowNavigationGuards } from './navigation-guards';");
    expect(mainSource).toContain('installMainWindowNavigationGuards(mainWindow);');
    const navigationGuardSource = readFileSync(new URL('./navigation-guards.ts', import.meta.url), 'utf8');
    expect(navigationGuardSource).toContain('webContents.setWindowOpenHandler');
    expect(navigationGuardSource).toContain("webContents.on('will-navigate'");
    expect(navigationGuardSource).toContain("return { action: 'deny' };");
    expect(navigationGuardSource).toContain('normalizeAllowedExternalUrl(targetUrl)');
    expect(navigationGuardSource).toContain('event.preventDefault();');
  });

  it('limits renderer file reveal requests to local workspace paths', () => {
    expect(mainSource).toContain("import { normalizeAllowedLocalDataPath } from './local-path-access';");
    expect(mainSource).toContain('normalizeAllowedLocalDataPath(targetPath, [desktopDataPath])');
  });

  it('exposes a named preload bridge through contextBridge', () => {
    expect(preloadSource).toContain("contextBridge.exposeInMainWorld('banjiDesktop', desktopBridge)");
    expect(preloadSource).toContain('ipcRenderer.invoke');
  });

  it('does not load remote scripts from the renderer html shell', () => {
    expect(rendererHtml).not.toMatch(/<script[^>]+src="https?:\/\//i);
  });

  it('keeps generated flamegraph artifacts free of remote script and style origins', () => {
    expect(benchmarkRunnerSource).not.toMatch(/<(?:script|link)[^>]+(?:src|href)="https?:\/\//i);
    expect(benchmarkRunnerSource).not.toMatch(/https:\/\/(?:d3js\.org|cdn\.jsdelivr\.net)\//i);
  });
});
