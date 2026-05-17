export const PRODUCT_ATTRIBUTE_PRESETS_STORAGE_KEY = 'kaur-khor:product-attribute-presets:v1';

export interface ProductAttributePreset {
  name: string;
  options: string[];
}

export interface ProductAttributeDraftRow {
  name: string;
  options: string[];
  selectedOptions: string[];
}

export interface ProductAttributeDraft {
  enabled: boolean;
  rows: ProductAttributeDraftRow[];
}

export interface ProductAttributeSelection {
  name: string;
  option: string;
}

export type ProductAttributeCombination = ProductAttributeSelection[];

export const MAX_PRODUCT_ATTRIBUTE_VARIANTS = 100;

export const curatedProductAttributePresets: ProductAttributePreset[] = [
  { name: 'Size', options: ['XS', 'S', 'M', 'L', 'XL', 'XXL'] },
  { name: 'Color', options: ['Black', 'White', 'Red', 'Blue', 'Green', 'Yellow', 'Pink', 'Purple', 'Gray', 'Brown'] },
  { name: 'Flavor', options: ['Original', 'Spicy', 'Sweet', 'Sour', 'Savory', 'Unsweetened'] },
  { name: 'Pack size', options: ['Single', '2-pack', '3-pack', '6-pack', '12-pack', 'Bulk'] },
  { name: 'Material', options: ['Cotton', 'Plastic', 'Metal', 'Glass', 'Wood', 'Ceramic', 'Leather'] },
  { name: 'Quality', options: ['Standard', 'Premium', 'Economy', 'Limited'] },
  { name: 'Format', options: ['Physical', 'Digital', 'Printed', 'Refillable'] },
  { name: 'Duration', options: ['30 min', '60 min', '90 min', 'Half day', 'Full day'] },
  { name: 'Service type', options: ['Basic', 'Standard', 'Premium', 'Express', 'Custom'] },
  { name: 'Location', options: ['In-store', 'Delivery', 'On-site', 'Remote'] },
];

export function emptyProductAttributeDraft(): ProductAttributeDraft {
  return {
    enabled: false,
    rows: [],
  };
}

function normalizeKey(value: string) {
  return value.trim().toLocaleLowerCase();
}

function sanitizeText(value: unknown) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

export function sanitizeProductAttributePresets(value: unknown): ProductAttributePreset[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const presets = new Map<string, ProductAttributePreset>();

  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const candidate = entry as { name?: unknown; options?: unknown };
    const name = sanitizeText(candidate.name);
    if (!name || !Array.isArray(candidate.options)) {
      continue;
    }

    const existing = presets.get(normalizeKey(name));
    const optionMap = new Map<string, string>();
    for (const option of existing?.options ?? []) {
      optionMap.set(normalizeKey(option), option);
    }
    for (const option of candidate.options) {
      const sanitizedOption = sanitizeText(option);
      if (sanitizedOption) {
        optionMap.set(normalizeKey(sanitizedOption), sanitizedOption);
      }
    }

    const options = Array.from(optionMap.values());
    if (options.length > 0) {
      presets.set(normalizeKey(name), {
        name: existing?.name ?? name,
        options,
      });
    }
  }

  return Array.from(presets.values());
}

export function mergedProductAttributePresets(customPresets: ProductAttributePreset[]) {
  const presets = new Map<string, ProductAttributePreset>();
  for (const preset of curatedProductAttributePresets) {
    presets.set(normalizeKey(preset.name), {
      name: preset.name,
      options: [...preset.options],
    });
  }

  for (const preset of sanitizeProductAttributePresets(customPresets)) {
    const key = normalizeKey(preset.name);
    const existing = presets.get(key);
    if (!existing) {
      presets.set(key, preset);
      continue;
    }

    const optionMap = new Map(existing.options.map((option) => [normalizeKey(option), option] as const));
    for (const option of preset.options) {
      optionMap.set(normalizeKey(option), option);
    }
    presets.set(key, {
      name: existing.name,
      options: Array.from(optionMap.values()),
    });
  }

  return Array.from(presets.values());
}

function productAttributePresetStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readCustomProductAttributePresets(storage?: Storage | null) {
  const resolvedStorage = storage === undefined ? productAttributePresetStorage() : storage;
  if (!resolvedStorage) {
    return [];
  }

  try {
    return sanitizeProductAttributePresets(JSON.parse(resolvedStorage.getItem(PRODUCT_ATTRIBUTE_PRESETS_STORAGE_KEY) ?? '[]'));
  } catch {
    return [];
  }
}

export function writeCustomProductAttributePresets(
  presets: ProductAttributePreset[],
  storage?: Storage | null,
) {
  const resolvedStorage = storage === undefined ? productAttributePresetStorage() : storage;
  if (!resolvedStorage) {
    return;
  }

  try {
    resolvedStorage.setItem(PRODUCT_ATTRIBUTE_PRESETS_STORAGE_KEY, JSON.stringify(sanitizeProductAttributePresets(presets)));
  } catch {
    // Local storage is optional for this creation helper.
  }
}

export function customProductAttributePresetsFromDraft(draft: ProductAttributeDraft) {
  const curatedByName = new Map(curatedProductAttributePresets.map((preset) => [normalizeKey(preset.name), preset] as const));
  const customPresets: ProductAttributePreset[] = [];

  for (const row of draft.rows) {
    const name = sanitizeText(row.name);
    const options = sanitizeProductAttributeOptions(row.options);
    if (!name || options.length === 0) {
      continue;
    }

    const curated = curatedByName.get(normalizeKey(name));
    if (!curated) {
      customPresets.push({ name, options });
      continue;
    }

    const curatedOptionKeys = new Set(curated.options.map(normalizeKey));
    const customOptions = options.filter((option) => !curatedOptionKeys.has(normalizeKey(option)));
    if (customOptions.length > 0) {
      customPresets.push({ name: curated.name, options: customOptions });
    }
  }

  return sanitizeProductAttributePresets(customPresets);
}

export function mergeCustomProductAttributePresets(
  currentPresets: ProductAttributePreset[],
  draft: ProductAttributeDraft,
) {
  return sanitizeProductAttributePresets([
    ...currentPresets,
    ...customProductAttributePresetsFromDraft(draft),
  ]);
}

export function sanitizeProductAttributeOptions(options: unknown) {
  if (!Array.isArray(options)) {
    return [];
  }
  const optionMap = new Map<string, string>();
  for (const option of options) {
    const sanitizedOption = sanitizeText(option);
    if (sanitizedOption) {
      optionMap.set(normalizeKey(sanitizedOption), sanitizedOption);
    }
  }
  return Array.from(optionMap.values());
}

export function sanitizedProductAttributeDraft(draft: ProductAttributeDraft): ProductAttributeDraft {
  return {
    enabled: Boolean(draft.enabled),
    rows: draft.rows
      .map((row) => {
        const name = sanitizeText(row.name);
        const options = sanitizeProductAttributeOptions(row.options);
        const optionKeys = new Set(options.map(normalizeKey));
        const selectedOptions = sanitizeProductAttributeOptions(row.selectedOptions).filter((option) =>
          optionKeys.has(normalizeKey(option)),
        );
        return { name, options, selectedOptions };
      })
      .filter((row) => row.name || row.options.length > 0 || row.selectedOptions.length > 0),
  };
}

export function productAttributeDraftDirtyKey(draft: ProductAttributeDraft) {
  return JSON.stringify(sanitizedProductAttributeDraft(draft));
}

export function productAttributeCombinations(draft: ProductAttributeDraft): ProductAttributeCombination[] {
  const sanitizedDraft = sanitizedProductAttributeDraft(draft);
  if (!sanitizedDraft.enabled) {
    return [];
  }

  const rows = sanitizedDraft.rows.filter((row) => row.name && row.selectedOptions.length > 0);
  if (rows.length === 0) {
    return [];
  }

  if (productAttributeCombinationCount(draft) > MAX_PRODUCT_ATTRIBUTE_VARIANTS) {
    return [];
  }

  return rows.reduce<ProductAttributeCombination[]>(
    (combinations, row) =>
      combinations.flatMap((combination) =>
        row.selectedOptions.map((option) => [...combination, { name: row.name, option }]),
      ),
    [[]],
  );
}

export function productAttributeCombinationCount(draft: ProductAttributeDraft) {
  const sanitizedDraft = sanitizedProductAttributeDraft(draft);
  if (!sanitizedDraft.enabled) {
    return 0;
  }

  const rows = sanitizedDraft.rows.filter((row) => row.name && row.selectedOptions.length > 0);
  if (rows.length === 0) {
    return 0;
  }

  let count = 1;
  for (const row of rows) {
    count *= row.selectedOptions.length;
    if (count > MAX_PRODUCT_ATTRIBUTE_VARIANTS) {
      return count;
    }
  }
  return count;
}

export function formatProductAttributeSuffix(combination: ProductAttributeCombination) {
  return `(${combination.map((selection) => `${selection.name}: ${selection.option}`).join(', ')})`;
}

export function productVariantName(baseName: string, combination: ProductAttributeCombination) {
  const normalizedBaseName = sanitizeText(baseName) || 'Untitled';
  return `${normalizedBaseName} ${formatProductAttributeSuffix(combination)}`;
}

export function uniqueProductVariantName(
  existingNames: string[],
  baseName: string,
  combination: ProductAttributeCombination,
) {
  const initialName = productVariantName(baseName, combination);
  const normalizedNames = new Set(existingNames.map(normalizeKey));
  if (!normalizedNames.has(normalizeKey(initialName))) {
    return initialName;
  }

  for (let index = 1; index < 10_000; index += 1) {
    const candidate = `${initialName} (${index})`;
    if (!normalizedNames.has(normalizeKey(candidate))) {
      return candidate;
    }
  }

  return `${initialName} (${Date.now()})`;
}
