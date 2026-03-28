// @vitest-environment node

import { readFileSync } from 'node:fs';

const mainSource = readFileSync(new URL('./index.ts', import.meta.url), 'utf8');
const preloadSource = readFileSync(new URL('../preload/index.ts', import.meta.url), 'utf8');
const rendererHtml = readFileSync(new URL('../renderer/index.html', import.meta.url), 'utf8');

describe('desktop runtime security contract', () => {
  it('creates the BrowserWindow with an isolated preload bridge', () => {
    expect(mainSource).toContain("preload: join(__dirname, '../preload/index.mjs')");
    expect(mainSource).toContain('contextIsolation: true');
    expect(mainSource).toContain('nodeIntegration: false');
  });

  it('exposes a named preload bridge through contextBridge', () => {
    expect(preloadSource).toContain("contextBridge.exposeInMainWorld('banjiDesktop', desktopBridge)");
    expect(preloadSource).toContain('ipcRenderer.invoke');
  });

  it('does not load remote scripts from the renderer html shell', () => {
    expect(rendererHtml).not.toMatch(/<script[^>]+src="https?:\/\//i);
  });
});
