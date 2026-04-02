import { useEffect, useState } from 'react';
import type { SenaStockSnapshot } from '@shared/sena';
import { PageTitleWithBack } from '@/components/system/page-navigation';
import { WorkspaceActionRow, WorkspacePage, WorkspacePanel } from '@/components/system/workspace';
import { Button } from '@/components/ui/button';
import { emptySenaCatalog } from '@/lib/sena-catalog';
import { useInventory } from '@/state/inventory';

function buildInitialRows(catalog = emptySenaCatalog()) {
  return catalog.skus.map<SenaStockSnapshot>((sku) => ({
    skuId: sku.skuId,
    costPerUnit: sku.costPerUnit,
    productPrice: sku.productPrice,
    unitsInStock: 0,
  }));
}

export function StockUpdateSessionRoute() {
  const { catalog, ingestSenaObservation, isSaving } = useInventory();
  const [observedAt, setObservedAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [notes, setNotes] = useState('');
  const [rows, setRows] = useState(() => buildInitialRows(catalog ?? emptySenaCatalog()));

  useEffect(() => {
    setRows(buildInitialRows(catalog ?? emptySenaCatalog()));
  }, [catalog]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await ingestSenaObservation({
      observedAt: new Date(observedAt).toISOString(),
      leadTimeHints: [],
      notes: notes.trim() || null,
      orderSignals: [],
      retailPrices: [],
      retailRankings: [],
      retailStockouts: [],
      servicePrices: [],
      serviceRankings: [],
      serviceStockouts: [],
      stockSnapshot: rows,
    });
    setNotes('');
  }

  return (
    <WorkspacePage>
      <PageTitleWithBack>New observation</PageTitleWithBack>
      <WorkspacePanel
        title="Observation package"
        description="Capture one interval evidence package with a stock snapshot and optional notes. Additional signals can be layered in later."
      >
        <form className="grid gap-4" onSubmit={(event) => void handleSubmit(event)}>
          <label className="grid gap-2 text-sm">
            <span>Observed at</span>
            <input
              className="rounded-xl border border-border bg-background px-3 py-2"
              required
              type="datetime-local"
              value={observedAt}
              onChange={(event) => setObservedAt(event.target.value)}
            />
          </label>

          <div className="grid gap-3">
            {rows.map((row, index) => {
              const sku = catalog?.skus.find((entry) => entry.skuId === row.skuId);
              return (
                <div
                  key={row.skuId}
                  className="grid gap-3 rounded-[1.25rem] border border-border/70 bg-background/70 p-4 md:grid-cols-3"
                >
                  <div className="md:col-span-3">
                    <p className="font-medium text-foreground">{sku?.name ?? row.skuId}</p>
                  </div>
                  <label className="grid gap-2 text-sm">
                    <span>Units in stock</span>
                    <input
                      className="rounded-xl border border-border bg-background px-3 py-2"
                      min="0"
                      required
                      step="1"
                      type="number"
                      value={row.unitsInStock}
                      onChange={(event) =>
                        setRows((current) =>
                          current.map((entry, entryIndex) =>
                            entryIndex === index
                              ? { ...entry, unitsInStock: Number(event.target.value) }
                              : entry,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="grid gap-2 text-sm">
                    <span>Cost per unit</span>
                    <input
                      className="rounded-xl border border-border bg-background px-3 py-2"
                      min="0"
                      step="0.01"
                      type="number"
                      value={row.costPerUnit ?? ''}
                      onChange={(event) =>
                        setRows((current) =>
                          current.map((entry, entryIndex) =>
                            entryIndex === index
                              ? {
                                  ...entry,
                                  costPerUnit: event.target.value ? Number(event.target.value) : null,
                                }
                              : entry,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="grid gap-2 text-sm">
                    <span>Retail price</span>
                    <input
                      className="rounded-xl border border-border bg-background px-3 py-2"
                      min="0"
                      step="0.01"
                      type="number"
                      value={row.productPrice ?? ''}
                      onChange={(event) =>
                        setRows((current) =>
                          current.map((entry, entryIndex) =>
                            entryIndex === index
                              ? {
                                  ...entry,
                                  productPrice: event.target.value ? Number(event.target.value) : null,
                                }
                              : entry,
                          ),
                        )
                      }
                    />
                  </label>
                </div>
              );
            })}
          </div>

          <label className="grid gap-2 text-sm">
            <span>Notes</span>
            <textarea
              className="min-h-24 rounded-xl border border-border bg-background px-3 py-2"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
          <WorkspaceActionRow>
            <Button disabled={isSaving || rows.length === 0} type="submit">
              Save observation
            </Button>
          </WorkspaceActionRow>
        </form>
      </WorkspacePanel>
    </WorkspacePage>
  );
}
