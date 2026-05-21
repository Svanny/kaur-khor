import { buildLeadTimeHintFromInputs, SkuMutationActions } from '@/routes/inventory/catalog-item-actions';
import type { SenaSkuDetailViewModel } from './view-model';
import type { SkuActionValue } from '@/lib/navigation/navigation-state';

export { buildLeadTimeHintFromInputs };

export function SkuDetailActions({
  actionContext,
  mode,
  onModeChange,
  skuId,
  onComplete,
}: {
  actionContext: SenaSkuDetailViewModel['actionContext'];
  mode?: SkuActionValue | null;
  onModeChange?: (mode: SkuActionValue | null) => void;
  skuId: string;
  onComplete: () => Promise<void>;
}) {
  return (
    <SkuMutationActions
      actionContext={actionContext}
      mode={mode}
      onModeChange={onModeChange}
      skuId={skuId}
      onComplete={onComplete}
    />
  );
}
