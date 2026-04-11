import { ActionConfirmIcon, ActionSaveIcon } from '@icons/actions';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { SenaService } from '@shared/sena';
import { SearchInput } from '@/components/system/search-input';
import { MeasuredTileGrid } from '@/components/system/measured-tile-grid';
import { WorkspaceActionRow, WorkspacePage, WorkspacePanel } from '@/components/system/workspace';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useRouteLeaveConfirm } from '@/hooks/use-route-leave-confirm';
import { displayMoneyFromUsd, moneyInputStep, usdMoneyFromDisplay } from '@/lib/format';
import { rowHoverClassName } from '@/lib/interactive-surface';
import { emptySenaCatalog, linkedSkuIdsForService, upsertSenaService, validateCatalogEntityId } from '@/lib/sena-catalog';
import { cn } from '@/lib/utils';
import { useInventory } from '@/state/inventory';
import { useNavigationHistory } from '@/state/navigation-history';
import { usePreferences } from '@/state/preferences';
import { catalogItemIdErrorMessage } from './catalog-id-validation';
import { EditorField, editorInputClassName, editorPanelClassName, editorTextareaClassName } from './editor-form-primitives';
import { DetailHeroWireframe } from './loading-wireframes';
import { SkuPageHero } from './sku-page-hero';
import { SectionTitle } from './sku-detail/section-heading';

function emptyService(serviceId = ''): SenaService {
  return {
    serviceId,
    name: '',
    description: '',
    price: 0,
    archived: false,
    bundle: false,
  };
}

function normalizeSearchValue(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizedServiceDirtySnapshot(service: SenaService) {
  return {
    ...service,
    serviceId: service.serviceId.trim(),
    name: service.name.trim(),
    description: service.description.trim(),
  };
}

function getSkuSearchScore(sku: { skuId: string; name: string; description: string }, query: string) {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) {
    return null;
  }

  const terms = normalizedQuery.split(' ');
  const name = normalizeSearchValue(sku.name);
  const description = normalizeSearchValue(sku.description);

  let score = 0;

  for (const term of terms) {
    if (name === term) {
      score += 320;
      continue;
    }
    if (name.startsWith(term)) {
      score += 220;
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

  if (name === normalizedQuery) {
    score += 150;
  } else if (name.startsWith(normalizedQuery)) {
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
        !measure && `cursor-pointer hover:border-border ${rowHoverClassName} focus-within:border-ring/70 focus-within:bg-muted/35`,
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
            <ActionConfirmIcon className="size-3.5" />
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

function ServiceFormLoadingState({ title }: { title: string }) {
  return (
    <WorkspacePage>
      <DetailHeroWireframe actionCount={1} badgeCount={0} showBody={false} title={title} />

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
  const { catalog, isLoading, isSaving, renameCatalogEntity, upsertSenaCatalog } = useInventory();
  const { canGoBack, goBack } = useNavigationHistory();
  const { currency, t, usdToKhrExchangeRate } = usePreferences();
  const [form, setForm] = useState<SenaService>(() => emptyService(serviceId));
  const [selectedSkuIds, setSelectedSkuIds] = useState<string[]>([]);
  const [skuSearch, setSkuSearch] = useState('');
  const deferredSkuSearch = useDeferredValue(skuSearch);
  const editing = Boolean(serviceId);
  const formId = 'service-editor-form';
  const existingService = useMemo(
    () => catalog?.services.find((entry) => entry.serviceId === serviceId) ?? null,
    [catalog?.services, serviceId],
  );
  const baselineSelectedSkuIds = useMemo(
    () => (catalog && existingService ? linkedSkuIdsForService(catalog, existingService.serviceId) : []),
    [catalog, existingService],
  );

  useEffect(() => {
    if (existingService && catalog) {
      setForm(existingService);
      setSelectedSkuIds(baselineSelectedSkuIds);
    } else if (!editing) {
      setForm(emptyService(''));
      setSelectedSkuIds([]);
    }
  }, [baselineSelectedSkuIds, catalog, editing, existingService]);

  const normalizedDraft = useMemo(
    () => ({
      ...form,
      serviceId: form.serviceId.trim(),
      name: form.name.trim(),
      description: form.description.trim(),
    }),
    [form],
  );
  const normalizedBaseline = useMemo(
    () => existingService ?? emptyService(editing ? (serviceId ?? '') : ''),
    [editing, existingService, serviceId],
  );
  const draftDirtySnapshot = useMemo(() => normalizedServiceDirtySnapshot(form), [form]);
  const baselineDirtySnapshot = useMemo(
    () => normalizedServiceDirtySnapshot(normalizedBaseline),
    [normalizedBaseline],
  );
  const idError = useMemo(
    () =>
      catalogItemIdErrorMessage(
        t,
        validateCatalogEntityId(catalog, 'service', form.serviceId, editing ? normalizedBaseline.serviceId : null),
      ),
    [catalog, editing, form.serviceId, normalizedBaseline.serviceId, t],
  );
  const hasUnsavedServiceChanges =
    JSON.stringify(draftDirtySnapshot) !== JSON.stringify(baselineDirtySnapshot) ||
    JSON.stringify([...selectedSkuIds].sort()) !== JSON.stringify([...baselineSelectedSkuIds].sort());
  function resetServiceDraft() {
    setForm(normalizedBaseline);
    setSelectedSkuIds(baselineSelectedSkuIds);
  }

  const { confirmLeave, discardConfirmDialog } = useRouteLeaveConfirm({
    enabled: hasUnsavedServiceChanges,
    description: t('serviceEditorUnsavedLeavePrompt'),
    onDiscard: resetServiceDraft,
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (idError) {
      return;
    }
    const baseCatalog = catalog ?? emptySenaCatalog();
    if (editing && normalizedBaseline.serviceId !== normalizedDraft.serviceId) {
      await renameCatalogEntity({
        entityType: 'service',
        previousId: normalizedBaseline.serviceId,
        nextService: normalizedDraft,
        skuIds: selectedSkuIds,
      });
    } else {
      const nextCatalog = upsertSenaService(baseCatalog, normalizedDraft, selectedSkuIds, normalizedBaseline.serviceId);
      await upsertSenaCatalog(nextCatalog);
    }
    await navigate(`/catalog/services/${normalizedDraft.serviceId}`, { replace: !editing });
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

  if (isLoading && !catalog) {
    return <ServiceFormLoadingState title={editing ? t('catalogServiceEditorTitleEdit') : t('catalogServiceEditorTitleNew')} />;
  }

  return (
    <WorkspacePage>
      {discardConfirmDialog}
      <SkuPageHero
        actions={
          <WorkspaceActionRow>
            <Button disabled={!hasUnsavedServiceChanges || isSaving || idError != null} form={formId} type="submit">
              <ActionSaveIcon data-icon="inline-start" />
              {editing ? t('saveDraft') : t('createEntry')}
            </Button>
          </WorkspaceActionRow>
        }
        onBack={canGoBack ? () => confirmLeave(goBack) : undefined}
        title={editing ? t('catalogServiceEditorTitleEdit') : t('catalogServiceEditorTitleNew')}
      />

      <form
        className="grid gap-6"
        id={formId}
        onSubmit={(event) => void handleSubmit(event)}
      >
        <WorkspacePanel
          className={editorPanelClassName}
          descriptor={t('catalogServiceEditorDetailsDescriptor')}
          title={<SectionTitle title={t('editorDetailsTitle')} tooltip={t('catalogServiceEditorDetailsTooltip')} />}
        >
          <div className="grid items-start gap-4 md:grid-cols-2">
            <EditorField
              error={idError ?? undefined}
              helper={editing ? t('catalogServiceEditorIdentifierDescription') : t('catalogServiceEditorIdentifierHelper')}
              label={t('fieldId')}
              tooltip={t('catalogServiceEditorDetailsTooltip')}
            >
              <input
                aria-invalid={idError ? 'true' : 'false'}
                className={editorInputClassName}
                required
                value={form.serviceId}
                onChange={(event) => setForm((current) => ({ ...current, serviceId: event.target.value }))}
              />
            </EditorField>
            <EditorField
              helper={t('catalogServiceEditorNameHelper')}
              label={t('fieldName')}
              tooltip={t('catalogServiceEditorDetailsTooltip')}
            >
              <input
                className={editorInputClassName}
                required
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
            </EditorField>
          </div>

          <EditorField
            helper={t('catalogServiceEditorDescriptionHelper')}
            label={t('fieldDescription')}
            tooltip={t('catalogServiceEditorDetailsTooltip')}
          >
            <textarea
              className={editorTextareaClassName}
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            />
          </EditorField>
        </WorkspacePanel>

        <WorkspacePanel
          className={editorPanelClassName}
          descriptor={t('catalogServiceEditorPricingDescriptor')}
          title={<SectionTitle title={t('editorPricingTitle')} tooltip={t('catalogServiceEditorPricingTooltip')} />}
        >
          <EditorField
            helper={t('catalogServiceEditorPriceHelper')}
            label={t('fieldPrice')}
            tooltip={t('catalogServiceEditorPriceTooltip')}
          >
            <input
              className={editorInputClassName}
              min="0"
              required
              step={moneyInputStep(currency)}
              type="number"
              value={displayMoneyFromUsd(form.price, currency, usdToKhrExchangeRate)}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  price: usdMoneyFromDisplay(Number(event.target.value), currency, usdToKhrExchangeRate),
                }))
              }
            />
          </EditorField>
        </WorkspacePanel>

        <WorkspacePanel
          className={editorPanelClassName}
          descriptor={t('catalogServiceEditorLinkedSkusDescriptor')}
          hint={t('catalogServiceEditorLinkedSkusHelper')}
          title={<SectionTitle title={t('editorSelectionTitle')} tooltip={t('catalogServiceEditorLinkedSkusTooltip')} />}
        >
          <SearchInput
            ariaLabel={t('fieldLinkedSkus')}
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

          <MeasuredTileGrid
            items={filteredSkus}
            renderGrid={({ columnCount, gridRef }) => (
              <div
                ref={gridRef}
                className="grid gap-3"
                data-testid="linked-sku-grid"
                style={{
                  gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                }}
              >
                {filteredSkus.map((sku) => (
                  <ServiceSkuGridTile
                    key={sku.skuId}
                    checked={selectedSkuIds.includes(sku.skuId)}
                    description={sku.description || undefined}
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
            )}
            renderMeasureItem={(sku) => (
              <ServiceSkuGridTile
                key={`${sku.skuId}-measure`}
                checked={selectedSkuIds.includes(sku.skuId)}
                className="w-max max-w-none"
                description={sku.description || undefined}
                label={sku.name}
                measure
                skuId={sku.skuId}
                onCheckedChange={() => {}}
              />
            )}
          />
        </WorkspacePanel>
      </form>
    </WorkspacePage>
  );
}
