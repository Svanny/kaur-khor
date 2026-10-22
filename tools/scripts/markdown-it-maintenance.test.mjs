// @vitest-environment node
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import { describe, expect, test } from 'vitest';

const require = createRequire(import.meta.url);
const cliRequire = createRequire(require.resolve('markmap-cli'));
const libRequire = createRequire(cliRequire.resolve('markmap-lib'));
const markdownItPath = libRequire.resolve('markdown-it');
const MarkdownIt = libRequire('markdown-it');

describe('Markmap markdown-it maintenance', () => {
  test('preserves reference links, headings, and enabled inline HTML', () => {
    const md = new MarkdownIt({ html: true });
    expect(md.render('# Docs\n\n[Guide][guide] and <em>notes</em>.\n\n[guide]: /guide "Read more"\n'))
      .toBe('<h1>Docs</h1>\n<p><a href="/guide" title="Read more">Guide</a> and <em>notes</em>.</p>\n');
  });

  // GHSA-gfr2-rv44-r23c and GHSA-vfgh-jcmw-g37q: isolate synchronous parsing
  // so a vulnerable dependency is killed instead of blocking the test runner.
  test.each([
    ['unclosed reference label', '[' + 'a\n'.repeat(400_000), false],
    ['unclosed reference title', '[a]: /u "' + 'x\n'.repeat(400_000), false],
    ...['<!--', '<?x', '<!A', '<![CDATA['].map((opener) => [
      `unclosed inline ${opener}`, 'x ' + opener.repeat(128_000), true,
    ]),
  ])('%s completes within a bounded subprocess', async (_name, source, html) => {
    const script = `
      const assert = require('node:assert/strict');
      const fs = require('node:fs');
      const MarkdownIt = require(process.argv[1]);
      const output = new MarkdownIt({ html: process.argv[2] === 'true' })
        .render(fs.readFileSync(0, 'utf8'));
      assert.ok(output.startsWith('<p>'));
      assert.ok(output.endsWith('</p>\\n'));
      process.stdout.write('rendered');
    `;
    const output = await new Promise((resolve, reject) => {
      const child = execFile(process.execPath, ['--eval', script, markdownItPath, String(html)], {
        timeout: 10_000,
      }, (error, stdout) => error ? reject(error) : resolve(stdout));
      child.stdin.on('error', reject);
      child.stdin.end(source);
    });
    expect(output).toBe('rendered');
  }, 15_000);
});
