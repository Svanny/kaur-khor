import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { SenaService } from '@shared/sena';
import { PageTitleWithBack } from '@/components/system/page-navigation';
import { WorkspaceActionRow, WorkspacePage, WorkspacePanel } from '@/components/system/workspace';
import { Button } from '@/components/ui/button';
import { emptySenaCatalog, linkedSkuIdsForService, upsertSenaService } from '@/lib/sena-catalog';
import { useInventory } from '@/state/inventory';

function emptyService(serviceId = ''): SenaService {
  return {
    serviceId,
    name: '',
    description: '',
    price: 0,
    bundle: false,
  };
}

export function ServiceFormRoute() {
  const navigate = useNavigate();
  const { serviceId } = useParams();
  const { catalog, isSaving, upsertSenaCatalog } = useInventory();
  const [form, setForm] = useState<SenaService>(() => emptyService(serviceId));
  const [selectedSkuIds, setSelectedSkuIds] = useState<string[]>([]);
  const editing = Boolean(serviceId);

  useEffect(() => {
    const existing = catalog?.services.find((entry) => entry.serviceId === serviceId);
    if (existing && catalog) {
      setForm(existing);
      setSelectedSkuIds(linkedSkuIdsForService(catalog, existing.serviceId));
    } else if (!editing) {
      setForm(emptyService(''));
      setSelectedSkuIds([]);
    }
  }, [catalog, editing, serviceId]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const baseCatalog = catalog ?? emptySenaCatalog();
    const normalized = {
      ...form,
      serviceId: form.serviceId.trim(),
      name: form.name.trim(),
      description: form.description.trim(),
    };
    const nextCatalog = upsertSenaService(baseCatalog, normalized, selectedSkuIds);
    await upsertSenaCatalog(nextCatalog);
    await navigate(`/catalog/services/${normalized.serviceId}`);
  }

  return (
    <WorkspacePage>
      <PageTitleWithBack>{editing ? 'Edit service' : 'New service'}</PageTitleWithBack>
      <WorkspacePanel description="Service editing now writes directly to the SENA catalog and sharing mask." title="Service">
        <form className="grid gap-4" onSubmit={(event) => void handleSubmit(event)}>
          <label className="grid gap-2 text-sm">
            <span>Service ID</span>
            <input
              className="rounded-xl border border-border bg-background px-3 py-2"
              disabled={editing}
              required
              value={form.serviceId}
              onChange={(event) =>
                setForm((current) => ({ ...current, serviceId: event.target.value }))
              }
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
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
            />
          </label>
          <label className="grid gap-2 text-sm">
            <span>Price</span>
            <input
              className="rounded-xl border border-border bg-background px-3 py-2"
              min="0"
              required
              step="0.01"
              type="number"
              value={form.price}
              onChange={(event) => setForm((current) => ({ ...current, price: Number(event.target.value) }))}
            />
          </label>
          <div className="grid gap-2 text-sm">
            <span>Linked SKUs</span>
            <div className="grid gap-2 rounded-xl border border-border bg-background p-3">
              {(catalog?.skus ?? []).map((sku) => (
                <label key={sku.skuId} className="flex items-center gap-3">
                  <input
                    checked={selectedSkuIds.includes(sku.skuId)}
                    type="checkbox"
                    onChange={(event) =>
                      setSelectedSkuIds((current) =>
                        event.target.checked
                          ? [...current, sku.skuId]
                          : current.filter((entry) => entry !== sku.skuId),
                      )
                    }
                  />
                  <span>{sku.name}</span>
                </label>
              ))}
              {catalog?.skus.length ? null : (
                <p className="text-muted-foreground">Add at least one SKU before linking services.</p>
              )}
            </div>
          </div>
          <WorkspaceActionRow>
            <Button disabled={isSaving} type="submit">
              {editing ? 'Save service' : 'Create service'}
            </Button>
          </WorkspaceActionRow>
        </form>
      </WorkspacePanel>
    </WorkspacePage>
  );
}
