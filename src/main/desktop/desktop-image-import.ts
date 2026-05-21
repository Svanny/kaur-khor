import { readFile, stat } from 'node:fs/promises';

const DESKTOP_IMAGE_MAX_IMPORT_BYTES = 20 * 1024 * 1024;
const DESKTOP_IMAGE_MAX_IMPORT_DIMENSION_PX = 12_000;
const DESKTOP_IMAGE_MAX_IMPORT_PIXELS = 40_000_000;
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

export type DetectedDesktopImageFormat = {
  extension: '.png' | '.jpg' | '.webp';
  dimensions: ImageHeaderDimensions | null;
};

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

export function detectDesktopImageFormat(bytes: Buffer): DetectedDesktopImageFormat | null {
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

export function assertDesktopImageBytesAreSafeForImport(data: ArrayBuffer | Buffer) {
  if (data.byteLength > DESKTOP_IMAGE_MAX_IMPORT_BYTES) {
    throw new Error('Images must be 20 MB or smaller.');
  }

  const detected = detectDesktopImageFormat(Buffer.isBuffer(data) ? data : Buffer.from(new Uint8Array(data)));
  if (!detected) {
    throw new Error('Please choose a PNG, JPEG, or WebP image.');
  }

  const dimensions = detected.dimensions;
  if (!dimensions) {
    throw new Error('Images must be 12000 px or smaller per side and 40 megapixels or smaller.');
  }
  const pixels = dimensions ? dimensions.width * dimensions.height : 0;
  if (
    dimensions &&
    (
      dimensions.width < 1 ||
      dimensions.height < 1 ||
      dimensions.width > DESKTOP_IMAGE_MAX_IMPORT_DIMENSION_PX ||
      dimensions.height > DESKTOP_IMAGE_MAX_IMPORT_DIMENSION_PX ||
      pixels > DESKTOP_IMAGE_MAX_IMPORT_PIXELS
    )
  ) {
    throw new Error('Images must be 12000 px or smaller per side and 40 megapixels or smaller.');
  }

  return detected.extension;
}

export async function assertDesktopImageFileIsSafeForImport(sourcePath: string) {
  const sourceStats = await stat(sourcePath);
  if (!sourceStats.isFile()) {
    throw new Error('Please choose a PNG, JPEG, or WebP image.');
  }
  if (sourceStats.size > DESKTOP_IMAGE_MAX_IMPORT_BYTES) {
    throw new Error('Images must be 20 MB or smaller.');
  }

  return assertDesktopImageBytesAreSafeForImport(await readFile(sourcePath));
}
