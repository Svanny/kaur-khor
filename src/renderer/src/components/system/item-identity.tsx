import { useEffect, useState, type ReactNode } from 'react';
import { EntityServiceIcon, EntitySkuIcon } from '@icons/entities';
import { usePreferences } from '@/state/preferences';
import { cn } from '@/lib/utils';

type ItemIdentityType = 'sku' | 'service';
type ItemIdentitySize = 'compact' | 'default' | 'hero';
type ItemIdentityAlign = 'start' | 'center';

function imageModeClassName(
  mode: ReturnType<typeof usePreferences>['itemImageMode'],
  size: ItemIdentitySize,
) {
  if (mode === 'off') {
    return null;
  }

  const sizeMap = {
    compact: {
      thumbnail: 'size-8 rounded-lg',
      small: 'size-10 rounded-xl',
      medium: 'size-12 rounded-xl',
    },
    default: {
      thumbnail: 'size-10 rounded-xl',
      small: 'size-12 rounded-2xl',
      medium: 'size-16 rounded-2xl',
    },
    hero: {
      thumbnail: 'size-14 rounded-2xl',
      small: 'size-20 rounded-[1.5rem]',
      medium: 'size-24 rounded-[1.75rem]',
    },
  } as const;

  return sizeMap[size][mode];
}

function filePathToUrl(imagePath: string) {
  const trimmed = imagePath.trim();
  if (!trimmed) {
    return null;
  }

  if (/^(banji-asset|https?|data|blob):/i.test(trimmed)) {
    return trimmed;
  }

  const normalizedPath = trimmed.replace(/\\/g, '/');
  const assetName = normalizedPath.split('/').pop();
  if (!assetName) {
    return null;
  }

  return `banji-asset://local/${encodeURIComponent(assetName)}`;
}

function fallbackIcon(type: ItemIdentityType) {
  return type === 'service' ? EntityServiceIcon : EntitySkuIcon;
}

export function ItemAvatar({
  imagePath,
  name,
  size = 'default',
  type,
}: {
  imagePath?: string | null;
  name: string;
  size?: ItemIdentitySize;
  type: ItemIdentityType;
}) {
  const { itemImageMode } = usePreferences();
  const containerClassName = imageModeClassName(itemImageMode, size);
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => {
    setImageFailed(false);
  }, [imagePath]);

  if (!containerClassName) {
    return null;
  }

  const FallbackIcon = fallbackIcon(type);
  const imageUrl = imagePath?.trim() ? filePathToUrl(imagePath) : null;
  const showImage = Boolean(imageUrl) && !imageFailed;

  return (
    <div
      className={cn(
        'relative shrink-0 overflow-hidden border border-border/70 bg-muted/35 text-muted-foreground shadow-sm',
        containerClassName,
      )}
    >
      {showImage ? (
        <img
          alt=""
          className="size-full object-cover"
          loading="lazy"
          src={imageUrl ?? undefined}
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className="flex size-full items-center justify-center" title={name}>
          <FallbackIcon className="size-5" />
        </div>
      )}
    </div>
  );
}

export function ItemIdentityBlock({
  align = 'start',
  children,
  className,
  description,
  imagePath,
  metadata,
  name,
  nameClassName,
  secondary,
  size = 'default',
  type,
}: {
  align?: ItemIdentityAlign;
  children?: ReactNode;
  className?: string;
  description?: ReactNode;
  imagePath?: string | null;
  metadata?: ReactNode;
  name: ReactNode;
  nameClassName?: string;
  secondary?: ReactNode;
  size?: ItemIdentitySize;
  type: ItemIdentityType;
}) {
  const { itemImageMode } = usePreferences();
  const showAvatar = itemImageMode !== 'off';

  return (
    <div
      className={cn(
        'flex min-w-0',
        align === 'center' ? 'items-center' : 'items-start',
        showAvatar ? 'gap-3' : undefined,
        className,
      )}
    >
      <ItemAvatar imagePath={imagePath} name={typeof name === 'string' ? name : ''} size={size} type={type} />
      <div className="min-w-0">
        <div className={cn('block font-medium text-foreground', nameClassName)}>{name}</div>
        {description ? <div className="mt-1 text-sm text-muted-foreground">{description}</div> : null}
        {secondary || metadata || children ? (
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {secondary ? <span className="text-xs text-muted-foreground">{secondary}</span> : null}
            {metadata}
            {children}
          </div>
        ) : null}
      </div>
    </div>
  );
}
