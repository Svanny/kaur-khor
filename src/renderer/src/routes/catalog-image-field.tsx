import { useState } from 'react';
import { ActionDeleteIcon, ActionEditIcon } from '@icons/actions';
import { ItemAvatar } from '@/components/system/item-identity';
import { Button } from '@/components/ui/button';
import { translateUiLiteral } from '@/lib/translations';
import { cn } from '@/lib/utils';
import { usePreferences } from '@/state/preferences';
import { EditorField } from './editor-form-primitives';

const SUPPORTED_INGEST_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const SUPPORTED_INGEST_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

function isSupportedImageType(type: string): boolean {
  return SUPPORTED_INGEST_IMAGE_TYPES.has(type);
}

function hasSupportedImageExtension(name: string): boolean {
  const normalizedName = name.toLowerCase();
  return Array.from(SUPPORTED_INGEST_IMAGE_EXTENSIONS).some((extension) => normalizedName.endsWith(extension));
}

function isSupportedImageFile(file: File): boolean {
  return isSupportedImageType(file.type) || hasSupportedImageExtension(file.name);
}

function imageIngestErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Could not store this image.';
}

function findClipboardImageFile(clipboardData: DataTransfer): File | null {
  const files = Array.from(clipboardData.files);
  const imageFile = files.find((file) => isSupportedImageFile(file));
  if (imageFile) {
    return imageFile;
  }

  if (!clipboardData.items) {
    return null;
  }

  for (const item of Array.from(clipboardData.items)) {
    if (item.kind === 'file') {
      const file = item.getAsFile();
      if (file && (isSupportedImageType(item.type) || isSupportedImageFile(file))) {
        return file;
      }
    }
  }

  return null;
}

export function CatalogImageField({
  helper,
  imagePath,
  label,
  name,
  type,
  onChange,
}: {
  helper: string;
  imagePath?: string | null;
  label: string;
  name: string;
  type: 'sku' | 'service';
  onChange: (value: string | null) => void;
}) {
  const { language } = usePreferences();
  const [busy, setBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function storeImageFile(imageFile: File) {
    setBusy(true);
    setError(null);
    try {
      const arrayBuffer = await imageFile.arrayBuffer();
      const nextImagePath = await window.banjiDesktop.system.storeDroppedImage({
        name: imageFile.name || 'clipboard-image.png',
        type: imageFile.type,
        data: arrayBuffer,
      });
      if (nextImagePath) {
        onChange(nextImagePath);
      }
    } catch (nextError) {
      setError(imageIngestErrorMessage(nextError));
    } finally {
      setBusy(false);
    }
  }

  async function handleChooseImage() {
    setBusy(true);
    setError(null);
    try {
      const nextImagePath = await window.banjiDesktop.system.pickAndStoreImage();
      if (nextImagePath) {
        onChange(nextImagePath);
      }
    } catch (nextError) {
      setError(imageIngestErrorMessage(nextError));
    } finally {
      setBusy(false);
    }
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(true);
  }

  function handleDragLeave(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
  }

  async function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);

    const files = Array.from(event.dataTransfer.files);
    const imageFile = files.find((file) => isSupportedImageFile(file));
    if (!imageFile) {
      return;
    }

    await storeImageFile(imageFile);
  }

  async function handlePaste(event: React.ClipboardEvent<HTMLDivElement>) {
    const imageFile = findClipboardImageFile(event.clipboardData);
    if (!imageFile) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    await storeImageFile(imageFile);
  }

  return (
    <EditorField
      error={error ?? undefined}
      helper={translateUiLiteral(language, helper)}
      label={translateUiLiteral(language, label)}
    >
      <div
        className={cn(
          'flex flex-col gap-3 rounded-[1.25rem] border border-border/70 bg-muted/20 p-4 sm:flex-row sm:items-center transition-colors',
          dragActive && 'border-primary bg-primary/5',
        )}
        data-testid="catalog-image-dropzone"
        tabIndex={0}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onPaste={handlePaste}
      >
        <ItemAvatar imagePath={imagePath} name={name} size="default" type={type} />
        <div className="grid gap-2">
          <div className="text-sm text-muted-foreground">
            {imagePath
              ? translateUiLiteral(language, 'Picture shows anywhere this item identity appears.')
              : translateUiLiteral(language, 'No picture selected.')}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} type="button" variant="outline" onClick={() => void handleChooseImage()}>
              <ActionEditIcon className="size-4" />
              {imagePath ? translateUiLiteral(language, 'Replace image') : translateUiLiteral(language, 'Choose image')}
            </Button>
            {imagePath ? (
              <Button disabled={busy} type="button" variant="destructive-outline" onClick={() => onChange(null)}>
                <ActionDeleteIcon className="size-4" />
                {translateUiLiteral(language, 'Remove image')}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </EditorField>
  );
}
