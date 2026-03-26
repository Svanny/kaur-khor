import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { PageIntro, PageSection, SaveHeader, SectionHeading, Surface } from '@/components/banji-primitives';
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
  const fieldRefs = useRef<Partial<Record<'name' | 'description' | 'price', HTMLInputElement | HTMLTextAreaElement>>>({});
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
        isNew,
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
    <PageSection className="space-y-6">
      <SaveHeader
        cancelLabel={t('cancel')}
        description={t('editorServiceHelper')}
        formId={formId}
        hasChanges={hasChanges}
        isSaving={isSaving}
        onBack={leaveEditor}
        onCancel={leaveEditor}
        saveLabel={isNew ? t('createEntry') : t('saveDraft')}
        savedLabel={t('savedState')}
        title={t('serviceEditorTitle')}
        unsavedLabel={t('unsavedChanges')}
      />

      <PageIntro
        aside={
          <Badge className="rounded-full px-4 py-2 text-sm" variant="secondary">
            {form.serviceId}
          </Badge>
        }
        description={t('editorServiceHelper')}
        eyebrow={t('serviceLabel')}
        title={form.name || t('serviceEditorTitle')}
      />

      <form className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.95fr)]" id={formId} onSubmit={onSubmit}>
        <Surface className="space-y-5">
          <SectionHeading title={t('editorDetailsTitle')} />
          <div className="grid gap-4">
            <Field error={errors.name} label={t('fieldName')}>
              <Input
                ref={(node) => {
                  fieldRefs.current.name = node;
                }}
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
            </Field>
            <Field error={errors.description} label={t('fieldDescription')}>
              <Textarea
                ref={(node) => {
                  fieldRefs.current.description = node;
                }}
                rows={6}
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({ ...current, description: event.target.value }))
                }
              />
            </Field>
            <Field error={errors.price} label={t('fieldPrice')}>
              <Input
                ref={(node) => {
                  fieldRefs.current.price = node;
                }}
                inputMode="decimal"
                value={form.price}
                onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))}
              />
            </Field>
          </div>
        </Surface>

        <Surface className="space-y-5">
          <div className="flex items-center justify-between gap-3">
            <SectionHeading title={t('editorSelectionTitle')} />
            <Badge className="rounded-full" variant="secondary">
              {form.skuIds.length} {t('editorSelectionCount')}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">{t('fieldSkuSelectionHint')}</p>
          <div
            ref={skuSelectionRef}
            className="rounded-[24px] border border-border/70 bg-background/70 p-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            tabIndex={-1}
          >
            <ScrollArea className="h-72">
              <div className="grid gap-2 p-3">
                {snapshot?.skus.map((sku) => {
                  const selected = form.skuIds.includes(sku.skuId);
                  return (
                    <label
                      className="flex items-start gap-3 rounded-[20px] border border-border/70 bg-card/80 px-4 py-3"
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
          {errors.skuIds ? <p className="text-sm text-destructive">{errors.skuIds}</p> : null}
        </Surface>
      </form>
    </PageSection>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium text-foreground">
      <span>{label}</span>
      {children}
      {error ? <span className="text-sm font-normal text-destructive">{error}</span> : null}
    </label>
  );
}
