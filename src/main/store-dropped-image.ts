import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DesktopStoreDroppedImagePayload } from '@shared/ipc';
import { normalizeDesktopImage } from './desktop-image';
import { startBenchmarkSpan } from './benchmark';

const DESKTOP_ALLOWED_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

export async function storeDroppedImageHandler(
  payload: DesktopStoreDroppedImagePayload,
  assetDirectoryPath: string,
): Promise<string> {
  if (!payload || typeof payload.name !== 'string' || !(payload.data instanceof ArrayBuffer)) {
    throw new Error('Invalid image payload.');
  }

  const extension = extname(payload.name).toLowerCase();
  if (!DESKTOP_ALLOWED_IMAGE_EXTENSIONS.has(extension)) {
    throw new Error('Please drop a PNG, JPEG, or WebP image.');
  }

  await mkdir(assetDirectoryPath, { recursive: true });
  const tempPath = join(assetDirectoryPath, `.tmp-${randomUUID()}${extension}`);
  await writeFile(tempPath, Buffer.from(payload.data));

  const sourceStats = await stat(tempPath).catch(() => null);
  const endNormalize = startBenchmarkSpan({
    category: 'interaction',
    name: 'main.image.normalize',
    detail: {
      extension,
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
