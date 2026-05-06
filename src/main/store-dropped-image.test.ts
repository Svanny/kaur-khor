// @vitest-environment node

import { mkdtemp, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const normalizeDesktopImageMock = vi.hoisted(() => vi.fn());

vi.mock('./desktop-image', () => ({
  normalizeDesktopImage: normalizeDesktopImageMock,
}));

vi.mock('./benchmark', () => ({
  startBenchmarkSpan: vi.fn(() => vi.fn()),
  recordBenchmarkEvent: vi.fn(),
}));

import { storeDroppedImageHandler } from './store-dropped-image';

function buildPngHeader(width: number, height: number) {
  const bytes = Buffer.alloc(33);
  bytes.writeUInt32BE(0x89504e47, 0);
  bytes.writeUInt32BE(0x0d0a1a0a, 4);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return new Uint8Array(bytes).buffer;
}

function buildJpegHeader(width: number, height: number) {
  const bytes = Buffer.from([
    0xff, 0xd8,
    0xff, 0xc0,
    0x00, 0x11,
    0x08,
    (height >> 8) & 0xff,
    height & 0xff,
    (width >> 8) & 0xff,
    width & 0xff,
    0x03,
    0x01, 0x11, 0x00,
    0x02, 0x11, 0x00,
    0x03, 0x11, 0x00,
  ]);
  return new Uint8Array(bytes).buffer;
}

function buildWebpHeader(width: number, height: number) {
  const bytes = Buffer.alloc(30);
  bytes.write('RIFF', 0, 'ascii');
  bytes.writeUInt32LE(22, 4);
  bytes.write('WEBP', 8, 'ascii');
  bytes.write('VP8X', 12, 'ascii');
  bytes.writeUInt32LE(10, 16);
  bytes.writeUIntLE(width - 1, 24, 3);
  bytes.writeUIntLE(height - 1, 27, 3);
  return new Uint8Array(bytes).buffer;
}

describe('storeDroppedImageHandler', () => {
  beforeEach(() => {
    normalizeDesktopImageMock.mockReset();
  });

  it('stores a normalized image and returns the target path on success', async () => {
    const assetDir = await mkdtemp(join(tmpdir(), 'kaur-khor-store-dropped-image-'));
    const payload = {
      name: 'test.png',
      data: buildPngHeader(100, 100),
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
    const assetDir = await mkdtemp(join(tmpdir(), 'kaur-khor-store-dropped-image-'));
    const payload = {
      name: 'test.jpg',
      data: buildJpegHeader(100, 100),
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
    const assetDir = await mkdtemp(join(tmpdir(), 'kaur-khor-store-dropped-image-'));
    const payload = {
      name: 'test.webp',
      data: buildWebpHeader(100, 100),
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

  it('accepts extensionless image payloads when the MIME type is supported', async () => {
    const assetDir = await mkdtemp(join(tmpdir(), 'kaur-khor-store-dropped-image-'));
    const payload = {
      name: 'clipboard-image',
      type: 'image/png',
      data: buildPngHeader(100, 100),
    };

    normalizeDesktopImageMock.mockReturnValue({
      bytes: Buffer.from([5, 6, 7]),
      extension: '.png',
    });

    const result = await storeDroppedImageHandler(payload, assetDir);

    expect(result.startsWith(assetDir)).toBe(true);
    expect(result.endsWith('.png')).toBe(true);
  });

  it('rejects oversized image payloads before normalization', async () => {
    const assetDir = await mkdtemp(join(tmpdir(), 'kaur-khor-store-dropped-image-'));
    const payload = {
      name: 'too-large.png',
      data: new ArrayBuffer((20 * 1024 * 1024) + 1),
    };

    await expect(storeDroppedImageHandler(payload, assetDir)).rejects.toThrow(
      'Dropped images must be 20 MB or smaller.',
    );
    expect(normalizeDesktopImageMock).not.toHaveBeenCalled();
    expect(await readdir(assetDir)).toHaveLength(0);
  });

  it('rejects tiny encoded images with oversized PNG dimensions before normalization', async () => {
    const assetDir = await mkdtemp(join(tmpdir(), 'kaur-khor-store-dropped-image-'));
    const payload = {
      name: 'too-many-pixels.png',
      data: buildPngHeader(50_000, 50_000),
    };

    await expect(storeDroppedImageHandler(payload, assetDir)).rejects.toThrow(
      'Dropped images must be 12000 px or smaller per side and 40 megapixels or smaller.',
    );
    expect(normalizeDesktopImageMock).not.toHaveBeenCalled();
    expect(await readdir(assetDir)).toHaveLength(0);
  });

  it('sniffs oversized JPEG bytes labeled as PNG before normalization', async () => {
    const assetDir = await mkdtemp(join(tmpdir(), 'kaur-khor-store-dropped-image-'));
    const payload = {
      name: 'mislabeled.png',
      type: 'image/png',
      data: buildJpegHeader(50_000, 50_000),
    };

    await expect(storeDroppedImageHandler(payload, assetDir)).rejects.toThrow(
      'Dropped images must be 12000 px or smaller per side and 40 megapixels or smaller.',
    );
    expect(normalizeDesktopImageMock).not.toHaveBeenCalled();
    expect(await readdir(assetDir)).toHaveLength(0);
  });
});
