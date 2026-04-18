// @vitest-environment node

import { readFileSync } from 'node:fs';

const mainSource = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const preloadSource = readFileSync(new URL('../preload/index.ts', import.meta.url), 'utf8');
const rendererHtml = readFileSync(new URL('../renderer/index.html', import.meta.url), 'utf8');

describe('desktop runtime security contract', () => {
  it('creates the BrowserWindow with an isolated preload bridge', () => {
    expect(mainSource).toContain('function createMainWindowWebPreferences()');
    expect(mainSource).toContain("preload: join(__dirname, '../preload/index.mjs')");
    expect(mainSource).toContain('contextIsolation: true');
    expect(mainSource).toContain('nodeIntegration: false');
    expect(mainSource).toContain('zoomFactor: PREFERRED_BASELINE_ZOOM_FACTOR,');
    expect(mainSource).toContain('screen.getPrimaryDisplay().workArea');
    expect(mainSource).toContain('const PREFERRED_BASELINE_ZOOM_LEVEL = -1;');
    expect(mainSource).toContain('const PREFERRED_BASELINE_ZOOM_FACTOR = 1.2 ** PREFERRED_BASELINE_ZOOM_LEVEL;');
    expect(mainSource).toContain('const ZOOM_LEVEL_STEP = 0.5;');
    expect(mainSource).toContain('const windowZoomLevels = new WeakMap<BrowserWindow, number>();');
    expect(mainSource).toContain('installPreferredWindowZoomBehavior(mainWindow);');
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

  it('exposes a named preload bridge through contextBridge', () => {
    expect(preloadSource).toContain("contextBridge.exposeInMainWorld('banjiDesktop', desktopBridge)");
    expect(preloadSource).toContain('ipcRenderer.invoke');
  });

  it('does not load remote scripts from the renderer html shell', () => {
    expect(rendererHtml).not.toMatch(/<script[^>]+src="https?:\/\//i);
  });
});
