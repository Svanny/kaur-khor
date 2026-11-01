// @vitest-environment node
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, test } from 'vitest';

const require = createRequire(import.meta.url);
const builderRequire = createRequire(createRequire(require.resolve('electron-builder')).resolve('app-builder-lib'));
const asarRequire = createRequire(builderRequire.resolve('@electron/asar'));
const jakeRequire = createRequire(createRequire(builderRequire.resolve('ejs')).resolve('jake'));
const filelistRequire = createRequire(jakeRequire.resolve('filelist'));
const markmapRequire = createRequire(require.resolve('markmap-cli'));

function runChild(script, paths) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, ['--max-old-space-size=256', '--eval', script, ...paths], { timeout: 10_000 },
      (error, stdout, stderr) => error ? reject(new Error(`${error.message}\n${stderr}`)) : resolve(stdout));
  });
}

describe('glob and static-server dependency maintenance', () => {
  test.each([
    ['Builder filters', builderRequire.resolve('minimatch')],
    ['ASAR unpack patterns', asarRequire.resolve('minimatch')],
    ['Jake file lists', filelistRequire.resolve('minimatch')],
  ])('%s bounds pattern amplification without losing ordinary matching', async (_name, matcherPath) => {
    const output = await runChild(`
      const assert = require('node:assert/strict');
      const { Minimatch } = require(process.argv[1]);
      const options = { optimizationLevel: 2, braceExpandMax: 64 };
      const mm = new Minimatch(Array(14).fill('**/../a/b').join('/'), options);
      assert.equal(mm.set.length, 64);
      const ordinary = new Minimatch('**/../a/b/**/../c/d', options);
      assert.equal(ordinary.match('../a/b/../c/d'), true);
      assert.equal(ordinary.match('x/a/b/y/c/d'), true);
      assert.equal(ordinary.match('unrelated.txt'), false);
      process.stdout.write('bounded');
    `, [matcherPath]);
    expect(output).toBe('bounded');
  }, 15_000);

  test('the Markmap-resolved static server rejects double-decoded protected paths', async () => {
    const output = await runChild(`
      const assert = require('node:assert/strict');
      const fs = require('node:fs');
      const { join } = require('node:path');
      const { tmpdir } = require('node:os');
      const { get } = require('node:http');
      const { Hono } = require(process.argv[1]);
      const { serve } = require(process.argv[2]);
      const { serveStatic } = require(process.argv[3]);
      const root = fs.mkdtempSync(join(tmpdir(), 'kaur-static-'));
      fs.mkdirSync(join(root, 'static', 'admin'), { recursive: true });
      fs.writeFileSync(join(root, 'static', 'admin', 'secret.txt'), 'private');
      fs.writeFileSync(join(root, 'static', 'hello world.txt'), 'public');
      const app = new Hono();
      app.use('/static/admin/*', c => c.text('Unauthorized', 401));
      app.use('/static/*', serveStatic({ root }));
      const request = (port, path) => new Promise((resolve, reject) => {
        get({ hostname: '127.0.0.1', port, path }, res => {
          let body = ''; res.setEncoding('utf8'); res.on('data', c => body += c);
          res.on('end', () => resolve({ status: res.statusCode, body }));
        }).on('error', reject);
      });
      (async () => {
        const server = await new Promise(resolve => {
          const s = serve({ fetch: app.fetch, port: 0, hostname: '127.0.0.1' }, () => resolve(s));
        });
        try {
          const port = server.address().port;
          for (const path of ['/static/admin/secret.txt', '/static/%61dmin/secret.txt']) {
            assert.equal((await request(port, path)).status, 401);
          }
          const encoded = await request(port, '/static/%%36%31dmin/secret.txt');
          assert.equal(encoded.status, 404);
          assert.notEqual(encoded.body, 'private');
          assert.deepEqual(await request(port, '/static/hello%20world.txt'), { status: 200, body: 'public' });
          process.stdout.write('protected');
        } finally {
          await new Promise(resolve => server.close(resolve));
          fs.rmSync(root, { recursive: true, force: true });
        }
      })().catch(error => { console.error(error); process.exitCode = 1; });
    `, [markmapRequire.resolve('hono'), markmapRequire.resolve('@hono/node-server'), markmapRequire.resolve('@hono/node-server/serve-static')]);
    expect(output).toBe('protected');
  }, 15_000);

  test('Markmap can start, serve its client, and stop repeatedly', async () => {
    const { MarkmapDevServer } = await import(pathToFileURL(require.resolve('markmap-cli')).href);
    const server = new MarkmapDevServer({ port: 0 });
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await server.setup();
      try {
        const response = await fetch(`http://127.0.0.1:${server.serverInfo.address.port}/~client.js`);
        expect(response.status).toBe(200);
        expect(await response.text()).toContain('markmap');
      } finally {
        await server.shutdown();
      }
    }
  });

  test('ASAR creates, unpacks, and reads the archive used by Builder', async () => {
    const root = fs.mkdtempSync(join(tmpdir(), 'kaur-asar-'));
    const asar = builderRequire('@electron/asar');
    try {
      const source = join(root, 'source');
      fs.mkdirSync(join(source, 'native'), { recursive: true });
      fs.writeFileSync(join(source, 'package.json'), '{"name":"fixture","main":"index.js"}');
      fs.writeFileSync(join(source, 'index.js'), 'module.exports = 42;');
      fs.writeFileSync(join(source, 'native', 'fixture.node'), 'native-fixture');
      const archive = join(root, 'app.asar');
      await asar.createPackageWithOptions(source, archive, { unpack: '*.node' });
      expect(asar.extractFile(archive, 'index.js').toString()).toBe('module.exports = 42;');
      expect(asar.statFile(archive, 'native/fixture.node').unpacked).toBe(true);
      expect(fs.readFileSync(join(`${archive}.unpacked`, 'native', 'fixture.node'), 'utf8')).toBe('native-fixture');
      const checker = builderRequire('app-builder-lib/out/asar/asarFileChecker');
      await expect(checker.checkFileInArchive(archive, 'index.js', 'entrypoint')).resolves.toMatchObject({ size: 20 });
      asar.uncacheAll();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('Builder filters, Universal allowlists, and Jake file lists retain their APIs', async () => {
    const { FileMatcher } = builderRequire('app-builder-lib/out/fileMatcher');
    const root = fs.mkdtempSync(join(tmpdir(), 'kaur-filter-'));
    try {
      const matcher = new FileMatcher(root, join(root, 'dest'), value => value, ['**/*', '!**/*.map']);
      const filter = matcher.createFilter();
      const stat = { isDirectory: () => false };
      expect(filter(join(root, 'out', 'main.js'), stat)).toBe(true);
      expect(filter(join(root, '.metadata'), stat)).toBe(true);
      expect(filter(join(root, 'out', 'main.js.map'), stat)).toBe(false);
      const universalPath = builderRequire.resolve('@electron/universal');
      const { matchGlob } = await import(pathToFileURL(join(dirname(universalPath), 'file-utils.js')).href);
      expect(matchGlob('native/x64.node', '*.node')).toBe(true);
      expect(matchGlob('native/x64.node', 'native/*.node')).toBe(true);
      expect(matchGlob('outside/x64.node', 'native/*.node')).toBe(false);
      const { FileList } = jakeRequire('filelist');
      fs.writeFileSync(join(root, 'main.js'), 'code');
      fs.writeFileSync(join(root, 'main.js.map'), 'map');
      const list = new FileList();
      list.include(join(root, '*.js*'));
      list.exclude(join(root, '*.map'));
      expect(list.toArray()).toEqual([join(root, 'main.js')]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('Universal merges real ASAR files and enforces single-architecture allowlists', async () => {
    const asar = builderRequire('@electron/asar');
    expect(builderRequire('@electron/universal').makeUniversalApp).toBeTypeOf('function');
    const universalPath = builderRequire.resolve('@electron/universal');
    const { mergeASARs } = await import(pathToFileURL(join(dirname(universalPath), 'asar-utils.js')).href);
    const root = fs.mkdtempSync(join(tmpdir(), 'kaur-universal-'));
    try {
      const archives = [];
      for (const arch of ['x64', 'arm64']) {
        const source = join(root, arch);
        fs.mkdirSync(source);
        fs.writeFileSync(join(source, 'package.json'), '{"name":"fixture","main":"index.js"}');
        fs.writeFileSync(join(source, 'index.js'), 'module.exports = 42;');
        if (arch === 'x64') fs.writeFileSync(join(source, 'x64-only.txt'), 'architecture fixture');
        const archive = join(root, `${arch}.asar`);
        await asar.createPackage(source, archive);
        archives.push(archive);
      }
      const options = { x64AsarPath: archives[0], arm64AsarPath: archives[1], outputAsarPath: join(root, 'merged.asar') };
      await expect(mergeASARs(options)).rejects.toThrow(/singleArchFiles|allowList/);
      await mergeASARs({ ...options, singleArchFiles: '*.txt' });
      expect(asar.extractFile(options.outputAsarPath, 'x64-only.txt').toString()).toBe('architecture fixture');
      expect(asar.extractFile(options.outputAsarPath, 'index.js').toString()).toBe('module.exports = 42;');
      asar.uncacheAll();
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  test('the ASAR glob walker stops filesystem reads after cancellation', async () => {
    const { glob } = asarRequire('glob');
    const root = fs.mkdtempSync(join(tmpdir(), 'kaur-glob-'));
    try {
      for (const name of ['a/a', 'a/b', 'b/a', 'b/b']) fs.mkdirSync(join(root, name), { recursive: true });
      const abort = new AbortController();
      let calls = 0;
      const countedFs = {
        ...fs,
        readdir: (...args) => {
          if (++calls === 1) abort.abort(new Error('fixture cancellation'));
          return fs.readdir(...args);
        },
      };
      await expect(glob('**', { cwd: root, fs: countedFs, signal: abort.signal })).rejects.toThrow('fixture cancellation');
      const atRejection = calls;
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(atRejection).toBe(1);
      expect(calls).toBe(atRejection);
      expect((await glob('**', { cwd: root })).sort()).toEqual(['.', 'a', 'a/a', 'a/b', 'b', 'b/a', 'b/b']);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
