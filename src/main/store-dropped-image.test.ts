// @vitest-environment node

import { mkdtemp, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';

const normalizeDesktopImageMock = vi.hoisted(() => vi.fn());

vi.mock('./desktop-image', () => ({
  normalizeDesktopImage: normalizeDesktopImageMock,
}));

vi.mock('./benchmark', () => ({
  startBenchmarkSpan: vi.fn(() => vi.fn()),
  recordBenchmarkEvent: vi.fn(),
}));

import { storeDroppedImageHandler } from './store-dropped-image';

describe('storeDroppedImageHandler', () => {
  it('stores a normalized image and returns the target path on success', async () => {
    const assetDir = await mkdtemp(join(tmpdir(), 'banji-store-dropped-image-'));
    const payload = {
      name: 'test.png',
      data: new Uint8Array([1, 2, 3, 4]).buffer,
    };

    normalizeDesktopImageMock.mockReturnValue({
      bytes: Buffer.from([5, 6, 7]),
      extension: '.png',
    });

    const result = await storeDroppedImageHandler(payload, assetDir);

    expect(result.startsWith(assetDir)).toBe(true);
    expect(result.endsWith('.png')).toBe(true);

    const targetStats = await stat(result);
    expect(targetStats.isFile()).toBe(true);

    const files = await readdir(assetDir);
    const tempFiles = files.filter((f) => f.startsWith('.tmp-'));
    expect(tempFiles).toHaveLength(0);
  });

  it('cleans up the temp file when normalization fails', async () => {
    const assetDir = await mkdtemp(join(tmpdir(), 'banji-store-dropped-image-'));
    const payload = {
      name: 'test.jpg',
      data: new Uint8Array([1, 2, 3, 4]).buffer,
    };

    normalizeDesktopImageMock.mockImplementation(() => {
      throw new Error('normalization failed');
    });

    await expect(storeDroppedImageHandler(payload, assetDir)).rejects.toThrow('normalization failed');

    const files = await readdir(assetDir);
    const tempFiles = files.filter((f) => f.startsWith('.tmp-'));
    expect(tempFiles).toHaveLength(0);
  });

  it('stores a normalized WebP image as PNG', async () => {
    const assetDir = await mkdtemp(join(tmpdir(), 'banji-store-dropped-image-'));
    const payload = {
      name: 'test.webp',
      data: new Uint8Array([1, 2, 3, 4]).buffer,
    };

    normalizeDesktopImageMock.mockReturnValue({
      bytes: Buffer.from([5, 6, 7]),
      extension: '.png',
    });

    const result = await storeDroppedImageHandler(payload, assetDir);

    expect(result.startsWith(assetDir)).toBe(true);
    expect(result.endsWith('.png')).toBe(true);

    const targetStats = await stat(result);
    expect(targetStats.isFile()).toBe(true);
  });
});
