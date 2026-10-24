// @vitest-environment node
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { describe, expect, test } from 'vitest';

const require = createRequire(import.meta.url);
const electronRequire = createRequire(require.resolve('electron'));
const getRequire = createRequire(electronRequire.resolve('@electron/get'));
const builderCliRequire = createRequire(require.resolve('electron-builder'));
const builderRequire = createRequire(builderCliRequire.resolve('app-builder-lib'));
const ajvRequire = createRequire(builderRequire.resolve('ajv'));
const rebuildRequire = createRequire(builderRequire.resolve('@electron/rebuild'));
const gypRequire = createRequire(rebuildRequire.resolve('node-gyp'));
const markmapRequire = createRequire(require.resolve('markmap-cli'));
const libRequire = createRequire(markmapRequire.resolve('markmap-lib'));
const parserRequire = createRequire(libRequire.resolve('markmap-html-parser'));
const cheerioRequire = createRequire(parserRequire.resolve('cheerio'));
const fastUri = ajvRequire('fast-uri');
const Ajv = builderRequire('ajv');

describe('network dependency maintenance', () => {
  // GHSA-xjj6-f33q-929c: a caught fetch rejection must not leave an orphan
  // response stream whose later error terminates the process. Keep the server
  // and client in a bounded child so the vulnerable version cannot kill Vitest.
  test.each([
    ['Electron download', getRequire.resolve('undici')],
    ['native rebuild', gypRequire.resolve('undici')],
    ['Markmap HTML import', cheerioRequire.resolve('undici')],
  ])('%s survives an early close with excessive content encodings', async (_name, undiciPath) => {
    const script = `
      const assert = require('node:assert/strict');
      const { once } = require('node:events');
      const { createServer } = require('node:net');
      const { Client, fetch } = require(process.argv[1]);
      (async () => {
        let socketClosed;
        const closed = new Promise((resolve) => { socketClosed = resolve; });
        const server = createServer((socket) => {
          socket.once('close', socketClosed);
          socket.once('data', () => socket.end(
            'HTTP/1.1 200 OK\\r\\nContent-Encoding: gzip, gzip, gzip, gzip, gzip, gzip\\r\\n' +
            'Content-Length: 1\\r\\nConnection: close\\r\\n\\r\\n'
          ));
        });
        await once(server.listen(0, '127.0.0.1'), 'listening');
        const origin = 'http://127.0.0.1:' + server.address().port;
        const client = new Client(origin);
        try {
          await assert.rejects(fetch(origin, { dispatcher: client }), (error) => {
            assert.match(error.cause?.message, /content-encoding/);
            return true;
          });
          await closed;
        } finally {
          await client.close();
          await new Promise((resolve) => server.close(resolve));
        }
        process.stdout.write('survived');
      })().catch((error) => { console.error(error); process.exitCode = 1; });
    `;
    const output = await new Promise((resolve, reject) => {
      execFile(process.execPath, ['--eval', script, undiciPath], { timeout: 10_000 },
        (error, stdout) => error ? reject(error) : resolve(stdout));
    });
    expect(output).toBe('survived');
  }, 15_000);

  test('Electron download fetch verifies mixed-case integrity tokens', async () => {
    const { fetch } = getRequire('undici');
    const digest = createHash('sha256').update('expected').digest('base64');
    const integrity = `SHA256-${digest}`;
    await expect(fetch('data:text/plain,tampered', { integrity })).rejects.toThrow();
    const response = await fetch('data:text/plain,expected', { integrity });
    expect(await response.text()).toBe('expected');
  });

  test.each(['%6Aavascript:alert(1)', 'http://a@b@evil.example/', 'http://ev\til.example/'])
    ('rejects ambiguous URI %j instead of silently rewriting it', (uri) => {
      expect(fastUri.parse(uri).error).toBeTruthy();
      expect(fastUri.normalize(uri)).toBe(uri);
      expect(fastUri.equal(uri, uri)).toBe(false);
      expect(() => fastUri.resolve('https://trusted.example/', uri)).toThrow();
    });

  test('preserves ordinary URI resolution and Electron Builder schema validation', () => {
    expect(fastUri.resolve('https://example.com/config/', '../schema.json'))
      .toBe('https://example.com/schema.json');
    const validate = new Ajv().compile({
      $id: 'https://schema.example/config.json',
      $defs: { name: { type: 'string', minLength: 1 } },
      type: 'object', required: ['name'], properties: { name: { $ref: '#/$defs/name' } },
    });
    expect(validate({ name: 'Inventory' })).toBe(true);
    expect(validate({ name: 1 })).toBe(false);
  });
});
