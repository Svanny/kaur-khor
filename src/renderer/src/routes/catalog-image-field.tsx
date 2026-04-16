import { useState } from 'react';
import { ActionDeleteIcon, ActionEditIcon } from '@icons/actions';
import { ItemAvatar } from '@/components/system/item-identity';
import { Button } from '@/components/ui/button';
import { EditorField } from './editor-form-primitives';

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
  const [busy, setBusy] = useState(false);

  async function handleChooseImage() {
    setBusy(true);
    try {
      const nextImagePath = await window.banjiDesktop.system.pickAndStoreImage();
      if (nextImagePath) {
        onChange(nextImagePath);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <EditorField helper={helper} label={label}>
      <div className="flex flex-col gap-3 rounded-[1.25rem] border border-border/70 bg-muted/20 p-4 sm:flex-row sm:items-center">
        <ItemAvatar imagePath={imagePath} name={name} size="default" type={type} />
        <div className="grid gap-2">
          <div className="text-sm text-muted-foreground">
            {imagePath ? 'Picture shows anywhere this item identity appears.' : 'No picture selected.'}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} type="button" variant="outline" onClick={() => void handleChooseImage()}>
              <ActionEditIcon className="size-4" />
              {imagePath ? 'Replace image' : 'Choose image'}
            </Button>
            {imagePath ? (
              <Button disabled={busy} type="button" variant="destructive-outline" onClick={() => onChange(null)}>
                <ActionDeleteIcon className="size-4" />
                Remove image
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </EditorField>
  );
}
