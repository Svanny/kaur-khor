import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import type { SkuRecord } from '@shared/inventory';
import { useNavigate, useParams } from 'react-router-dom';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import {
  FieldError,
  FieldGroup,
  FieldSet,
} from '@/components/ui/field';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { EditorHeader } from '@/components/system/editor';
import { TextAreaField, TextInputField } from '@/components/system/form-fields';
import { WorkspacePage, WorkspacePanel } from '@/components/system/workspace';
import { useRouteLeaveConfirm } from '@/hooks/use-route-leave-confirm';
import { formatEditableMoney } from '@/lib/format';
import {
  limits,
  normalizeText,
  validateNonNegativeDecimal,
  validateRequiredText,
} from '@/lib/validation';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';

function randomId(prefix: 'service') {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

type ServiceField = 'name' | 'description' | 'price' | 'skuIds';

function normalizeSearchValue(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function getSkuSearchScore(sku: SkuRecord, query: string) {
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

export function ServiceFormRoute() {
  const navigate = useNavigate();
  const { serviceId } = useParams();
  const isNew = !serviceId;
  const { snapshot, saveService, isSaving } = useInventory();
  const { t } = usePreferences();
  const formId = 'service-editor-form';

  const currentService = useMemo(
    () => snapshot?.services.find((service) => service.serviceId === serviceId),
    [serviceId, snapshot],
  );

  const [form, setForm] = useState({
    serviceId: currentService?.serviceId ?? randomId('service'),
    name: currentService?.name ?? '',
    description: currentService?.description ?? '',
    price: currentService ? formatEditableMoney(currentService.price) : '',
    skuIds: currentService?.skuIds ?? [],
  });
  const [skuQuery, setSkuQuery] = useState('');
  const deferredSkuQuery = useDeferredValue(skuQuery);
  const [errors, setErrors] = useState<Partial<Record<ServiceField, string>>>({});
  const fieldRefs = useRef<
    Partial<Record<'name' | 'description' | 'price', HTMLInputElement | HTMLTextAreaElement>>
  >({});
  const skuSelectionRef = useRef<HTMLDivElement | null>(null);
  const sortedSkus = useMemo(() => {
    const rows = [...(snapshot?.skus ?? [])];
    return rows.sort((left, right) => {
      const leftSelected = form.skuIds.includes(left.skuId);
      const rightSelected = form.skuIds.includes(right.skuId);

      if (leftSelected !== rightSelected) {
        return leftSelected ? -1 : 1;
      }

      return left.name.localeCompare(right.name);
    });
  }, [form.skuIds, snapshot]);
  const filteredSkus = useMemo(() => {
    const query = normalizeSearchValue(deferredSkuQuery);
    if (!query) {
      return sortedSkus;
    }

    return sortedSkus
      .map((sku) => ({ sku, score: getSkuSearchScore(sku, query) }))
      .filter((entry): entry is { sku: SkuRecord; score: number } => entry.score != null)
      .sort((left, right) => {
        const leftSelected = form.skuIds.includes(left.sku.skuId);
        const rightSelected = form.skuIds.includes(right.sku.skuId);

        if (leftSelected !== rightSelected) {
          return leftSelected ? -1 : 1;
        }

        if (left.score !== right.score) {
          return right.score - left.score;
        }

        return left.sku.name.localeCompare(right.sku.name);
      })
      .map(({ sku }) => sku);
  }, [deferredSkuQuery, form.skuIds, sortedSkus]);
  const selectedSkus = useMemo(
    () =>
      form.skuIds
        .map((skuId) => snapshot?.skus.find((sku) => sku.skuId === skuId))
        .filter((sku): sku is NonNullable<typeof snapshot>['skus'][number] => Boolean(sku)),
    [form.skuIds, snapshot],
  );
  const currentSellableCoverage = useMemo(() => {
    if (selectedSkus.length === 0) {
      return null;
    }

    return selectedSkus.reduce(
      (minimum, sku) => Math.min(minimum, sku.unitsInStock),
      selectedSkus[0].unitsInStock,
    );
  }, [selectedSkus]);
  const limitingSku = useMemo(() => {
    if (selectedSkus.length === 0 || currentSellableCoverage == null) {
      return null;
    }

    return selectedSkus.find((sku) => sku.unitsInStock === currentSellableCoverage) ?? null;
  }, [currentSellableCoverage, selectedSkus]);

  const initialForm = useMemo(
    () => ({
      serviceId: currentService?.serviceId ?? form.serviceId,
      name: currentService?.name ?? '',
      description: currentService?.description ?? '',
      price: currentService ? formatEditableMoney(currentService.price) : '',
      skuIds: currentService?.skuIds ?? [],
    }),
    [currentService, form.serviceId],
  );

  useEffect(() => {
    if (currentService) {
      setForm({
        serviceId: currentService.serviceId,
        name: currentService.name,
        description: currentService.description,
        price: formatEditableMoney(currentService.price),
        skuIds: currentService.skuIds,
      });
      return;
    }

    if (isNew) {
      setForm({
        serviceId: randomId('service'),
        name: '',
        description: '',
        price: '',
        skuIds: [],
      });
    }
  }, [currentService, isNew]);

  const hasChanges =
    JSON.stringify({
      ...form,
      name: normalizeText(form.name),
      description: normalizeText(form.description),
      skuIds: [...form.skuIds].sort(),
    }) !==
    JSON.stringify({
      ...initialForm,
      skuIds: [...initialForm.skuIds].sort(),
    });
  const confirmLeave = useRouteLeaveConfirm({
    enabled: hasChanges,
    message: t('unsavedChanges'),
  });

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors: Partial<Record<ServiceField, string>> = {};
    const nameError = validateRequiredText(form.name, limits.serviceNameMaxLength);
    const descriptionError = validateRequiredText(form.description, limits.serviceDescriptionMaxLength);
    const priceError = validateNonNegativeDecimal(form.price, limits.monetaryAmountMax);

    if (nameError) nextErrors.name = t('validationRequired');
    if (descriptionError) nextErrors.description = t('validationRequired');
    if (priceError) nextErrors.price = t('validationNonNegative');
    if (form.skuIds.length === 0) nextErrors.skuIds = t('validationSelection');

    setErrors(nextErrors);

    const firstError = (Object.keys(nextErrors) as ServiceField[])[0];
    if (firstError === 'skuIds') {
      skuSelectionRef.current?.focus();
      return;
    }
    if (firstError) {
      fieldRefs.current[firstError]?.focus();
      return;
    }

    try {
      await saveService(
        {
          serviceId: form.serviceId,
          name: normalizeText(form.name),
          description: normalizeText(form.description),
          price: Number(form.price),
          skuIds: [...form.skuIds].sort(),
        },
      );
      navigate(`/catalog/services/${form.serviceId}`);
    } catch {
      return;
    }
  }

  function leaveEditor() {
    if (!confirmLeave()) {
      return;
    }
    navigate(isNew ? '/catalog' : `/catalog/services/${form.serviceId}`);
  }

  if (!snapshot) {
    return (
      <WorkspacePage>
        <WorkspacePanel
          description={t('apiUnavailable')}
          title={isNew ? t('catalogServiceEditorTitleNew') : t('catalogServiceEditorTitleEdit')}
        >
          <p className="text-sm text-muted-foreground">{t('apiUnavailable')}</p>
        </WorkspacePanel>
      </WorkspacePage>
    );
  }

  if (!isNew && !currentService) {
    return (
      <WorkspacePage>
        <WorkspacePanel
          description={t('catalogServiceDetailNotFoundDescription')}
          title={t('catalogServiceDetailNotFoundTitle')}
        >
          <div className="flex justify-start">
            <Button type="button" variant="outline" onClick={() => navigate('/catalog')}>
              {t('backToCatalog')}
            </Button>
          </div>
        </WorkspacePanel>
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage>
      <EditorHeader
        backLabel={!isNew ? t('backToCatalog') : undefined}
        cancelLabel={t('cancel')}
        description={
          isNew
            ? t('catalogServiceEditorDescriptionNew')
            : t('catalogServiceEditorDescriptionEdit')
        }
        disableCancel={!hasChanges}
        disableSave={!hasChanges}
        formId={formId}
        isSaving={isSaving}
        onBack={!isNew ? leaveEditor : undefined}
        onCancel={leaveEditor}
        saveLabel={isNew ? t('createEntry') : t('saveDraft')}
        title={isNew ? t('catalogServiceEditorTitleNew') : t('catalogServiceEditorTitleEdit')}
        titleMeta={
          <div className="flex min-w-0 items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1.5">
            <span className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {t('fieldId')}
            </span>
            <code className="truncate text-xs font-semibold text-foreground">
              {form.serviceId}
            </code>
          </div>
        }
      />

      <form className="flex flex-col gap-6" id={formId} onSubmit={onSubmit}>
        <WorkspacePanel description={t('editorServiceHelper')} title={t('serviceEditorDetailsTitle')}>
          <FieldGroup>
            <TextInputField
              id="service-name"
              error={errors.name}
              inputRef={(node) => {
                fieldRefs.current.name = node ?? undefined;
              }}
              label={t('fieldName')}
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
            <TextAreaField
              id="service-description"
              error={errors.description}
              inputRef={(node) => {
                fieldRefs.current.description = node ?? undefined;
              }}
              label={t('fieldDescription')}
              rows={6}
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
            />
            <TextInputField
              id="service-price"
              error={errors.price}
              inputMode="decimal"
              inputRef={(node) => {
                fieldRefs.current.price = node ?? undefined;
              }}
              label={t('fieldPrice')}
              value={form.price}
              onChange={(event) =>
                setForm((current) => ({ ...current, price: event.target.value }))
              }
            />
          </FieldGroup>
        </WorkspacePanel>

        <WorkspacePanel
          contentClassName="gap-4"
          description={t('fieldSkuSelectionHint')}
          title={t('editorSelectionTitle')}
        >
          <div className="flex items-center justify-between gap-3">
            <Badge className="rounded-full" variant="secondary">
              {form.skuIds.length} {t('editorSelectionCount')}
            </Badge>
          </div>

          <div className="rounded-3xl border border-border/70 bg-background/50 px-4 py-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  {t('fieldLinkedSkus')}
                </p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {form.skuIds.length} {t('serviceEditorLinkedSkusSelected')}
                </p>
              </div>
              <div>
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  {t('serviceEditorCoverageTitle')}
                </p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {currentSellableCoverage == null
                    ? t('serviceEditorCoverageEmpty')
                    : `${currentSellableCoverage} units`}
                </p>
              </div>
              <div>
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  {t('serviceEditorLimitingSkuTitle')}
                </p>
                <p className="mt-2 text-sm font-semibold text-foreground">
                  {limitingSku?.name ?? t('serviceEditorLimitingSkuNone')}
                </p>
              </div>
            </div>
          </div>

          <FieldSet>
            <div>
              <TextInputField
                id="service-sku-search"
                label={t('stockObservationsSearchLabel')}
                placeholder={t('stockObservationsSearchPlaceholder')}
                value={skuQuery}
                onChange={(event) => setSkuQuery(event.target.value)}
              />
            </div>
            <div
              ref={skuSelectionRef}
              className="rounded-3xl border border-border/70 bg-background/60 p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              tabIndex={-1}
            >
              <ScrollArea className="h-72">
                <div className="grid gap-1 p-2">
                  {filteredSkus.map((sku) => {
                    const selected = form.skuIds.includes(sku.skuId);
                    return (
                      <label
                        className={`flex items-center gap-3 rounded-xl px-3 py-2 ${
                          selected ? 'bg-card/80' : 'bg-transparent'
                        }`}
                        key={sku.skuId}
                      >
                        <Checkbox
                          checked={selected}
                          onCheckedChange={(checked) => {
                            const enabled = checked === true;
                            setForm((current) => ({
                              ...current,
                              skuIds: enabled
                                ? [...current.skuIds, sku.skuId]
                                : current.skuIds.filter((value) => value !== sku.skuId),
                            }));
                          }}
                        />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{sku.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{sku.skuId}</p>
                        </div>
                      </label>
                    );
                  })}
                  {filteredSkus.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-muted-foreground">
                      {t('catalogNoResultsDescription')}
                    </p>
                  ) : null}
                </div>
              </ScrollArea>
            </div>
            <FieldError>{errors.skuIds}</FieldError>
          </FieldSet>
        </WorkspacePanel>
      </form>
    </WorkspacePage>
  );
}
