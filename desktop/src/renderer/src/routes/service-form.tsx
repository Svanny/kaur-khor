import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Checkbox } from '@/components/ui/checkbox';
import {
  FieldError,
  FieldGroup,
  FieldSet,
  FieldLegend,
} from '@/components/ui/field';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { EditorHeader, EditorRail } from '@/components/system/editor';
import { TextAreaField, TextInputField } from '@/components/system/form-fields';
import { WorkspacePage, WorkspacePanel } from '@/components/system/workspace';
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
    price: currentService?.price.toString() ?? '',
    skuIds: currentService?.skuIds ?? [],
  });
  const [errors, setErrors] = useState<Partial<Record<ServiceField, string>>>({});
  const fieldRefs = useRef<
    Partial<Record<'name' | 'description' | 'price', HTMLInputElement | HTMLTextAreaElement>>
  >({});
  const skuSelectionRef = useRef<HTMLDivElement | null>(null);

  const initialForm = useMemo(
    () => ({
      serviceId: currentService?.serviceId ?? form.serviceId,
      name: currentService?.name ?? '',
      description: currentService?.description ?? '',
      price: currentService?.price.toString() ?? '',
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
        price: currentService.price.toString(),
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
      navigate('/inventory');
    } catch {
      return;
    }
  }

  function leaveEditor() {
    if (hasChanges && !window.confirm(t('unsavedChanges'))) {
      return;
    }
    navigate('/inventory');
  }

  return (
    <WorkspacePage>
      <EditorHeader
        backLabel={!isNew ? t('backToCatalog') : undefined}
        cancelLabel={t('cancel')}
        formId={formId}
        isSaving={isSaving}
        onBack={!isNew ? leaveEditor : undefined}
        onCancel={leaveEditor}
        saveLabel={isNew ? t('createEntry') : t('saveDraft')}
      />

      <form className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.95fr)]" id={formId} onSubmit={onSubmit}>
        <WorkspacePanel description={t('editorServiceHelper')} title={t('editorDetailsTitle')}>
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
              onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))}
            />
          </FieldGroup>
        </WorkspacePanel>

        <EditorRail description={t('fieldSkuSelectionHint')} title={t('editorSelectionTitle')}>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">{t('fieldSkuSelectionHint')}</p>
            <Badge className="rounded-full" variant="secondary">
              {form.skuIds.length} {t('editorSelectionCount')}
            </Badge>
          </div>

          <FieldSet className="mt-4">
            <FieldLegend variant="label">{t('fieldLinkedSkus')}</FieldLegend>
            <div
              ref={skuSelectionRef}
              className="rounded-3xl border border-border/70 bg-background/60 p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              tabIndex={-1}
            >
              <ScrollArea className="h-72">
                <div className="grid gap-2 p-2">
                  {snapshot?.skus.map((sku) => {
                    const selected = form.skuIds.includes(sku.skuId);
                    return (
                      <label
                        className="flex items-start gap-3 rounded-2xl border border-border/75 bg-card/70 px-4 py-3"
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
                          <p className="truncate font-medium text-foreground">{sku.name}</p>
                          <p className="truncate text-sm text-muted-foreground">{sku.skuId}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
            <FieldError>{errors.skuIds}</FieldError>
          </FieldSet>
        </EditorRail>
      </form>
    </WorkspacePage>
  );
}
