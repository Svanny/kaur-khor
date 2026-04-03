import { Check, Save } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { SenaService } from '@shared/sena';
import { SearchInput } from '@/components/system/search-input';
import { WorkspaceActionRow, WorkspacePage, WorkspacePanel } from '@/components/system/workspace';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { emptySenaCatalog, linkedSkuIdsForService, upsertSenaService } from '@/lib/sena-catalog';
import { cn } from '@/lib/utils';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';
import { EditorField, editorInputClassName, editorPanelClassName, editorTextareaClassName } from './editor-form-primitives';
import { deriveMeasuredGridColumnCount, SERVICE_FORM_SKU_GRID_GAP } from './service-form-layout';
import { SkuPageHero } from './sku-page-hero';
import { SectionTitle } from './sku-detail/section-heading';

function emptyService(serviceId = ''): SenaService {
  return {
    serviceId,
    name: '',
    description: '',
    price: 0,
    bundle: false,
  };
}

function normalizeSearchValue(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function getSkuSearchScore(sku: { skuId: string; name: string; description: string }, query: string) {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) {
    return null;
  }

  const terms = normalizedQuery.split(' ');
  const name = normalizeSearchValue(sku.name);
  const skuId = normalizeSearchValue(sku.skuId);
  const description = normalizeSearchValue(sku.description);

  let score = 0;

  for (const term of terms) {
    if (skuId === term) {
      score += 400;
      continue;
    }
    if (name === term) {
      score += 320;
      continue;
    }
    if (skuId.startsWith(term)) {
      score += 260;
      continue;
    }
    if (name.startsWith(term)) {
      score += 220;
      continue;
    }
    if (skuId.includes(term)) {
      score += 180;
      continue;
    }
    if (name.includes(term)) {
      score += 140;
      continue;
    }
    if (description.startsWith(term)) {
      score += 100;
      continue;
    }
    if (description.includes(term)) {
      score += 60;
      continue;
    }

    return null;
  }

  if (skuId === normalizedQuery) {
    score += 200;
  } else if (name === normalizedQuery) {
    score += 150;
  } else if (name.startsWith(normalizedQuery) || skuId.startsWith(normalizedQuery)) {
    score += 80;
  }

  return score;
}

function ServiceSkuGridTile({
  checked,
  className,
  description,
  label,
  measure = false,
  skuId,
  onCheckedChange,
}: {
  checked: boolean;
  className?: string;
  description?: string;
  label: string;
  measure?: boolean;
  skuId: string;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-3 rounded-[1.25rem] border border-border/70 bg-muted/20 px-4 py-4 text-sm transition-colors',
        !measure && 'cursor-pointer hover:border-border hover:bg-muted/45 focus-within:border-ring/70 focus-within:bg-muted/35',
        className,
      )}
      aria-pressed={measure ? undefined : checked}
      data-measure={measure ? 'true' : undefined}
      data-sku-tile={measure ? undefined : 'true'}
      data-skuid={skuId}
      onClick={
        measure
          ? undefined
          : (event) => {
              if ((event.target as HTMLElement).closest('[data-slot="checkbox"]')) {
                return;
              }
              onCheckedChange(!checked);
            }
      }
    >
      {measure ? (
        <div className="size-5 shrink-0 rounded-[6px] border border-muted-foreground/45 bg-card" />
      ) : (
        <>
          <input
            aria-label={label}
            checked={checked}
            className="peer sr-only"
            type="checkbox"
            onChange={(event) => onCheckedChange(event.target.checked)}
          />
          <div
            className={cn(
              'flex size-5 shrink-0 items-center justify-center rounded-[6px] border transition-[border-color,background-color,box-shadow]',
              checked
                ? 'border-primary bg-primary text-primary-foreground'
                : 'border-muted-foreground/45 bg-card text-transparent',
              'peer-focus-visible:border-ring peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50',
            )}
          >
            <Check className="size-3.5" />
          </div>
        </>
      )}
      <div className="grid min-w-0 gap-1">
        <div className="flex min-h-5 cursor-pointer items-center font-medium leading-5 text-foreground">
          {label}
        </div>
        {description ? <div className="truncate text-muted-foreground">{description}</div> : null}
      </div>
    </div>
  );
}

function ServiceFormLoadingState() {
  return (
    <WorkspacePage>
      <section className="editorial-panel overflow-hidden rounded-[2rem] border border-border/70 bg-white shadow-[0_16px_40px_rgba(48,31,20,0.08)]">
        <div className="border-b border-border/60 px-6 py-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-center gap-3">
              <Skeleton className="h-9 w-9 rounded-full" />
              <Skeleton className="h-7 w-44 rounded-full" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Skeleton className="h-10 w-36 rounded-full" />
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6">
        <WorkspacePanel
          className={editorPanelClassName}
          title={<Skeleton className="h-7 w-36 rounded-full" />}
        >
          <div className="grid items-start gap-4 md:grid-cols-2">
            <Skeleton className="h-14 rounded-xl" />
            <Skeleton className="h-14 rounded-xl" />
          </div>
          <Skeleton className="h-32 rounded-2xl" />
        </WorkspacePanel>

        <WorkspacePanel
          className={editorPanelClassName}
          title={<Skeleton className="h-7 w-40 rounded-full" />}
        >
          <Skeleton className="h-14 rounded-xl md:max-w-[24rem]" />
        </WorkspacePanel>

        <WorkspacePanel
          className={editorPanelClassName}
          title={<Skeleton className="h-7 w-32 rounded-full" />}
        >
          <Skeleton className="h-12 rounded-full" />
          <Skeleton className="h-9 w-48 rounded-full" />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={`service-form-sku-loading-${index}`} className="h-20 rounded-[1.25rem]" />
            ))}
          </div>
        </WorkspacePanel>
      </div>
    </WorkspacePage>
  );
}

export function ServiceFormRoute() {
  const navigate = useNavigate();
  const { serviceId } = useParams();
  const { catalog, isLoading, isSaving, upsertSenaCatalog } = useInventory();
  const { t } = usePreferences();
  const [form, setForm] = useState<SenaService>(() => emptyService(serviceId));
  const [selectedSkuIds, setSelectedSkuIds] = useState<string[]>([]);
  const [skuSearch, setSkuSearch] = useState('');
  const deferredSkuSearch = useDeferredValue(skuSearch);
  const [gridColumnCount, setGridColumnCount] = useState(1);
  const editing = Boolean(serviceId);
  const formId = 'service-editor-form';
  const skuGridRef = useRef<HTMLDivElement | null>(null);
  const skuMeasureRef = useRef<HTMLDivElement | null>(null);

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

  const filteredSkus = useMemo(() => {
    const query = normalizeSearchValue(deferredSkuSearch);
    const allSkus = [...(catalog?.skus ?? [])];
    const sortedSkus = allSkus.sort((left, right) => left.name.localeCompare(right.name));

    if (!query) {
      return sortedSkus;
    }

    return sortedSkus
      .map((sku) => ({ sku, score: getSkuSearchScore(sku, query) }))
      .filter((entry): entry is { sku: (typeof sortedSkus)[number]; score: number } => entry.score != null)
      .sort((left, right) => {
        if (left.score !== right.score) {
          return right.score - left.score;
        }

        return left.sku.name.localeCompare(right.sku.name);
      })
      .map(({ sku }) => sku);
  }, [catalog?.skus, deferredSkuSearch]);

  const detectedSkuCountLabel = useMemo(
    () => `${filteredSkus.length} ${t('serviceEditorLinkedSkusDetected')}`,
    [filteredSkus.length, t],
  );

  useEffect(() => {
    const gridNode = skuGridRef.current;
    const measureNode = skuMeasureRef.current;
    if (!gridNode || !measureNode) {
      setGridColumnCount(1);
      return;
    }

    const updateColumns = () => {
      const containerWidth = gridNode.clientWidth;
      const measuredTiles = Array.from(measureNode.querySelectorAll<HTMLElement>('[data-measure="true"]'));
      const maxItemWidth = measuredTiles.reduce((maxWidth, tile) => Math.max(maxWidth, tile.getBoundingClientRect().width), 0);

      setGridColumnCount(
        deriveMeasuredGridColumnCount({
          containerWidth,
          gap: SERVICE_FORM_SKU_GRID_GAP,
          maxItemWidth,
        }),
      );
    };

    const observer = new ResizeObserver(() => updateColumns());
    observer.observe(gridNode);
    updateColumns();
    return () => observer.disconnect();
  }, [filteredSkus]);

  if (isLoading && !catalog) {
    return <ServiceFormLoadingState />;
  }

  return (
    <WorkspacePage>
      <SkuPageHero
        actions={
          <WorkspaceActionRow>
            <Button disabled={isSaving} form={formId} type="submit">
              <Save data-icon="inline-start" />
              {editing ? t('saveDraft') : t('createEntry')}
            </Button>
          </WorkspaceActionRow>
        }
        title={editing ? t('catalogServiceEditorTitleEdit') : t('catalogServiceEditorTitleNew')}
      />

      <form
        className="grid gap-6"
        id={formId}
        onSubmit={(event) => void handleSubmit(event)}
      >
        <WorkspacePanel
          className={editorPanelClassName}
          description={editing ? t('catalogServiceEditorIdentifierDescription') : t('catalogServiceEditorDescriptionNew')}
          title={<SectionTitle title={t('editorDetailsTitle')} tooltip={t('catalogServiceEditorDetailsTooltip')} />}
        >
          <div className="grid items-start gap-4 md:grid-cols-2">
            <EditorField
              hint={editing ? t('catalogServiceEditorIdentifierDescription') : undefined}
              label={t('fieldId')}
              tooltip={t('catalogServiceEditorDetailsTooltip')}
            >
              <input
                className={editorInputClassName}
                disabled={editing}
                required
                value={form.serviceId}
                onChange={(event) => setForm((current) => ({ ...current, serviceId: event.target.value }))}
              />
            </EditorField>
            <EditorField label={t('fieldName')} tooltip={t('catalogServiceEditorDetailsTooltip')}>
              <input
                className={editorInputClassName}
                required
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
            </EditorField>
          </div>

          <EditorField label={t('fieldDescription')} tooltip={t('catalogServiceEditorDetailsTooltip')}>
            <textarea
              className={editorTextareaClassName}
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            />
          </EditorField>
        </WorkspacePanel>

        <WorkspacePanel
          className={editorPanelClassName}
          title={<SectionTitle title={t('editorPricingTitle')} tooltip={t('catalogServiceEditorPricingTooltip')} />}
        >
          <EditorField label={t('fieldPrice')} tooltip={t('catalogServiceEditorPriceTooltip')}>
            <input
              className={editorInputClassName}
              min="0"
              required
              step="0.01"
              type="number"
              value={form.price}
              onChange={(event) => setForm((current) => ({ ...current, price: Number(event.target.value) }))}
            />
          </EditorField>
        </WorkspacePanel>

        <WorkspacePanel
          className={editorPanelClassName}
          description={t('fieldSkuSelectionHint')}
          title={<SectionTitle title={t('editorSelectionTitle')} tooltip={t('catalogServiceEditorLinkedSkusTooltip')} />}
        >
          <SearchInput
            aria-label={t('fieldLinkedSkus')}
            className="h-12 rounded-full"
            placeholder={t('serviceEditorLinkedSkusSearchPlaceholder')}
            value={skuSearch}
            onChange={(event) => setSkuSearch(event.target.value)}
          />

          <div className="inline-flex w-fit items-center rounded-full border border-border/60 bg-muted/15 px-4 py-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {detectedSkuCountLabel}
            </p>
          </div>

          <div
            ref={skuGridRef}
            className="grid gap-3"
            data-testid="linked-sku-grid"
            style={{
              gridTemplateColumns: `repeat(${gridColumnCount}, minmax(0, 1fr))`,
            }}
          >
            {filteredSkus.map((sku) => (
              <ServiceSkuGridTile
                key={sku.skuId}
                checked={selectedSkuIds.includes(sku.skuId)}
                description={sku.skuId}
                label={sku.name}
                skuId={sku.skuId}
                onCheckedChange={(checked) =>
                  setSelectedSkuIds((current) =>
                    checked
                      ? [...new Set([...current, sku.skuId])]
                      : current.filter((entry) => entry !== sku.skuId),
                  )
                }
              />
            ))}
            {catalog?.skus.length ? null : (
              <p className="col-span-full rounded-[1.25rem] border border-dashed border-border/70 bg-muted/10 px-4 py-4 text-sm text-muted-foreground">
                Add at least one SKU before linking services.
              </p>
            )}
            {catalog?.skus.length && filteredSkus.length === 0 ? (
              <p className="col-span-full rounded-[1.25rem] border border-dashed border-border/70 bg-muted/10 px-4 py-4 text-sm text-muted-foreground">
                {t('serviceEditorLinkedSkusNoMatches')}
              </p>
            ) : null}
          </div>

          <div ref={skuMeasureRef} aria-hidden="true" className="invisible absolute left-0 top-0 -z-10 grid gap-3 opacity-0 pointer-events-none">
            {filteredSkus.map((sku) => (
              <ServiceSkuGridTile
                key={`${sku.skuId}-measure`}
                checked={selectedSkuIds.includes(sku.skuId)}
                className="w-max max-w-none"
                description={sku.skuId}
                label={sku.name}
                measure
                skuId={sku.skuId}
                onCheckedChange={() => {}}
              />
            ))}
          </div>
        </WorkspacePanel>
      </form>
    </WorkspacePage>
  );
}
