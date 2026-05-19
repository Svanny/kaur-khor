// @vitest-environment node

import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createFromPathMock, createThumbnailFromPathMock } = vi.hoisted(() => ({
  createFromPathMock: vi.fn(),
  createThumbnailFromPathMock: vi.fn(),
}));

vi.mock('electron', () => ({
  nativeImage: {
    createFromPath: createFromPathMock,
    createThumbnailFromPath: createThumbnailFromPathMock,
  },
}));

import { normalizeDesktopImage, prepareDesktopImageUpload } from './desktop-image';

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

function buildJpegHeader(width: number, height: number, byteLength = 128) {
  const bytes = Buffer.alloc(byteLength, 0);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[2] = 0xff;
  bytes[3] = 0xc0;
  bytes.writeUInt16BE(17, 4);
  bytes[6] = 8;
  bytes.writeUInt16BE(height, 7);
  bytes.writeUInt16BE(width, 9);
  bytes[11] = 3;
  bytes[byteLength - 2] = 0xff;
  bytes[byteLength - 1] = 0xd9;
  return bytes;
}

function buildWebpHeader(width: number, height: number, byteLength = 128) {
  const bytes = Buffer.alloc(byteLength, 0);
  bytes.write('RIFF', 0, 'ascii');
  bytes.writeUInt32LE(byteLength - 8, 4);
  bytes.write('WEBP', 8, 'ascii');
  bytes.write('VP8X', 12, 'ascii');
  bytes.writeUInt32LE(10, 16);
  bytes.writeUIntLE(width - 1, 24, 3);
  bytes.writeUIntLE(height - 1, 27, 3);
  return bytes;
}

describe('prepareDesktopImageUpload', () => {
  beforeEach(() => {
    createFromPathMock.mockReset();
    createThumbnailFromPathMock.mockReset();
  });

  it('keeps the original image bytes when the source is not high definition', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-desktop-image-'));
    const imagePath = join(userDataPath, 'belt.png');
    const originalBytes = buildPngHeader(1200, 800);
    await writeFile(imagePath, originalBytes);

    createFromPathMock.mockReturnValue({
      isEmpty: () => false,
      getSize: () => ({ width: 1200, height: 800 }),
    });

    const upload = await prepareDesktopImageUpload(imagePath);

    expect(upload.filename).toBe('belt.png');
    expect(upload.bytes).toEqual(originalBytes);
  });

  it('rejects unsupported upload file types instead of uploading raw bytes', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-desktop-image-'));
    const imagePath = join(userDataPath, 'private.txt');
    await writeFile(imagePath, new Uint8Array([1, 2, 3, 4]));

    await expect(prepareDesktopImageUpload(imagePath)).rejects.toThrow('Please choose a PNG, JPEG, or WebP image.');
    expect(createFromPathMock).not.toHaveBeenCalled();
  });

  it('rejects unreadable images instead of uploading the original file bytes', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-desktop-image-'));
    const imagePath = join(userDataPath, 'corrupt.jpg');
    await writeFile(imagePath, buildJpegHeader(1200, 800));

    createFromPathMock.mockReturnValue({
      isEmpty: () => true,
    });
    createThumbnailFromPathMock.mockResolvedValue({
      isEmpty: () => true,
    });

    await expect(prepareDesktopImageUpload(imagePath)).rejects.toThrow('Kaur Khor could not read that image file.');
    expect(createThumbnailFromPathMock).not.toHaveBeenCalled();
  });

  it('rejects non-finite decoded image dimensions before resize math', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-desktop-image-'));
    const imagePath = join(userDataPath, 'dirty.png');
    await writeFile(imagePath, buildPngHeader(1200, 800));

    createFromPathMock.mockReturnValue({
      isEmpty: () => false,
      getSize: () => ({ width: Number.NaN, height: 800 }),
    });

    await expect(prepareDesktopImageUpload(imagePath)).rejects.toThrow(
      'Kaur Khor could not determine the image dimensions.',
    );
  });

  it('rejects unsafe image dimensions before native image decoding for Telegram upload', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-desktop-image-'));
    const imagePath = join(userDataPath, 'huge.png');
    await writeFile(imagePath, buildPngHeader(50_000, 50_000));

    await expect(prepareDesktopImageUpload(imagePath)).rejects.toThrow(
      'Images must be 12000 px or smaller per side and 40 megapixels or smaller.',
    );
    expect(createFromPathMock).not.toHaveBeenCalled();
  });

  it('compresses oversized high-definition images before Telegram upload', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-desktop-image-'));
    const imagePath = join(userDataPath, 'shawl.jpg');
    const originalBytes = buildJpegHeader(3200, 2400, 1_600_100);
    const resizedImage = {
      toJPEG: vi.fn(() => new Uint8Array([9, 8, 7])),
      toPNG: vi.fn(() => new Uint8Array([9, 8, 7, 6])),
    };
    const sourceImage = {
      isEmpty: () => false,
      getSize: () => ({ width: 3200, height: 2400 }),
      resize: vi.fn(() => resizedImage),
      toJPEG: vi.fn(() => originalBytes),
      toPNG: vi.fn(() => originalBytes),
    };

    await writeFile(imagePath, originalBytes);
    createFromPathMock.mockReturnValue(sourceImage);

    const upload = await prepareDesktopImageUpload(imagePath);

    expect(upload.filename).toBe('shawl-telegram.jpg');
    expect(Array.from(upload.bytes)).toEqual([9, 8, 7]);
    expect(sourceImage.resize).toHaveBeenCalled();
    expect(resizedImage.toJPEG).toHaveBeenCalled();
  });

  it('normalizes WebP images to PNG for safe upload', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-desktop-image-'));
    const imagePath = join(userDataPath, 'badge.webp');
    const originalBytes = buildWebpHeader(3200, 2400, 1_600_100);
    const resizedImage = {
      toJPEG: vi.fn(() => new Uint8Array([9, 8, 7])),
      toPNG: vi.fn(() => new Uint8Array([9, 8, 7, 6])),
    };
    const sourceImage = {
      isEmpty: () => false,
      getSize: () => ({ width: 3200, height: 2400 }),
      resize: vi.fn(() => resizedImage),
      toJPEG: vi.fn(() => originalBytes),
      toPNG: vi.fn(() => originalBytes),
    };

    await writeFile(imagePath, originalBytes);
    createFromPathMock.mockReturnValue(sourceImage);

    const upload = await prepareDesktopImageUpload(imagePath);

    expect(upload.filename).toBe('badge-telegram.png');
    expect(Array.from(upload.bytes)).toEqual([9, 8, 7, 6]);
    expect(sourceImage.resize).toHaveBeenCalled();
    expect(resizedImage.toPNG).toHaveBeenCalled();
  });

  it('decodes picked WebP files through the thumbnail fallback when native path decoding is empty', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-desktop-image-'));
    const imagePath = join(userDataPath, 'picked.webp');
    await writeFile(imagePath, buildWebpHeader(1200, 800));
    const resizedImage = {
      toJPEG: vi.fn(() => new Uint8Array([8, 7, 6])),
      toPNG: vi.fn(() => new Uint8Array([4, 3, 2, 1])),
    };
    const thumbnailImage = {
      isEmpty: () => false,
      getSize: () => ({ width: 1200, height: 800 }),
      resize: vi.fn(() => resizedImage),
      toJPEG: vi.fn(() => new Uint8Array([8, 7, 6])),
      toPNG: vi.fn(() => new Uint8Array([4, 3, 2, 1])),
    };

    createFromPathMock.mockReturnValue({
      isEmpty: () => true,
    });
    createThumbnailFromPathMock.mockResolvedValue(thumbnailImage);

    const normalized = await normalizeDesktopImage(imagePath);

    expect(createThumbnailFromPathMock).toHaveBeenCalledWith(imagePath, {
      width: 1600,
      height: 1600,
    });
    expect(normalized.extension).toBe('.png');
    expect(Array.from(normalized.bytes)).toEqual([4, 3, 2, 1]);
    expect(thumbnailImage.resize).toHaveBeenCalled();
  });

  it('normalizes small WebP images to PNG instead of uploading raw WebP bytes', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'kaur-khor-desktop-image-'));
    const imagePath = join(userDataPath, 'badge.webp');
    const originalBytes = buildWebpHeader(1200, 800);
    const resizedImage = {
      toJPEG: vi.fn(() => new Uint8Array([9, 8, 7])),
      toPNG: vi.fn(() => new Uint8Array([9, 8, 7, 6])),
    };
    const sourceImage = {
      isEmpty: () => false,
      getSize: () => ({ width: 1200, height: 800 }),
      resize: vi.fn(() => resizedImage),
      toJPEG: vi.fn(() => originalBytes),
      toPNG: vi.fn(() => originalBytes),
    };

    await writeFile(imagePath, originalBytes);
    createFromPathMock.mockReturnValue(sourceImage);

    const upload = await prepareDesktopImageUpload(imagePath);

    expect(upload.filename).toBe('badge-telegram.png');
    expect(Array.from(upload.bytes)).toEqual([9, 8, 7, 6]);
    expect(sourceImage.resize).toHaveBeenCalled();
    expect(resizedImage.toPNG).toHaveBeenCalled();
  });
});
