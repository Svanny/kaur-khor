// @vitest-environment node

import { mkdtemp, truncate, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  assertDesktopImageBytesAreSafeForImport,
  assertDesktopImageFileIsSafeForImport,
} from './desktop-image-import';

function buildPngHeader(width: number, height: number) {
  const bytes = Buffer.alloc(33);
  bytes.writeUInt32BE(0x89504e47, 0);
  bytes.writeUInt32BE(0x0d0a1a0a, 4);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

describe('desktop image import validation', () => {
  it('returns the sniffed extension for supported image bytes', () => {
    expect(assertDesktopImageBytesAreSafeForImport(buildPngHeader(100, 100))).toBe('.png');
  });

  it('rejects unsupported image bytes before native image decoding', () => {
    expect(() => assertDesktopImageBytesAreSafeForImport(Buffer.from('not an image'))).toThrow(
      'Please choose a PNG, JPEG, or WebP image.',
    );
  });

  it('rejects oversized files before native image decoding', () => {
    expect(() => assertDesktopImageBytesAreSafeForImport(Buffer.alloc((20 * 1024 * 1024) + 1))).toThrow(
      'Images must be 20 MB or smaller.',
    );
  });

  it('rejects oversized image files before reading image bytes', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-image-import-'));
    const imagePath = join(userDataPath, 'huge.png');
    await writeFile(imagePath, buildPngHeader(100, 100));
    await truncate(imagePath, (20 * 1024 * 1024) + 1);

    await expect(assertDesktopImageFileIsSafeForImport(imagePath)).rejects.toThrow(
      'Images must be 20 MB or smaller.',
    );
  });

  it('rejects tiny encoded files with unsafe dimensions before native image decoding', () => {
    expect(() => assertDesktopImageBytesAreSafeForImport(buildPngHeader(50_000, 50_000))).toThrow(
      'Images must be 12000 px or smaller per side and 40 megapixels or smaller.',
    );
  });

  it('rejects image headers with impossible zero dimensions before native image decoding', () => {
    expect(() => assertDesktopImageBytesAreSafeForImport(buildPngHeader(0, 100))).toThrow(
      'Images must be 12000 px or smaller per side and 40 megapixels or smaller.',
    );
    expect(() => assertDesktopImageBytesAreSafeForImport(buildPngHeader(100, 0))).toThrow(
      'Images must be 12000 px or smaller per side and 40 megapixels or smaller.',
    );
  });
});
