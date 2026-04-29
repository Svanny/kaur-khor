// @vitest-environment node

import { mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createFromPathMock } = vi.hoisted(() => ({
  createFromPathMock: vi.fn(),
}));

vi.mock('electron', () => ({
  nativeImage: {
    createFromPath: createFromPathMock,
  },
}));

import { prepareDesktopImageUpload } from './desktop-image';

describe('prepareDesktopImageUpload', () => {
  beforeEach(() => {
    createFromPathMock.mockReset();
  });

  it('keeps the original image bytes when the source is not high definition', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'banji-desktop-image-'));
    const imagePath = join(userDataPath, 'belt.jpg');
    const originalBytes = new Uint8Array([1, 2, 3, 4]);
    await writeFile(imagePath, originalBytes);

    createFromPathMock.mockReturnValue({
      isEmpty: () => false,
      getSize: () => ({ width: 1200, height: 800 }),
    });

    const upload = await prepareDesktopImageUpload(imagePath);

    expect(upload.filename).toBe('belt.jpg');
    expect(Array.from(upload.bytes)).toEqual(Array.from(originalBytes));
  });

  it('compresses oversized high-definition images before Telegram upload', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'banji-desktop-image-'));
    const imagePath = join(userDataPath, 'shawl.jpg');
    const originalBytes = new Uint8Array(1_600_100).fill(7);
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
    const userDataPath = await mkdtemp(join(tmpdir(), 'banji-desktop-image-'));
    const imagePath = join(userDataPath, 'badge.webp');
    const originalBytes = new Uint8Array(1_600_100).fill(7);
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
});
