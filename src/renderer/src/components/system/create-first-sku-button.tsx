import type { ComponentProps } from 'react';
import { Link } from 'react-router-dom';
import { ActionCreatePackageIcon } from '@icons/actions';
import { Button } from '@/components/ui/button';
import { translateUiLiteral } from '@/lib/translations';
import { usePreferences } from '@/state/preferences';

type CreateFirstSkuButtonProps = Pick<ComponentProps<typeof Button>, 'className' | 'size' | 'variant'>;

export function CreateFirstSkuButton({
  className,
  size,
  variant = 'default',
}: CreateFirstSkuButtonProps) {
  const { language } = usePreferences();

  return (
    <Button asChild className={className} size={size} variant={variant}>
      <Link to="/catalog/skus/new">
        <ActionCreatePackageIcon data-icon="inline-start" />
        {translateUiLiteral(language, 'Create first SKU')}
      </Link>
    </Button>
  );
}
