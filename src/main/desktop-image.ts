import { basename, extname } from 'node:path';
import { readFile } from 'node:fs/promises';
import { nativeImage } from 'electron';

export const DESKTOP_IMAGE_MAX_DIMENSION_PX = 1600;
export const DESKTOP_IMAGE_TARGET_MAX_BYTES = 1_500_000;
const DESKTOP_IMAGE_SCALE_STEPS = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.25] as const;
const DESKTOP_IMAGE_JPEG_QUALITY_STEPS = [88, 80, 72, 64, 56, 48] as const;

function normalizeDesktopImageExtension(sourcePath: string) {
  const extension = extname(sourcePath).toLowerCase();
  if (extension === '.png' || extension === '.webp') {
    return '.png' as const;
  }
  if (extension === '.jpg' || extension === '.jpeg') {
    return '.jpg' as const;
  }
  return null;
}

function computeDesktopImageDimensions(width: number, height: number, scaleStep: number) {
  const maxEdge = Math.max(width, height);
  const boundedScale = Math.min(1, DESKTOP_IMAGE_MAX_DIMENSION_PX / maxEdge);
  const effectiveScale = Math.min(1, boundedScale * scaleStep);

  return {
    width: Math.max(1, Math.round(width * effectiveScale)),
    height: Math.max(1, Math.round(height * effectiveScale)),
  };
}

function encodeDesktopImage(
  image: Electron.NativeImage,
  targetExtension: '.png' | '.jpg',
  jpegQuality?: number,
) {
  return targetExtension === '.png' ? image.toPNG() : image.toJPEG(jpegQuality ?? 80);
}

export function normalizeDesktopImage(sourcePath: string) {
  const targetExtension = normalizeDesktopImageExtension(sourcePath);
  if (!targetExtension) {
    throw new Error('Please choose a PNG, JPEG, or WebP image.');
  }

  const importedImage = nativeImage.createFromPath(sourcePath);
  if (importedImage.isEmpty()) {
    throw new Error('banji could not read that image file.');
  }

  const { width, height } = importedImage.getSize();
  if (width <= 0 || height <= 0) {
    throw new Error('banji could not determine the image dimensions.');
  }

  let bestBytes = encodeDesktopImage(importedImage, targetExtension);

  for (const scaleStep of DESKTOP_IMAGE_SCALE_STEPS) {
    const dimensions = computeDesktopImageDimensions(width, height, scaleStep);
    const resizedImage = importedImage.resize(dimensions);

    if (targetExtension === '.png') {
      const pngBytes = encodeDesktopImage(resizedImage, '.png');
      if (pngBytes.byteLength < bestBytes.byteLength) {
        bestBytes = pngBytes;
      }
      if (pngBytes.byteLength <= DESKTOP_IMAGE_TARGET_MAX_BYTES) {
        return { bytes: pngBytes, extension: '.png' as const };
      }
      continue;
    }

    for (const jpegQuality of DESKTOP_IMAGE_JPEG_QUALITY_STEPS) {
      const jpegBytes = encodeDesktopImage(resizedImage, '.jpg', jpegQuality);
      if (jpegBytes.byteLength < bestBytes.byteLength) {
        bestBytes = jpegBytes;
      }
      if (jpegBytes.byteLength <= DESKTOP_IMAGE_TARGET_MAX_BYTES) {
        return { bytes: jpegBytes, extension: '.jpg' as const };
      }
    }
  }

  return { bytes: bestBytes, extension: targetExtension };
}

export async function prepareDesktopImageUpload(sourcePath: string) {
  const sourceBytes = await readFile(sourcePath);
  const normalizedExtension = normalizeDesktopImageExtension(sourcePath);
  if (!normalizedExtension) {
    return {
      bytes: sourceBytes,
      filename: basename(sourcePath),
    };
  }

  const importedImage = nativeImage.createFromPath(sourcePath);
  if (importedImage.isEmpty()) {
    return {
      bytes: sourceBytes,
      filename: basename(sourcePath),
    };
  }

  const { width, height } = importedImage.getSize();
  const shouldCompress = width > DESKTOP_IMAGE_MAX_DIMENSION_PX
    || height > DESKTOP_IMAGE_MAX_DIMENSION_PX
    || sourceBytes.byteLength > DESKTOP_IMAGE_TARGET_MAX_BYTES;

  if (!shouldCompress) {
    return {
      bytes: sourceBytes,
      filename: basename(sourcePath),
    };
  }

  const normalized = normalizeDesktopImage(sourcePath);
  return {
    bytes: normalized.bytes,
    filename: `${basename(sourcePath, extname(sourcePath))}-telegram${normalized.extension}`,
  };
}
