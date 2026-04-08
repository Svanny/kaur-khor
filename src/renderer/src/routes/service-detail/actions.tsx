import { ServiceMutationActions } from '@/routes/catalog-item-actions';
import type { ServiceDetailViewModel } from './view-model';

export function ServiceDetailActions({
  actions,
  onComplete,
}: {
  actions: ServiceDetailViewModel['actions'];
  onComplete: () => Promise<void>;
}) {
  return (
    <ServiceMutationActions
      actions={actions}
      onComplete={onComplete}
    />
  );
}
