import { ActionPackageIcon, ActionBoxesIcon } from '@icons/actions';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

export interface TaskGroup {
  action: string;
  supplierName: string | null;
  tasks: Array<{ id: string; skuId: string; skuName: string; batchOrderId?: string | null; childOrderId?: string | null }>;
}

export function BatchActionPrompt({
  open,
  rememberChoice,
  taskGroup,
  onBatchUpdate,
  onClose,
  onRememberChoiceChange,
  onUpdateIndividually,
}: {
  open: boolean;
  rememberChoice: boolean;
  taskGroup: TaskGroup;
  onBatchUpdate: () => void;
  onClose: () => void;
  onRememberChoiceChange: (checked: boolean) => void;
  onUpdateIndividually: () => void;
}) {
  if (!open) {
    return null;
  }

  const count = taskGroup.tasks.length;
  const supplierLabel = taskGroup.supplierName ?? 'Unknown supplier';

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 px-4 py-6"
      role="presentation"
      onClick={onClose}
    >
      <div
        aria-modal="true"
        className="w-full max-w-md rounded-[1.75rem] border border-border/70 bg-background p-6 shadow-[0_24px_80px_rgba(0,0,0,0.18)]"
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-lg font-semibold tracking-[-0.03em] text-foreground">
          {count} {count === 1 ? 'task' : 'tasks'} from {supplierLabel}
        </p>
        <div className="mt-2 text-sm leading-6 text-muted-foreground">
          {taskGroup.tasks.map((t) => t.skuName).join(', ')}
        </div>
        <label className="mt-5 flex items-start gap-3 rounded-[1.1rem] border border-border/70 bg-secondary/20 px-4 py-3 text-sm text-foreground">
          <Checkbox
            checked={rememberChoice}
            className="mt-0.5"
            onCheckedChange={(checked) => onRememberChoiceChange(checked === true)}
          />
          <span>Remember my choice for this action.</span>
        </label>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="outline" onClick={onUpdateIndividually}>
              <ActionPackageIcon className="size-4" />
              Update Alone
            </Button>
            <Button type="button" onClick={onBatchUpdate}>
              <ActionBoxesIcon className="size-4" />
              Batch Update
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
