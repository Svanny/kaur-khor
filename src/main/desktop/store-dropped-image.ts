import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DesktopStoreDroppedImagePayload } from '@shared/ipc';
import { normalizeDesktopImage } from './desktop-image';
import { assertDesktopImageBytesAreSafeForImport } from './desktop-image-import';
import { startBenchmarkSpan } from '../benchmark/benchmark';

const DESKTOP_ALLOWED_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const DESKTOP_IMAGE_EXTENSION_BY_TYPE = new Map([
  ['image/png', '.png'],
  ['image/jpeg', '.jpg'],
  ['image/webp', '.webp'],
]);

function imageExtensionForPayload(payload: DesktopStoreDroppedImagePayload) {
  const extension = extname(payload.name).toLowerCase();
  if (DESKTOP_ALLOWED_IMAGE_EXTENSIONS.has(extension)) {
    return extension;
  }

  return DESKTOP_IMAGE_EXTENSION_BY_TYPE.get(payload.type?.toLowerCase() ?? '') ?? null;
}

export async function storeDroppedImageHandler(
  payload: DesktopStoreDroppedImagePayload,
  assetDirectoryPath: string,
): Promise<string> {
  if (
    !payload ||
    typeof payload.name !== 'string' ||
    (payload.type !== undefined && typeof payload.type !== 'string') ||
    !(payload.data instanceof ArrayBuffer)
  ) {
    throw new Error('Invalid image payload.');
  }

  const extension = imageExtensionForPayload(payload);
  if (!extension) {
    throw new Error('Please drop a PNG, JPEG, or WebP image.');
  }

  const detectedExtension = assertDesktopImageBytesAreSafeForImport(payload.data);

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
  let normalizedImage: Awaited<ReturnType<typeof normalizeDesktopImage>>;
  try {
    normalizedImage = await normalizeDesktopImage(tempPath);
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
