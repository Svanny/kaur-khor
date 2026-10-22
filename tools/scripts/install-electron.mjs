import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

// Preserve the source-build opt-out and prepare the binary before parallel tests.
if (process.env.ELECTRON_SKIP_BINARY_DOWNLOAD !== '1') {
  const require = createRequire(import.meta.url);
  const installer = join(dirname(require.resolve('electron/package.json')), 'install.js');
  const result = spawnSync(process.execPath, [installer], { stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
