import { ServiceMutationActions } from '@/routes/catalog-item-actions';
import type { ServiceActionValue } from '@/lib/navigation-state';
import type { ServiceDetailViewModel } from './view-model';

export function ServiceDetailActions({
  actions,
  mode,
  onModeChange,
  onComplete,
}: {
  actions: ServiceDetailViewModel['actions'];
  mode?: ServiceActionValue | null;
  onModeChange?: (mode: ServiceActionValue | null) => void;
  onComplete: () => Promise<void>;
}) {
  return (
    <ServiceMutationActions
      actions={actions}
      mode={mode}
      onModeChange={onModeChange}
      onComplete={onComplete}
    />
  );
}
