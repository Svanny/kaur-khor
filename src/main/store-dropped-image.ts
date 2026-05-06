import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DesktopStoreDroppedImagePayload } from '@shared/ipc';
import { normalizeDesktopImage } from './desktop-image';
import { startBenchmarkSpan } from './benchmark';

const DESKTOP_ALLOWED_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const DESKTOP_DROPPED_IMAGE_MAX_BYTES = 20 * 1024 * 1024;
const DESKTOP_DROPPED_IMAGE_MAX_DIMENSION_PX = 12_000;
const DESKTOP_DROPPED_IMAGE_MAX_PIXELS = 40_000_000;
const DESKTOP_IMAGE_EXTENSION_BY_TYPE = new Map([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/webp', '.webp'],
]);
const JPEG_START_OF_FRAME_MARKERS = new Set([
  0xc0,
  0xc1,
  0xc2,
  0xc3,
  0xc5,
  0xc6,
  0xc7,
  0xc9,
  0xca,
  0xcb,
  0xcd,
  0xce,
  0xcf,
]);

type ImageHeaderDimensions = {
  height: number;
  width: number;
};

type DetectedImageFormat = {
  extension: '.png' | '.jpg' | '.webp';
  dimensions: ImageHeaderDimensions | null;
};

function imageExtensionForPayload(payload: DesktopStoreDroppedImagePayload) {
  const extension = extname(payload.name).toLowerCase();
  if (DESKTOP_ALLOWED_IMAGE_EXTENSIONS.has(extension)) {
    return extension;
  }

  return DESKTOP_IMAGE_EXTENSION_BY_TYPE.get(payload.type?.toLowerCase() ?? '') ?? null;
}

function hasPngSignature(bytes: Buffer) {
  return (
    bytes.byteLength >= 8 &&
    bytes.readUInt32BE(0) === 0x89504e47 &&
    bytes.readUInt32BE(4) === 0x0d0a1a0a
  );
}

function hasJpegSignature(bytes: Buffer) {
  return bytes.byteLength >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

function hasWebpSignature(bytes: Buffer) {
  return (
    bytes.byteLength >= 12 &&
    bytes.toString('ascii', 0, 4) === 'RIFF' &&
    bytes.toString('ascii', 8, 12) === 'WEBP'
  );
}

function readPngHeaderDimensions(bytes: Buffer): ImageHeaderDimensions | null {
  if (
    bytes.byteLength < 24 ||
    !hasPngSignature(bytes) ||
    bytes.toString('ascii', 12, 16) !== 'IHDR'
  ) {
    return null;
  }

  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

function readJpegHeaderDimensions(bytes: Buffer): ImageHeaderDimensions | null {
  if (!hasJpegSignature(bytes)) {
    return null;
  }

  let offset = 2;
  while (offset + 3 < bytes.byteLength) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = bytes[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9) {
      continue;
    }
    if (offset + 2 > bytes.byteLength) {
      return null;
    }

    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.byteLength) {
      return null;
    }

    if (JPEG_START_OF_FRAME_MARKERS.has(marker) && segmentLength >= 7) {
      return {
        height: bytes.readUInt16BE(offset + 3),
        width: bytes.readUInt16BE(offset + 5),
      };
    }

    offset += segmentLength;
  }

  return null;
}

function readWebpHeaderDimensions(bytes: Buffer): ImageHeaderDimensions | null {
  if (
    bytes.byteLength < 30 ||
    !hasWebpSignature(bytes)
  ) {
    return null;
  }

  const chunkType = bytes.toString('ascii', 12, 16);
  if (chunkType === 'VP8X' && bytes.readUInt32LE(16) >= 10) {
    return {
      width: bytes.readUIntLE(24, 3) + 1,
      height: bytes.readUIntLE(27, 3) + 1,
    };
  }

  if (chunkType === 'VP8L' && bytes.byteLength >= 25 && bytes[20] === 0x2f) {
    const byte0 = bytes[21];
    const byte1 = bytes[22];
    const byte2 = bytes[23];
    const byte3 = bytes[24];
    return {
      width: (((byte1 & 0x3f) << 8) | byte0) + 1,
      height: (((byte3 & 0x0f) << 10) | (byte2 << 2) | ((byte1 & 0xc0) >> 6)) + 1,
    };
  }

  if (
    chunkType === 'VP8 ' &&
    bytes.byteLength >= 30 &&
    bytes[23] === 0x9d &&
    bytes[24] === 0x01 &&
    bytes[25] === 0x2a
  ) {
    return {
      width: bytes.readUInt16LE(26) & 0x3fff,
      height: bytes.readUInt16LE(28) & 0x3fff,
    };
  }

  return null;
}

function detectImageFormat(bytes: Buffer): DetectedImageFormat | null {
  if (hasPngSignature(bytes)) {
    return {
      extension: '.png',
      dimensions: readPngHeaderDimensions(bytes),
    };
  }
  if (hasJpegSignature(bytes)) {
    return {
      extension: '.jpg',
      dimensions: readJpegHeaderDimensions(bytes),
    };
  }
  if (hasWebpSignature(bytes)) {
    return {
      extension: '.webp',
      dimensions: readWebpHeaderDimensions(bytes),
    };
  }
  return null;
}

function assertDroppedImageHeaderIsSafe(data: ArrayBuffer) {
  const detected = detectImageFormat(Buffer.from(data));
  if (!detected) {
    throw new Error('Please drop a PNG, JPEG, or WebP image.');
  }

  const dimensions = detected.dimensions;
  const pixels = dimensions ? dimensions.width * dimensions.height : 0;
  if (
    dimensions &&
    (
      dimensions.width > DESKTOP_DROPPED_IMAGE_MAX_DIMENSION_PX ||
      dimensions.height > DESKTOP_DROPPED_IMAGE_MAX_DIMENSION_PX ||
      pixels > DESKTOP_DROPPED_IMAGE_MAX_PIXELS
    )
  ) {
    throw new Error('Dropped images must be 12000 px or smaller per side and 40 megapixels or smaller.');
  }

  return detected.extension;
}

export async function storeDroppedImageHandler(
  payload: DesktopStoreDroppedImagePayload,
  assetDirectoryPath: string,
): Promise<string> {
  if (!payload || typeof payload.name !== 'string' || !(payload.data instanceof ArrayBuffer)) {
    throw new Error('Invalid image payload.');
  }

  const extension = imageExtensionForPayload(payload);
  if (!extension) {
    throw new Error('Please drop a PNG, JPEG, or WebP image.');
  }

  if (payload.data.byteLength > DESKTOP_DROPPED_IMAGE_MAX_BYTES) {
    throw new Error('Dropped images must be 20 MB or smaller.');
  }
  const detectedExtension = assertDroppedImageHeaderIsSafe(payload.data);

  await mkdir(assetDirectoryPath, { recursive: true });
  const tempPath = join(assetDirectoryPath, `.tmp-${randomUUID()}${detectedExtension}`);
  await writeFile(tempPath, Buffer.from(payload.data));

  const sourceStats = await stat(tempPath).catch(() => null);
  const endNormalize = startBenchmarkSpan({
    category: 'interaction',
    name: 'main.image.normalize',
    detail: {
      extension,
      detectedExtension,
      sourceBytes: sourceStats?.size ?? null,
    },
  });
  let normalizedImage: ReturnType<typeof normalizeDesktopImage>;
  try {
    normalizedImage = normalizeDesktopImage(tempPath);
    endNormalize({
      ok: true,
      outputBytes: normalizedImage.bytes.byteLength,
      outputExtension: normalizedImage.extension,
    });
  } catch (error) {
    endNormalize({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    await unlink(tempPath).catch(() => {});
  }

  const targetPath = join(assetDirectoryPath, `${randomUUID()}${normalizedImage.extension}`);
  await writeFile(targetPath, normalizedImage.bytes);
  return targetPath;
}
