import type { ComponentProps } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ActionCreatePackageIcon } from '@icons/actions';
import { Button } from '@/components/ui/button';
import { translateUiLiteral } from '@/lib/localization/translations';
import { buildKaurKhorNavigationState } from '@/state/navigation-history';
import { usePreferences } from '@/state/preferences';

type CreateFirstSkuButtonProps = Pick<ComponentProps<typeof Button>, 'className' | 'size' | 'variant'>;

export function CreateFirstSkuButton({
  className,
  size,
  variant = 'default',
}: CreateFirstSkuButtonProps) {
  const { language } = usePreferences();
  const location = useLocation();

  return (
    <Button asChild className={className} size={size} variant={variant}>
      <Link state={buildKaurKhorNavigationState(location, '/catalog')} to="/catalog/skus/new">
        <ActionCreatePackageIcon data-icon="inline-start" />
        {translateUiLiteral(language, 'Create first SKU')}
      </Link>
    </Button>
  );
}
