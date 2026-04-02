import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { SenaSku } from '@shared/sena';
import { PageTitleWithBack } from '@/components/system/page-navigation';
import { WorkspaceActionRow, WorkspacePage, WorkspacePanel } from '@/components/system/workspace';
import { Button } from '@/components/ui/button';
import { emptySenaCatalog, upsertSenaSku } from '@/lib/sena-catalog';
import { useInventory } from '@/state/inventory';

function emptySku(skuId = ''): SenaSku {
  return {
    skuId,
    name: '',
    description: '',
    costPerUnit: 0,
    soldAsProduct: false,
    productPrice: null,
    leadTimeMeanDaysHint: null,
    leadTimeStdDaysHint: null,
  };
}

export function SkuFormRoute() {
  const navigate = useNavigate();
  const { skuId } = useParams();
  const { catalog, isSaving, upsertSenaCatalog } = useInventory();
  const [form, setForm] = useState<SenaSku>(() => emptySku(skuId));
  const editing = Boolean(skuId);

  useEffect(() => {
    const existing = catalog?.skus.find((entry) => entry.skuId === skuId);
    if (existing) {
      setForm(existing);
    } else if (!editing) {
      setForm(emptySku(''));
    }
  }, [catalog, editing, skuId]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const baseCatalog = catalog ?? emptySenaCatalog();
    const normalized = {
      ...form,
      skuId: form.skuId.trim(),
      name: form.name.trim(),
      description: form.description.trim(),
    };
    const nextCatalog = upsertSenaSku(baseCatalog, normalized);
    await upsertSenaCatalog(nextCatalog);
    await navigate(`/catalog/skus/${normalized.skuId}`);
  }

  return (
    <WorkspacePage>
      <PageTitleWithBack>{editing ? 'Edit SKU' : 'New SKU'}</PageTitleWithBack>
      <WorkspacePanel description="SKU editing now writes directly to the SENA catalog." title="SKU">
        <form className="grid gap-4" onSubmit={(event) => void handleSubmit(event)}>
          <label className="grid gap-2 text-sm">
            <span>SKU ID</span>
            <input
              className="rounded-xl border border-border bg-background px-3 py-2"
              disabled={editing}
              required
              value={form.skuId}
              onChange={(event) => setForm((current) => ({ ...current, skuId: event.target.value }))}
            />
          </label>
          <label className="grid gap-2 text-sm">
            <span>Name</span>
            <input
              className="rounded-xl border border-border bg-background px-3 py-2"
              required
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
          </label>
          <label className="grid gap-2 text-sm">
            <span>Description</span>
            <textarea
              className="min-h-24 rounded-xl border border-border bg-background px-3 py-2"
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            />
          </label>
          <label className="grid gap-2 text-sm">
            <span>Cost per unit</span>
            <input
              className="rounded-xl border border-border bg-background px-3 py-2"
              min="0"
              required
              step="0.01"
              type="number"
              value={form.costPerUnit}
              onChange={(event) =>
                setForm((current) => ({ ...current, costPerUnit: Number(event.target.value) }))
              }
            />
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input
              checked={form.soldAsProduct}
              type="checkbox"
              onChange={(event) =>
                setForm((current) => ({ ...current, soldAsProduct: event.target.checked }))
              }
            />
            <span>Sold directly as a retail product</span>
          </label>
          <label className="grid gap-2 text-sm">
            <span>Retail price</span>
            <input
              className="rounded-xl border border-border bg-background px-3 py-2"
              min="0"
              step="0.01"
              type="number"
              value={form.productPrice ?? ''}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  productPrice: event.target.value ? Number(event.target.value) : null,
                }))
              }
            />
          </label>
          <WorkspaceActionRow>
            <Button disabled={isSaving} type="submit">
              {editing ? 'Save SKU' : 'Create SKU'}
            </Button>
          </WorkspaceActionRow>
        </form>
      </WorkspacePanel>
    </WorkspacePage>
  );
}
