#!/usr/bin/env node
import { spawn } from 'node:child_process';

const args = ['build'];
const build = spawn('pnpm', args, { stdio: 'inherit' });
const buildCode = await new Promise((resolve) => build.once('exit', resolve));
if (buildCode !== 0) {
  process.exit(buildCode ?? 1);
}

const test = spawn('pnpm', ['exec', 'playwright', 'test', '-c', 'playwright.bench.config.ts'], {
  env: {
    ...process.env,
    BANJI_BENCHMARK_TRACE: process.env.BANJI_BENCHMARK_TRACE ?? '0',
  },
  stdio: 'inherit',
});
const testCode = await new Promise((resolve) => test.once('exit', resolve));
process.exit(testCode ?? 1);
