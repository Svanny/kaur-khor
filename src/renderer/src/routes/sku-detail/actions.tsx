import { buildLeadTimeHintFromInputs, SkuMutationActions } from '@/routes/catalog-item-actions';
import type { SenaSkuDetailViewModel } from './view-model';

export { buildLeadTimeHintFromInputs };

export function SkuDetailActions({
  actionContext,
  skuId,
  onComplete,
}: {
  actionContext: SenaSkuDetailViewModel['actionContext'];
  skuId: string;
  onComplete: () => Promise<void>;
}) {
  return (
    <SkuMutationActions
      actionContext={actionContext}
      skuId={skuId}
      onComplete={onComplete}
    />
  );
}
