// Verify the installed @electron/get proxy bootstrap against local HTTP/TLS fixtures.
// Optional comparison: --baseline-root /path/to/baseline/checkout
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');
const { createRequire } = require('node:module');
const { resolve, join } = require('node:path');
const scratch = fs.mkdtempSync(join(require('node:os').tmpdir(), 'kaur-khor-proxy-test-'));
const roots = [process.cwd()];
if (process.argv[2] === '--baseline-root' && process.argv[3]) roots.unshift(resolve(process.argv[3]));
const config = join(scratch, 'openssl.cnf');
fs.writeFileSync(config, '[req]\ndistinguished_name=dn\nx509_extensions=ext\nprompt=no\n[dn]\nCN=localhost\n[ext]\nsubjectAltName=DNS:localhost,IP:127.0.0.1\n');
const certificate = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-config', config, '-keyout', join(scratch, 'fixture-key.pem'), '-out', join(scratch, 'fixture-cert.pem')], {encoding:'utf8'});
assert.equal(certificate.status, 0, 'OpenSSL fixture generation failed: ' + certificate.stderr);

const key = fs.readFileSync(scratch + '/fixture-key.pem');
const cert = fs.readFileSync(scratch + '/fixture-cert.pem');
const originHttp = http.createServer((_req, res) => res.end('http-origin'));
const originHttps = https.createServer({ key, cert }, (_req, res) => res.end('https-origin'));
let httpProxyHits = 0;
let httpConnectHits = 0;
let httpsProxyHits = 0;
const proxyHttp = http.createServer((req, res) => {
  httpProxyHits++;
  const url = new URL(req.url);
  const forward = http.request({ hostname: '127.0.0.1', port: url.port, path: url.pathname, method: req.method, headers: req.headers, agent: false }, upstream => {
    res.writeHead(upstream.statusCode, upstream.headers);
    upstream.pipe(res);
  });
  forward.on('error', error => { res.statusCode = 502; res.end(error.message); });
  req.pipe(forward);
});
const proxyHttps = http.createServer((_req, res) => { res.statusCode = 500; res.end('wrong-proxy-protocol'); });
const connectHandler = counter => (req, client, head) => {
  counter();
  const port = Number(req.url.split(':').at(-1));
  const upstream = net.connect(port, '127.0.0.1', () => {
    client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    if (head.length) upstream.write(head);
    client.pipe(upstream);
    upstream.pipe(client);
  });
  client.on('error', () => upstream.destroy());
  upstream.on('error', () => client.destroy());
  client.on('close', () => upstream.destroy());
};
proxyHttp.on('connect', connectHandler(() => httpConnectHits++));
proxyHttps.on('connect', connectHandler(() => httpsProxyHits++));
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));

const childCode = `
const assert = require('node:assert/strict');
const fs = require('node:fs');
require(process.env.TEST_GET).initializeProxy();
assert.equal(global.GLOBAL_AGENT.HTTP_PROXY, process.env.GLOBAL_AGENT_HTTP_PROXY);
assert.equal(global.GLOBAL_AGENT.HTTPS_PROXY, process.env.TEST_PROXY_MODE === 'http_only' ? null : process.env.GLOBAL_AGENT_HTTPS_PROXY);
assert.equal(global.GLOBAL_AGENT.NO_PROXY, '127.0.0.1');
assert.equal(require(process.env.TEST_AGENT).bootstrap(), false);
const cert = fs.readFileSync('./fixture-cert.pem');
function get(url, withCa = true) {
 return new Promise((resolve, reject) => {
  const protocol = url.startsWith('https:') ? require('node:https') : require('node:http');
  const request = protocol.get(url, withCa ? { ca: cert } : {}, response => {
   let body = ''; response.setEncoding('utf8'); response.on('data', chunk => body += chunk); response.on('end', () => resolve(body));
  });
  request.on('error', reject);
  request.setTimeout(5000, () => request.destroy(new Error('timeout')));
 });
}
(async () => {
 assert.equal(await get('http://localhost:' + process.env.TEST_HTTP_PORT), 'http-origin');
 assert.equal(await get('https://localhost:' + process.env.TEST_HTTPS_PORT), 'https-origin');
 assert.equal(await get('http://127.0.0.1:' + process.env.TEST_HTTP_PORT), 'http-origin');
 assert.equal(await get('https://127.0.0.1:' + process.env.TEST_HTTPS_PORT), 'https-origin');
 console.log(JSON.stringify({ agent: process.env.TEST_AGENT, proxyMode: process.env.TEST_PROXY_MODE, bootstrap: 'ok', environment: 'ok', http: 'ok', https: 'ok', noProxy: 'ok', secondBootstrap: 'ignored' }));
 process.exit(0);
})().catch(error => { console.error(error); process.exit(1); });
`;

(async () => {
  const [httpPort, httpsPort, proxyHttpPort, proxyHttpsPort] = await Promise.all([originHttp, originHttps, proxyHttp, proxyHttps].map(listen));
  for (const root of roots) {
   const rootRequire = createRequire(join(root, 'package.json'));
   const builderRequire = createRequire(rootRequire.resolve('electron-builder'));
   const appBuilderRequire = createRequire(builderRequire.resolve('app-builder-lib'));
   const getPath = appBuilderRequire.resolve('@electron/get');
   const getRequire = createRequire(getPath);
   const agent = getRequire.resolve('global-agent');
   console.log('Testing the installed Electron Builder proxy graph in ' + root);
   for (const mode of ['legacy', 'standard', 'http_only']) {
    const beforeHttp = httpProxyHits;
    const beforeHttpConnect = httpConnectHits;
    const beforeHttps = httpsProxyHits;
    const env = { ...process.env, TEST_AGENT: agent, TEST_GET: getPath, TEST_PROXY_MODE: mode, TEST_HTTP_PORT: String(httpPort), TEST_HTTPS_PORT: String(httpsPort), NODE_EXTRA_CA_CERTS: scratch + '/fixture-cert.pem' };
    for (const name of Object.keys(env)) if (/^(global_agent_|https?_proxy$|no_proxy$)/i.test(name)) delete env[name];
    const prefix = mode === 'standard' ? '' : 'GLOBAL_AGENT_';
    env[prefix + 'HTTP_PROXY'] = 'http://127.0.0.1:' + proxyHttpPort;
    if (mode !== 'http_only') env[prefix + 'HTTPS_PROXY'] = 'http://127.0.0.1:' + proxyHttpsPort;
    env[prefix + 'NO_PROXY'] = '127.0.0.1';
    const exit = await new Promise(resolve => {
      const child = spawn(process.execPath, ['-e', childCode], { cwd: scratch, env, stdio: 'inherit' });
      child.on('exit', resolve);
    });
    assert.equal(exit, 0, agent + ' child failed');
    assert.equal(httpProxyHits - beforeHttp, 1, agent + ' HTTP proxy routing/bypass failed');
    assert.equal(httpConnectHits - beforeHttpConnect, mode === 'http_only' ? 1 : 0, agent + ' HTTPS HTTP_PROXY fallback failed');
    assert.equal(httpsProxyHits - beforeHttps, mode === 'http_only' ? 0 : 1, agent + ' HTTPS proxy routing/bypass failed');
    console.log(agent + '/' + mode + ': HTTP/HTTPS proxy routing and both NO_PROXY calls verified');
   }
  }
  for (const server of [originHttp, originHttps, proxyHttp, proxyHttps]) server.close();
  fs.rmSync(scratch, {recursive:true,force:true});
  process.exit(0);
})().catch(error => { console.error(error); process.exit(1); });
