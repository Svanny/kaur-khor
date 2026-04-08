import { useEffect, useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ClipboardPlus, PackageCheck, Plus, Save, Trash2 } from 'lucide-react';
import type { SenaCatalog, SenaStockSnapshot } from '@shared/sena';
import { StepWizard } from '@/components/system/step-wizard';
import { WorkspaceActionRow, WorkspacePage, WorkspacePanel, WorkspaceTitleCard } from '@/components/system/workspace';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { rowHoverClassName } from '@/lib/interactive-surface';
import { cn } from '@/lib/utils';
import { useInventory } from '@/state/inventory';
import { formatSenaDateTime, formatSenaLongDate } from './sku-detail/format';
import {
  createEmptyObservationInput,
  hasStructuredObservationSignal,
  intervalDaysBetween,
  latestObservationAt,
  observationCompositionParts,
} from './observation-payload';

type StockView = 'priority' | 'counted' | 'all';
type PriceEventType = 'retail' | 'service';
type StockoutEventType = 'retail' | 'service';
type StockUpdateStepId = 'context' | 'stock' | 'events' | 'rankings' | 'review';

interface StockRow extends SenaStockSnapshot {
  touched: boolean;
}

interface OrderEvent {
  id: string;
  skuId: string;
  quantity: string;
}

interface ReceiptEvent {
  id: string;
  skuId: string;
  quantity: string;
  costPerUnit: string;
}

interface PriceEvent {
  id: string;
  type: PriceEventType;
  entityId: string;
  price: string;
}

interface StockoutEvent {
  id: string;
  type: StockoutEventType;
  entityId: string;
}

interface CorrectionEvent {
  id: string;
  skuId: string;
  quantityDelta: string;
  reason: string;
}

const STOCK_VIEW_OPTIONS: Array<{ value: StockView; label: string }> = [
  { value: 'priority', label: 'Priority' },
  { value: 'counted', label: 'Counted' },
  { value: 'all', label: 'All SKUs' },
];

const STOCK_UPDATE_STEP_ORDER: StockUpdateStepId[] = ['context', 'stock', 'events', 'rankings', 'review'];

const STOCK_UPDATE_STEP_COPY: Record<StockUpdateStepId, { title: string; description: string }> = {
  context: {
    title: 'Interval and context',
    description: 'Confirm when this real-world update was observed.',
  },
  stock: {
    title: 'Stock count',
    description: 'Count only the SKUs you actually checked.',
  },
  events: {
    title: 'Real-world events',
    description: 'Capture interval events such as orders, receipts, and price changes.',
  },
  rankings: {
    title: 'Sellability and ranking signals',
    description: 'Add ranking changes only when real demand order shifted.',
  },
  review: {
    title: 'Review and save',
    description: 'Check the sparse payload summary before saving.',
  },
};

function localDateTimeInputValue(value: string | null) {
  if (!value) {
    return new Date().toISOString().slice(0, 16);
  }
  return new Date(value).toISOString().slice(0, 16);
}

function dateTimeInputToIso(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function eventId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function latestStockBySku(catalog: SenaCatalog | null, observations: ReturnType<typeof useInventory>['observations']) {
  const latest = [...observations].sort(
    (left, right) => new Date(right.input.observedAt).getTime() - new Date(left.input.observedAt).getTime(),
  );
  const stockBySku = new Map<string, SenaStockSnapshot>();
  for (const observation of latest) {
    for (const snapshot of observation.input.stockSnapshot) {
      if (!stockBySku.has(snapshot.skuId)) {
        stockBySku.set(snapshot.skuId, snapshot);
      }
    }
  }
  return new Map(
    (catalog?.skus ?? []).map((sku) => [
      sku.skuId,
      stockBySku.get(sku.skuId) ?? {
        skuId: sku.skuId,
        unitsInStock: 0,
        costPerUnit: sku.costPerUnit,
        productPrice: sku.productPrice,
      },
    ]),
  );
}

function latestCountedAtBySku(observations: ReturnType<typeof useInventory>['observations']) {
  const values = new Map<string, string>();
  const latest = [...observations].sort(
    (left, right) => new Date(right.input.observedAt).getTime() - new Date(left.input.observedAt).getTime(),
  );
  for (const observation of latest) {
    for (const snapshot of observation.input.stockSnapshot) {
      if (!values.has(snapshot.skuId)) {
        values.set(snapshot.skuId, observation.input.observedAt);
      }
    }
  }
  return values;
}

function buildInitialRows(catalog: SenaCatalog | null, observations: ReturnType<typeof useInventory>['observations']) {
  const stockBySku = latestStockBySku(catalog, observations);
  return (catalog?.skus ?? []).map<StockRow>((sku) => ({
    ...(stockBySku.get(sku.skuId) ?? {
      skuId: sku.skuId,
      unitsInStock: 0,
      costPerUnit: sku.costPerUnit,
      productPrice: sku.productPrice,
    }),
    touched: false,
  }));
}

function moveValue(values: string[], index: number, direction: -1 | 1) {
  const nextIndex = index + direction;
  if (nextIndex < 0 || nextIndex >= values.length) {
    return values;
  }
  const next = [...values];
  const [entry] = next.splice(index, 1);
  if (!entry) {
    return values;
  }
  next.splice(nextIndex, 0, entry);
  return next;
}

function removeValue(values: string[], value: string) {
  return values.filter((entry) => entry !== value);
}

function RankingEditor({
  available,
  label,
  onChange,
  values,
}: {
  available: Array<{ id: string; label: string }>;
  label: string;
  onChange: (values: string[]) => void;
  values: string[];
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const nextCandidate = available.find((entry) => !values.includes(entry.id))?.id ?? '';
  const availableById = new Map(available.map((entry) => [entry.id, entry.label]));

  return (
    <div className="grid gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground">{label}</p>
          <p className="mt-1 text-sm text-muted-foreground">Optional. Add only when the real selling order changed.</p>
        </div>
        <Select
          value={nextCandidate || '__none__'}
          onValueChange={(value) => {
            if (value !== '__none__' && !values.includes(value)) {
              onChange([...values, value]);
            }
          }}
        >
          <SelectTrigger aria-label={`Add ${label}`} className="h-11 rounded-xl sm:w-64">
            <SelectValue placeholder="Add item" />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="__none__">Add item</SelectItem>
            {available
              .filter((entry) => !values.includes(entry.id))
              .map((entry) => (
                <SelectItem key={entry.id} value={entry.id}>
                  {entry.label}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      {values.length > 0 ? (
        <div className="grid gap-2">
          {values.map((value, index) => (
            <div
              key={value}
              draggable
              className={cn(
                'flex items-center gap-3 rounded-[1.15rem] border border-border/70 bg-background/70 px-3 py-3',
                draggingId === value && 'opacity-60',
              )}
              onDragEnd={() => setDraggingId(null)}
              onDragOver={(event) => event.preventDefault()}
              onDragStart={() => setDraggingId(value)}
              onDrop={() => {
                if (!draggingId || draggingId === value) {
                  return;
                }
                const without = values.filter((entry) => entry !== draggingId);
                const targetIndex = without.indexOf(value);
                const next = [...without];
                next.splice(targetIndex, 0, draggingId);
                onChange(next);
              }}
            >
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                {index + 1}
              </span>
              <span className="min-w-0 flex-1 font-medium text-foreground">{availableById.get(value) ?? value}</span>
              <Button
                aria-label={`Move ${availableById.get(value) ?? value} up`}
                disabled={index === 0}
                size="icon"
                type="button"
                variant="ghost"
                onClick={() => onChange(moveValue(values, index, -1))}
              >
                <ArrowUp className="size-4" />
              </Button>
              <Button
                aria-label={`Move ${availableById.get(value) ?? value} down`}
                disabled={index === values.length - 1}
                size="icon"
                type="button"
                variant="ghost"
                onClick={() => onChange(moveValue(values, index, 1))}
              >
                <ArrowDown className="size-4" />
              </Button>
              <Button
                aria-label={`Remove ${availableById.get(value) ?? value}`}
                size="icon"
                type="button"
                variant="ghost"
                onClick={() => onChange(removeValue(values, value))}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-[1.15rem] border border-dashed border-border/70 px-4 py-4 text-sm text-muted-foreground">
          Skip this if nothing meaningful changed.
        </p>
      )}
    </div>
  );
}

function entityName(catalog: SenaCatalog | null, type: PriceEventType | StockoutEventType, entityId: string) {
  if (type === 'service') {
    return catalog?.services.find((service) => service.serviceId === entityId)?.name ?? entityId;
  }
  return catalog?.skus.find((sku) => sku.skuId === entityId)?.name ?? entityId;
}

function StockCountStep({
  catalog,
  countedAtBySku,
  prioritySkuIds,
  rows,
  stockBySku,
  stockView,
  updateRow,
  visibleRows,
  onStockViewChange,
}: {
  catalog: SenaCatalog | null;
  countedAtBySku: Map<string, string>;
  prioritySkuIds: Set<string>;
  rows: StockRow[];
  stockBySku: Map<string, SenaStockSnapshot>;
  stockView: StockView;
  updateRow: (skuId: string, patch: Partial<StockRow>) => void;
  visibleRows: StockRow[];
  onStockViewChange: (value: StockView) => void;
}) {
  return (
    <WorkspacePanel
      action={
        <ToggleGroup
          aria-label="Stock count view"
          className="rounded-2xl"
          spacing={1}
          type="single"
          value={stockView}
          onValueChange={(value) => {
            if (value) {
              onStockViewChange(value as StockView);
            }
          }}
        >
          {STOCK_VIEW_OPTIONS.map((option) => (
            <ToggleGroupItem key={option.value} value={option.value}>
              {option.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      }
      descriptor="Mark only the SKUs you counted. Banji will leave untouched rows as unknown, not zero."
      title="Stock count"
    >
      <div className="grid gap-3">
        {visibleRows.map((row) => {
          const sku = catalog?.skus.find((entry) => entry.skuId === row.skuId);
          const latestCountedAt = countedAtBySku.get(row.skuId);
          const latestStock = stockBySku.get(row.skuId);
          return (
            <div
              key={row.skuId}
              className={cn(
                'grid gap-3 rounded-[1.25rem] border border-border/70 bg-background/70 p-4 md:grid-cols-[minmax(14rem,1fr)_repeat(3,minmax(8rem,0.75fr))]',
                row.touched && 'border-primary/40 bg-primary/[0.04]',
                stockView === 'priority' && prioritySkuIds.has(row.skuId) && !row.touched && 'border-primary/20',
              )}
            >
              <label className="flex min-w-0 items-start gap-3">
                <Checkbox
                  checked={row.touched}
                  className="mt-1"
                  onCheckedChange={(checked) => updateRow(row.skuId, { touched: checked === true })}
                />
                <span className="min-w-0">
                  <span className="block font-medium text-foreground">{sku?.name ?? row.skuId}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    Latest {latestStock?.unitsInStock ?? 0} units
                    {latestCountedAt ? ` · counted ${formatSenaLongDate(latestCountedAt, 'en')}` : ' · never counted'}
                  </span>
                </span>
              </label>
              <label className="grid gap-2 text-sm">
                Units in stock
                <Input
                  disabled={!row.touched}
                  min="0"
                  step="1"
                  type="number"
                  value={row.unitsInStock}
                  onChange={(event) => updateRow(row.skuId, { unitsInStock: Number(event.target.value) })}
                />
              </label>
              <label className="grid gap-2 text-sm">
                Cost if changed
                <Input
                  disabled={!row.touched}
                  min="0"
                  step="0.01"
                  type="number"
                  value={row.costPerUnit ?? ''}
                  onChange={(event) =>
                    updateRow(row.skuId, { costPerUnit: event.target.value ? Number(event.target.value) : null })
                  }
                />
              </label>
              <label className="grid gap-2 text-sm">
                Retail price if changed
                <Input
                  disabled={!row.touched || !sku?.soldAsProduct}
                  min="0"
                  step="0.01"
                  type="number"
                  value={row.productPrice ?? ''}
                  onChange={(event) =>
                    updateRow(row.skuId, { productPrice: event.target.value ? Number(event.target.value) : null })
                  }
                />
              </label>
            </div>
          );
        })}
        {visibleRows.length === 0 ? (
          <p className="rounded-[1.25rem] border border-dashed border-border/70 px-4 py-5 text-sm text-muted-foreground">
            No SKUs match this stock view yet.
          </p>
        ) : null}
        <p className="text-sm text-muted-foreground">
          {rows.filter((row) => row.touched).length} SKU{rows.filter((row) => row.touched).length === 1 ? '' : 's'} counted in this update.
        </p>
      </div>
    </WorkspacePanel>
  );
}

function EventsStep({
  catalog,
  correctionEvents,
  orderEvents,
  priceEvents,
  receiptEvents,
  retailOptions,
  serviceOptions,
  setCorrectionEvents,
  setOrderEvents,
  setPriceEvents,
  setReceiptEvents,
  setStockoutEvents,
  stockoutEvents,
}: {
  catalog: SenaCatalog | null;
  correctionEvents: CorrectionEvent[];
  orderEvents: OrderEvent[];
  priceEvents: PriceEvent[];
  receiptEvents: ReceiptEvent[];
  retailOptions: Array<{ id: string; label: string }>;
  serviceOptions: Array<{ id: string; label: string }>;
  setCorrectionEvents: Dispatch<SetStateAction<CorrectionEvent[]>>;
  setOrderEvents: Dispatch<SetStateAction<OrderEvent[]>>;
  setPriceEvents: Dispatch<SetStateAction<PriceEvent[]>>;
  setReceiptEvents: Dispatch<SetStateAction<ReceiptEvent[]>>;
  setStockoutEvents: Dispatch<SetStateAction<StockoutEvent[]>>;
  stockoutEvents: StockoutEvent[];
}) {
  return (
    <WorkspacePanel
      action={
        <WorkspaceActionRow>
          <Button
            size="sm"
            type="button"
            variant="outline"
            onClick={() =>
              setOrderEvents((current) => [...current, { id: eventId('order'), skuId: catalog?.skus[0]?.skuId ?? '', quantity: '' }])
            }
          >
            <ClipboardPlus className="size-4" />
            Order placed
          </Button>
          <Button
            size="sm"
            type="button"
            variant="outline"
            onClick={() =>
              setReceiptEvents((current) => [
                ...current,
                { id: eventId('receipt'), skuId: catalog?.skus[0]?.skuId ?? '', quantity: '', costPerUnit: '' },
              ])
            }
          >
            <PackageCheck className="size-4" />
            Receipt arrived
          </Button>
          <Button
            size="sm"
            type="button"
            variant="outline"
            onClick={() =>
              setPriceEvents((current) => [
                ...current,
                { id: eventId('price'), type: 'service', entityId: catalog?.services[0]?.serviceId ?? '', price: '' },
              ])
            }
          >
            <Plus className="size-4" />
            Price changed
          </Button>
          <Button
            size="sm"
            type="button"
            variant="outline"
            onClick={() =>
              setStockoutEvents((current) => [
                ...current,
                { id: eventId('stockout'), type: 'service', entityId: catalog?.services[0]?.serviceId ?? '' },
              ])
            }
          >
            <Plus className="size-4" />
            Blocked / stockout
          </Button>
          <Button
            size="sm"
            type="button"
            variant="outline"
            onClick={() =>
              setCorrectionEvents((current) => [
                ...current,
                { id: eventId('correction'), skuId: catalog?.skus[0]?.skuId ?? '', quantityDelta: '', reason: '' },
              ])
            }
          >
            <Plus className="size-4" />
            Correction
          </Button>
        </WorkspaceActionRow>
      }
      descriptor="Add only the events that happened during this interval."
      title="Real-world events"
    >
      <div className="grid gap-3">
        {orderEvents.map((event) => (
          <div
            key={event.id}
            className={`grid gap-3 rounded-[1.15rem] border border-border/70 bg-background/70 p-4 md:grid-cols-[1fr_10rem_auto] ${rowHoverClassName}`}
          >
            <Select
              value={event.skuId}
              onValueChange={(skuId) =>
                setOrderEvents((current) => current.map((entry) => (entry.id === event.id ? { ...entry, skuId } : entry)))
              }
            >
              <SelectTrigger aria-label="Order SKU">
                <SelectValue placeholder="Choose SKU" />
              </SelectTrigger>
              <SelectContent>
                {(catalog?.skus ?? []).map((sku) => (
                  <SelectItem key={sku.skuId} value={sku.skuId}>
                    {sku.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              min="0"
              placeholder="Ordered quantity"
              step="1"
              type="number"
              value={event.quantity}
              onChange={(change) =>
                setOrderEvents((current) =>
                  current.map((entry) => (entry.id === event.id ? { ...entry, quantity: change.target.value } : entry)),
                )
              }
            />
            <Button size="icon" type="button" variant="ghost" onClick={() => setOrderEvents((current) => current.filter((entry) => entry.id !== event.id))}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        {receiptEvents.map((event) => (
          <div
            key={event.id}
            className={`grid gap-3 rounded-[1.15rem] border border-border/70 bg-background/70 p-4 md:grid-cols-[1fr_10rem_10rem_auto] ${rowHoverClassName}`}
          >
            <Select
              value={event.skuId}
              onValueChange={(skuId) =>
                setReceiptEvents((current) => current.map((entry) => (entry.id === event.id ? { ...entry, skuId } : entry)))
              }
            >
              <SelectTrigger aria-label="Receipt SKU">
                <SelectValue placeholder="Choose SKU" />
              </SelectTrigger>
              <SelectContent>
                {(catalog?.skus ?? []).map((sku) => (
                  <SelectItem key={sku.skuId} value={sku.skuId}>
                    {sku.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              min="0"
              placeholder="Received quantity"
              step="1"
              type="number"
              value={event.quantity}
              onChange={(change) =>
                setReceiptEvents((current) =>
                  current.map((entry) => (entry.id === event.id ? { ...entry, quantity: change.target.value } : entry)),
                )
              }
            />
            <Input
              min="0"
              placeholder="Cost if changed"
              step="0.01"
              type="number"
              value={event.costPerUnit}
              onChange={(change) =>
                setReceiptEvents((current) =>
                  current.map((entry) => (entry.id === event.id ? { ...entry, costPerUnit: change.target.value } : entry)),
                )
              }
            />
            <Button size="icon" type="button" variant="ghost" onClick={() => setReceiptEvents((current) => current.filter((entry) => entry.id !== event.id))}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        {priceEvents.map((event) => (
          <div
            key={event.id}
            className={`grid gap-3 rounded-[1.15rem] border border-border/70 bg-background/70 p-4 md:grid-cols-[9rem_1fr_10rem_auto] ${rowHoverClassName}`}
          >
            <Select
              value={event.type}
              onValueChange={(type) =>
                setPriceEvents((current) =>
                  current.map((entry) =>
                    entry.id === event.id
                      ? {
                          ...entry,
                          type: type as PriceEventType,
                          entityId:
                            type === 'service'
                              ? catalog?.services[0]?.serviceId ?? ''
                              : catalog?.skus.find((sku) => sku.soldAsProduct)?.skuId ?? '',
                        }
                      : entry,
                  ),
                )
              }
            >
              <SelectTrigger aria-label="Price type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="service">Service</SelectItem>
                <SelectItem value="retail">Retail</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={event.entityId}
              onValueChange={(entityId) =>
                setPriceEvents((current) => current.map((entry) => (entry.id === event.id ? { ...entry, entityId } : entry)))
              }
            >
              <SelectTrigger aria-label="Price item">
                <SelectValue placeholder="Choose item" />
              </SelectTrigger>
              <SelectContent>
                {(event.type === 'service' ? serviceOptions : retailOptions).map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {entry.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              min="0"
              placeholder="New price"
              step="0.01"
              type="number"
              value={event.price}
              onChange={(change) =>
                setPriceEvents((current) =>
                  current.map((entry) => (entry.id === event.id ? { ...entry, price: change.target.value } : entry)),
                )
              }
            />
            <Button size="icon" type="button" variant="ghost" onClick={() => setPriceEvents((current) => current.filter((entry) => entry.id !== event.id))}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        {stockoutEvents.map((event) => (
          <div
            key={event.id}
            className={`grid gap-3 rounded-[1.15rem] border border-border/70 bg-background/70 p-4 md:grid-cols-[9rem_1fr_auto] ${rowHoverClassName}`}
          >
            <Select
              value={event.type}
              onValueChange={(type) =>
                setStockoutEvents((current) =>
                  current.map((entry) =>
                    entry.id === event.id
                      ? {
                          ...entry,
                          type: type as StockoutEventType,
                          entityId:
                            type === 'service'
                              ? catalog?.services[0]?.serviceId ?? ''
                              : catalog?.skus.find((sku) => sku.soldAsProduct)?.skuId ?? '',
                        }
                      : entry,
                  ),
                )
              }
            >
              <SelectTrigger aria-label="Stockout type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="service">Service</SelectItem>
                <SelectItem value="retail">Retail</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={event.entityId}
              onValueChange={(entityId) =>
                setStockoutEvents((current) => current.map((entry) => (entry.id === event.id ? { ...entry, entityId } : entry)))
              }
            >
              <SelectTrigger aria-label="Stockout item">
                <SelectValue placeholder="Choose item" />
              </SelectTrigger>
              <SelectContent>
                {(event.type === 'service' ? serviceOptions : retailOptions).map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>
                    {entry.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button size="icon" type="button" variant="ghost" onClick={() => setStockoutEvents((current) => current.filter((entry) => entry.id !== event.id))}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        {correctionEvents.map((event) => (
          <div
            key={event.id}
            className={`grid gap-3 rounded-[1.15rem] border border-border/70 bg-background/70 p-4 md:grid-cols-[1fr_10rem_1fr_auto] ${rowHoverClassName}`}
          >
            <Select
              value={event.skuId}
              onValueChange={(skuId) =>
                setCorrectionEvents((current) => current.map((entry) => (entry.id === event.id ? { ...entry, skuId } : entry)))
              }
            >
              <SelectTrigger aria-label="Correction SKU">
                <SelectValue placeholder="Choose SKU" />
              </SelectTrigger>
              <SelectContent>
                {(catalog?.skus ?? []).map((sku) => (
                  <SelectItem key={sku.skuId} value={sku.skuId}>
                    {sku.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Delta"
              step="1"
              type="number"
              value={event.quantityDelta}
              onChange={(change) =>
                setCorrectionEvents((current) =>
                  current.map((entry) => (entry.id === event.id ? { ...entry, quantityDelta: change.target.value } : entry)),
                )
              }
            />
            <Input
              placeholder="Reason"
              value={event.reason}
              onChange={(change) =>
                setCorrectionEvents((current) =>
                  current.map((entry) => (entry.id === event.id ? { ...entry, reason: change.target.value } : entry)),
                )
              }
            />
            <Button size="icon" type="button" variant="ghost" onClick={() => setCorrectionEvents((current) => current.filter((entry) => entry.id !== event.id))}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        {orderEvents.length + receiptEvents.length + priceEvents.length + stockoutEvents.length + correctionEvents.length === 0 ? (
          <p className="rounded-[1.15rem] border border-dashed border-border/70 px-4 py-5 text-sm text-muted-foreground">
            No real-world events added for this update.
          </p>
        ) : null}
      </div>
    </WorkspacePanel>
  );
}

function ReviewStep({
  catalog,
  error,
  previewParts,
  priceEvents,
  stockoutEvents,
}: {
  catalog: SenaCatalog | null;
  error: string | null;
  previewParts: string[];
  priceEvents: PriceEvent[];
  stockoutEvents: StockoutEvent[];
}) {
  return (
    <WorkspacePanel
      descriptor="Banji will save one sparse update package and refresh the SENA surfaces."
      title="Review and save"
    >
      <div className="grid gap-4">
        <div className="rounded-[1.25rem] border border-border/70 bg-secondary/25 px-4 py-4">
          <p className="font-medium text-foreground">
            {previewParts.length > 0 ? previewParts.join(' · ') : 'No structured signals yet'}
          </p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Banji will refresh stock and sellability, update Overview tasks, refresh Performance moves, and add evidence to Analysis.
          </p>
        </div>
        {priceEvents.length > 0 || stockoutEvents.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {[
              ...priceEvents.map((event) => `Price: ${entityName(catalog, event.type, event.entityId)}`),
              ...stockoutEvents.map((event) => `Stockout: ${entityName(catalog, event.type, event.entityId)}`),
            ].map((label) => (
              <span key={label} className="rounded-full border border-border/70 bg-background px-3 py-1 text-xs text-muted-foreground">
                {label}
              </span>
            ))}
          </div>
        ) : null}
        {error ? (
          <p className="rounded-[1.25rem] border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </WorkspacePanel>
  );
}

export function StockUpdateSessionRoute() {
  const { catalog, ingestSenaObservation, isSaving, observations, triggerSenaRun, workspaceSummary } = useInventory();
  const latestAt = latestObservationAt(observations);
  const [currentStepId, setCurrentStepId] = useState<StockUpdateStepId>('context');
  const [unlockedStepCount, setUnlockedStepCount] = useState(1);
  const [observedAt, setObservedAt] = useState(() => localDateTimeInputValue(null));
  const [notes, setNotes] = useState('');
  const [stockView, setStockView] = useState<StockView>('priority');
  const [rows, setRows] = useState(() => buildInitialRows(catalog, observations));
  const [orderEvents, setOrderEvents] = useState<OrderEvent[]>([]);
  const [receiptEvents, setReceiptEvents] = useState<ReceiptEvent[]>([]);
  const [priceEvents, setPriceEvents] = useState<PriceEvent[]>([]);
  const [stockoutEvents, setStockoutEvents] = useState<StockoutEvent[]>([]);
  const [correctionEvents, setCorrectionEvents] = useState<CorrectionEvent[]>([]);
  const [serviceRankings, setServiceRankings] = useState<string[]>([]);
  const [retailRankings, setRetailRankings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRows(buildInitialRows(catalog, observations));
  }, [catalog, observations]);

  const stockBySku = useMemo(() => latestStockBySku(catalog, observations), [catalog, observations]);
  const countedAtBySku = useMemo(() => latestCountedAtBySku(observations), [observations]);
  const highRiskIds = new Set(workspaceSummary?.highRiskSkuIds ?? []);
  const serviceLinkedSkuIds = useMemo(
    () => new Set((catalog?.sharingMask ?? []).filter((entry) => entry.enabled).map((entry) => entry.skuId)),
    [catalog],
  );
  const prioritySkuIds = useMemo(() => {
    const scored = (catalog?.skus ?? []).map((sku, index) => ({
      skuId: sku.skuId,
      score:
        (highRiskIds.has(sku.skuId) ? 100 : 0) +
        (serviceLinkedSkuIds.has(sku.skuId) ? 20 : 0) +
        (countedAtBySku.has(sku.skuId) ? 0 : 10) -
        index / 100,
    }));
    return new Set(scored.sort((left, right) => right.score - left.score).slice(0, 8).map((entry) => entry.skuId));
  }, [catalog?.skus, countedAtBySku, highRiskIds, serviceLinkedSkuIds]);

  const visibleRows = rows.filter((row) => {
    if (stockView === 'counted') {
      return row.touched;
    }
    if (stockView === 'priority') {
      return prioritySkuIds.has(row.skuId);
    }
    return true;
  });

  const observedAtIso = dateTimeInputToIso(observedAt);
  const intervalDays = intervalDaysBetween(latestAt, observedAtIso);
  const isFirstObservation = observations.length === 0;
  const countedSkuCount = rows.filter((row) => row.touched).length;
  const fullUpdate = rows.length > 0 && rows.every((row) => row.touched);
  const serviceOptions = (catalog?.services ?? []).map((service) => ({ id: service.serviceId, label: service.name }));
  const retailOptions = (catalog?.skus ?? []).filter((sku) => sku.soldAsProduct).map((sku) => ({ id: sku.skuId, label: sku.name }));
  const currentStepIndex = STOCK_UPDATE_STEP_ORDER.indexOf(currentStepId);
  const isLastStep = currentStepIndex === STOCK_UPDATE_STEP_ORDER.length - 1;
  const eventSignalCount = orderEvents.length + receiptEvents.length + priceEvents.length + stockoutEvents.length + correctionEvents.length;
  const rankingSignalCount = serviceRankings.length + retailRankings.length;
  const stockStepSatisfied = !isFirstObservation || countedSkuCount > 0;

  function updateRow(skuId: string, patch: Partial<StockRow>) {
    setRows((current) => current.map((row) => (row.skuId === skuId ? { ...row, ...patch } : row)));
  }

  function buildPayload() {
    const payload = createEmptyObservationInput({
      observedAt: observedAtIso ?? new Date().toISOString(),
      notes: notes.trim() || null,
    });
    payload.stockSnapshot = rows
      .filter((row) => row.touched)
      .map(({ touched: _touched, ...row }) => row);
    payload.serviceRankings = serviceRankings;
    payload.retailRankings = retailRankings;
    payload.orderSignals = [
      ...orderEvents
        .filter((event) => event.skuId && Number(event.quantity) > 0)
        .map((event) => ({
          skuId: event.skuId,
          orderPlaced: true,
          receiptArrived: false,
          approximateOrderQuantity: Number(event.quantity),
          approximateReceiptQuantity: null,
        })),
      ...receiptEvents
        .filter((event) => event.skuId && Number(event.quantity) > 0)
        .map((event) => ({
          skuId: event.skuId,
          orderPlaced: false,
          receiptArrived: true,
          approximateOrderQuantity: null,
          approximateReceiptQuantity: Number(event.quantity),
        })),
    ];
    for (const event of receiptEvents.filter((entry) => entry.skuId && Number(entry.quantity) > 0)) {
      const existingIndex = payload.stockSnapshot.findIndex((snapshot) => snapshot.skuId === event.skuId);
      const latest = stockBySku.get(event.skuId);
      const nextSnapshot = {
        skuId: event.skuId,
        unitsInStock:
          existingIndex >= 0
            ? payload.stockSnapshot[existingIndex]!.unitsInStock
            : (latest?.unitsInStock ?? 0) + Number(event.quantity),
        costPerUnit: event.costPerUnit ? Number(event.costPerUnit) : (latest?.costPerUnit ?? null),
        productPrice: latest?.productPrice ?? null,
      };
      if (existingIndex >= 0) {
        payload.stockSnapshot[existingIndex] = {
          ...payload.stockSnapshot[existingIndex]!,
          costPerUnit: nextSnapshot.costPerUnit,
        };
      } else {
        payload.stockSnapshot.push(nextSnapshot);
      }
    }
    payload.retailPrices = priceEvents
      .filter((event) => event.type === 'retail' && event.entityId && Number(event.price) >= 0)
      .map((event) => ({ skuId: event.entityId, price: Number(event.price) }));
    payload.servicePrices = priceEvents
      .filter((event) => event.type === 'service' && event.entityId && Number(event.price) >= 0)
      .map((event) => ({ serviceId: event.entityId, price: Number(event.price) }));
    payload.retailStockouts = stockoutEvents
      .filter((event) => event.type === 'retail' && event.entityId)
      .map((event) => event.entityId);
    payload.serviceStockouts = stockoutEvents
      .filter((event) => event.type === 'service' && event.entityId)
      .map((event) => event.entityId);
    payload.adjustmentSignals = correctionEvents
      .filter((event) => event.skuId && event.reason.trim() && event.quantityDelta !== '')
      .map((event) => ({
        skuId: event.skuId,
        quantityDelta: Number(event.quantityDelta),
        reason: event.reason.trim(),
      }));
    return payload;
  }

  const previewPayload = buildPayload();
  const previewParts = observationCompositionParts(previewPayload);
  const submitDisabled =
    isSaving ||
    !hasStructuredObservationSignal(previewPayload) ||
    (isFirstObservation && previewPayload.stockSnapshot.length === 0);

  const stepStates = [
    {
      id: 'context',
      title: STOCK_UPDATE_STEP_COPY.context.title,
      description: 'Observed at and notes',
      complete: Boolean(observedAtIso),
    },
    {
      id: 'stock',
      title: STOCK_UPDATE_STEP_COPY.stock.title,
      description: isFirstObservation ? 'Count at least one SKU' : 'Optional on later updates',
      complete: stockStepSatisfied,
    },
    {
      id: 'events',
      title: STOCK_UPDATE_STEP_COPY.events.title,
      description: eventSignalCount > 0 ? `${eventSignalCount} event${eventSignalCount === 1 ? '' : 's'} added` : 'Optional',
      complete: eventSignalCount > 0 || currentStepIndex > 2,
    },
    {
      id: 'rankings',
      title: STOCK_UPDATE_STEP_COPY.rankings.title,
      description: rankingSignalCount > 0 ? `${rankingSignalCount} ranking${rankingSignalCount === 1 ? '' : 's'} added` : 'Optional',
      complete: rankingSignalCount > 0 || currentStepIndex > 3,
    },
    {
      id: 'review',
      title: STOCK_UPDATE_STEP_COPY.review.title,
      description: submitDisabled ? 'Not ready yet' : 'Ready to save',
      complete: !submitDisabled,
    },
  ] satisfies Array<{ id: StockUpdateStepId; title: string; description: string; complete: boolean }>;

  const canContinueCurrentStep =
    currentStepId === 'context' ? Boolean(observedAtIso) : currentStepId === 'stock' ? stockStepSatisfied : true;

  const stepGuidance =
    currentStepId === 'context' && !observedAtIso
      ? 'Choose a valid observed-at time before continuing.'
      : currentStepId === 'stock' && !stockStepSatisfied
        ? 'Count at least one SKU before continuing so Banji can anchor the first update.'
        : currentStepId === 'review' && !hasStructuredObservationSignal(previewPayload)
          ? 'Add at least one stock count, ranking, event, price, stockout, or correction before saving.'
          : currentStepId === 'review' && isFirstObservation && previewPayload.stockSnapshot.length === 0
            ? 'The first update must include at least one counted SKU so Banji can anchor inventory.'
            : null;

  function selectStep(stepId: StockUpdateStepId) {
    const targetIndex = STOCK_UPDATE_STEP_ORDER.indexOf(stepId);
    if (targetIndex >= 0 && targetIndex < unlockedStepCount) {
      setCurrentStepId(stepId);
    }
  }

  function goToNextStep() {
    if (!canContinueCurrentStep || isLastStep) {
      return;
    }
    const nextIndex = currentStepIndex + 1;
    setUnlockedStepCount((current) => Math.max(current, nextIndex + 1));
    setCurrentStepId(STOCK_UPDATE_STEP_ORDER[nextIndex]!);
  }

  function goToPreviousStep() {
    if (currentStepIndex === 0) {
      return;
    }
    setCurrentStepId(STOCK_UPDATE_STEP_ORDER[currentStepIndex - 1]!);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!observedAtIso) {
      setError('Choose a valid observed-at time before saving.');
      return;
    }
    const payload = buildPayload();
    if (!hasStructuredObservationSignal(payload)) {
      setError('Add at least one stock count, ranking, event, price, stockout, or correction before saving.');
      return;
    }
    if (isFirstObservation && payload.stockSnapshot.length === 0) {
      setError('The first update must include at least one counted SKU so Banji can anchor inventory.');
      return;
    }
    try {
      await ingestSenaObservation(payload);
      await triggerSenaRun({ algorithmVersion: 'sena-analysis-v3' });
      setRows(buildInitialRows(catalog, observations));
      setOrderEvents([]);
      setReceiptEvents([]);
      setPriceEvents([]);
      setStockoutEvents([]);
      setCorrectionEvents([]);
      setServiceRankings([]);
      setRetailRankings([]);
      setNotes('');
      setCurrentStepId('context');
      setUnlockedStepCount(1);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Banji could not save this update. Try again.');
    }
  }

  const titleActions = (
    <WorkspaceActionRow>
      {currentStepIndex > 0 ? (
        <Button type="button" variant="outline" onClick={goToPreviousStep}>
          <ChevronLeft className="size-4" />
          Back
        </Button>
      ) : null}
      {isLastStep ? (
        <Button disabled={submitDisabled} form="stock-update-session-form" type="submit">
          <Save className="size-4" />
          {isSaving ? 'Saving…' : 'Save update'}
        </Button>
      ) : (
        <Button disabled={!canContinueCurrentStep} type="button" onClick={goToNextStep}>
          Next
          <ChevronRight className="size-4" />
        </Button>
      )}
    </WorkspaceActionRow>
  );

  return (
    <WorkspacePage>
      <WorkspaceTitleCard
        actions={titleActions}
        descriptor={
          latestAt
            ? `Covers changes since ${formatSenaDateTime(latestAt, 'en')}${intervalDays == null ? '' : ` · ${intervalDays}-day interval`}.`
            : 'Start Banji with one counted SKU, then future updates can stay sparse.'
        }
        eyebrow="Operations"
        title="Record update"
      >
        <div className="grid gap-5">
          <StepWizard
            currentStepId={currentStepId}
            percentComplete={(unlockedStepCount / STOCK_UPDATE_STEP_ORDER.length) * 100}
            steps={stepStates}
            unlockedStepCount={unlockedStepCount}
            onStepSelect={(stepId) => selectStep(stepId as StockUpdateStepId)}
          />

          <div className="grid gap-3 text-sm text-muted-foreground md:grid-cols-3">
            <div className="rounded-[1.15rem] border border-border/70 bg-background/65 px-4 py-3">
              <p className="font-medium text-foreground">{latestAt ? formatSenaLongDate(latestAt, 'en') : 'No prior update'}</p>
              <p className="mt-1">Last confirmed update</p>
            </div>
            <div className="rounded-[1.15rem] border border-border/70 bg-background/65 px-4 py-3">
              <p className="font-medium text-foreground">{intervalDays == null ? 'First interval' : `${intervalDays} days`}</p>
              <p className="mt-1">Interval length</p>
            </div>
            <div className="rounded-[1.15rem] border border-border/70 bg-background/65 px-4 py-3">
              <p className="font-medium text-foreground">{fullUpdate ? 'Full update' : 'Partial update'}</p>
              <p className="mt-1">Untouched SKUs stay latent</p>
            </div>
          </div>
        </div>
      </WorkspaceTitleCard>

      <form id="stock-update-session-form" className="grid gap-6" onSubmit={(event) => void handleSubmit(event)}>
        {currentStepId === 'context' ? (
          <WorkspacePanel
            descriptor={STOCK_UPDATE_STEP_COPY.context.description}
            footer={
              stepGuidance ? (
                <p className="text-sm text-muted-foreground">{stepGuidance}</p>
              ) : (
                <p className="text-sm text-muted-foreground">Step 1 unlocks once the observed-at timestamp is valid.</p>
              )
            }
            title={STOCK_UPDATE_STEP_COPY.context.title}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium text-foreground">
                Observed at
                <Input
                  required
                  type="datetime-local"
                  value={observedAt}
                  onChange={(event) => setObservedAt(event.target.value)}
                />
                <span className="text-xs font-normal leading-5 text-muted-foreground">
                  Start defaults to the last saved update; edit only the update end time here.
                </span>
              </label>
              <label className="grid gap-2 text-sm font-medium text-foreground">
                Notes
                <Textarea className="min-h-24" value={notes} onChange={(event) => setNotes(event.target.value)} />
                <span className="text-xs font-normal leading-5 text-muted-foreground">
                  Notes explain the update, but they do not count as a model signal by themselves.
                </span>
              </label>
            </div>
          </WorkspacePanel>
        ) : null}

        {currentStepId === 'stock' ? (
          <StockCountStep
            catalog={catalog}
            countedAtBySku={countedAtBySku}
            prioritySkuIds={prioritySkuIds}
            rows={rows}
            stockBySku={stockBySku}
            stockView={stockView}
            updateRow={updateRow}
            visibleRows={visibleRows}
            onStockViewChange={setStockView}
          />
        ) : null}

        {currentStepId === 'stock' && stepGuidance ? (
          <WorkspacePanel>
            <p className="text-sm text-muted-foreground">{stepGuidance}</p>
          </WorkspacePanel>
        ) : null}

        {currentStepId === 'events' ? (
          <EventsStep
            catalog={catalog}
            correctionEvents={correctionEvents}
            orderEvents={orderEvents}
            priceEvents={priceEvents}
            receiptEvents={receiptEvents}
            retailOptions={retailOptions}
            serviceOptions={serviceOptions}
            setCorrectionEvents={setCorrectionEvents}
            setOrderEvents={setOrderEvents}
            setPriceEvents={setPriceEvents}
            setReceiptEvents={setReceiptEvents}
            setStockoutEvents={setStockoutEvents}
            stockoutEvents={stockoutEvents}
          />
        ) : null}

        {currentStepId === 'rankings' ? (
          <WorkspacePanel
            descriptor={STOCK_UPDATE_STEP_COPY.rankings.description}
            title={STOCK_UPDATE_STEP_COPY.rankings.title}
          >
            <div className="grid gap-6 lg:grid-cols-2">
              <RankingEditor
                available={serviceOptions}
                label="Top services this interval"
                values={serviceRankings}
                onChange={setServiceRankings}
              />
              <RankingEditor
                available={retailOptions}
                label="Top retail items this interval"
                values={retailRankings}
                onChange={setRetailRankings}
              />
            </div>
          </WorkspacePanel>
        ) : null}

        {currentStepId === 'review' ? (
          <ReviewStep
            catalog={catalog}
            error={error}
            previewParts={previewParts}
            priceEvents={priceEvents}
            stockoutEvents={stockoutEvents}
          />
        ) : null}

        {currentStepId === 'review' && stepGuidance ? (
          <WorkspacePanel>
            <p className="text-sm text-muted-foreground">{stepGuidance}</p>
          </WorkspacePanel>
        ) : null}
      </form>
    </WorkspacePage>
  );
}
