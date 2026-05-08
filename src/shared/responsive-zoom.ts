export const RESPONSIVE_ZOOM_WIDTH_HYSTERESIS_PX = 24;
export const RESPONSIVE_ZOOM_HEIGHT_HYSTERESIS_PX = 16;
export const RESPONSIVE_ZOOM_AREA_HYSTERESIS_PX = 32_000;
export const RESPONSIVE_ZOOM_HYSTERESIS_PX = RESPONSIVE_ZOOM_WIDTH_HYSTERESIS_PX;
export const RESPONSIVE_PHONE_WIDTH_THRESHOLD_PX = 740;
export const RESPONSIVE_PHONE_LANDSCAPE_MAX_ASPECT_RATIO = 16 / 9;
export const RESPONSIVE_PHONE_VIEWPORT_MAX_SCALE = 0.4;

export type ResponsiveZoomLevel = 0 | -0.5 | -1 | -1.5 | -2;

type ResponsiveZoomBand = {
  minValue: number;
  level: ResponsiveZoomLevel;
};

export const RESPONSIVE_ZOOM_WIDTH_BANDS: ResponsiveZoomBand[] = [
  { minValue: 1600, level: 0 },
  { minValue: 1440, level: -0.5 },
  { minValue: 1280, level: -1 },
  { minValue: 1120, level: -1.5 },
  { minValue: 0, level: -2 },
];

export const RESPONSIVE_ZOOM_HEIGHT_BANDS: ResponsiveZoomBand[] = [
  { minValue: 900, level: 0 },
  { minValue: 800, level: -0.5 },
  { minValue: 720, level: -1 },
  { minValue: 640, level: -1.5 },
  { minValue: 0, level: -2 },
];

export const RESPONSIVE_ZOOM_AREA_BANDS: ResponsiveZoomBand[] = [
  { minValue: 1_440_000, level: 0 },
  { minValue: 1_152_000, level: -0.5 },
  { minValue: 921_600, level: -1 },
  { minValue: 716_800, level: -1.5 },
  { minValue: 0, level: -2 },
];

export const RESPONSIVE_ZOOM_BANDS = RESPONSIVE_ZOOM_WIDTH_BANDS;

export type ResponsiveViewportDimensions = {
  height: number;
  previousLevel?: number | null;
  width: number;
};

function finiteMeasuredDimension(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function finiteConstraintDimension(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : Number.POSITIVE_INFINITY;
}

function constraintArea(width: number, height: number) {
  return Number.isFinite(width) && Number.isFinite(height) ? Math.max(0, width) * Math.max(0, height) : Number.POSITIVE_INFINITY;
}

function bandForLevel(bands: ResponsiveZoomBand[], level: number) {
  return bands.find((band) => band.level === level) ?? null;
}

function nextLessConstrainedBand(bands: ResponsiveZoomBand[], level: number) {
  const index = bands.findIndex((band) => band.level === level);
  if (index <= 0) {
    return null;
  }
  return bands[index - 1] ?? null;
}

function selectDimensionZoomLevel(
  value: number,
  bands: ResponsiveZoomBand[],
  hysteresis: number,
  previousLevel?: number | null,
): ResponsiveZoomLevel {
  const normalizedValue = finiteConstraintDimension(value);
  const previousBand = previousLevel == null ? null : bandForLevel(bands, previousLevel);

  if (previousBand) {
    const lessConstrainedBand = nextLessConstrainedBand(bands, previousBand.level);
    const expandedMinValue = Math.max(0, previousBand.minValue - hysteresis);
    const expandedMaxValue = lessConstrainedBand
      ? lessConstrainedBand.minValue + hysteresis
      : Number.POSITIVE_INFINITY;

    if (normalizedValue >= expandedMinValue && normalizedValue < expandedMaxValue) {
      return previousBand.level;
    }
  }

  return bands.find((band) => normalizedValue >= band.minValue)?.level ?? -2;
}

function normalizeZoomInput(
  input: ResponsiveViewportDimensions | number,
  heightOrPreviousLevel?: number | null,
  previousLevel?: number | null,
): ResponsiveViewportDimensions {
  if (typeof input === 'object') {
    return input;
  }

  if (previousLevel === undefined && (heightOrPreviousLevel == null || heightOrPreviousLevel <= 0)) {
    return {
      height: Number.POSITIVE_INFINITY,
      previousLevel: heightOrPreviousLevel,
      width: input,
    };
  }

  return {
    height: heightOrPreviousLevel ?? Number.POSITIVE_INFINITY,
    previousLevel,
    width: input,
  };
}

export function deriveResponsiveZoomConstraintLevels(
  input: ResponsiveViewportDimensions | number,
  heightOrPreviousLevel?: number | null,
  previousLevel?: number | null,
) {
  const {
    height,
    previousLevel: normalizedPreviousLevel,
    width,
  } = normalizeZoomInput(input, heightOrPreviousLevel, previousLevel);
  const normalizedWidth = finiteConstraintDimension(width);
  const normalizedHeight = finiteConstraintDimension(height);

  return {
    areaLevel: selectDimensionZoomLevel(
      constraintArea(normalizedWidth, normalizedHeight),
      RESPONSIVE_ZOOM_AREA_BANDS,
      RESPONSIVE_ZOOM_AREA_HYSTERESIS_PX,
      normalizedPreviousLevel,
    ),
    heightLevel: selectDimensionZoomLevel(
      normalizedHeight,
      RESPONSIVE_ZOOM_HEIGHT_BANDS,
      RESPONSIVE_ZOOM_HEIGHT_HYSTERESIS_PX,
      normalizedPreviousLevel,
    ),
    widthLevel: selectDimensionZoomLevel(
      normalizedWidth,
      RESPONSIVE_ZOOM_WIDTH_BANDS,
      RESPONSIVE_ZOOM_WIDTH_HYSTERESIS_PX,
      normalizedPreviousLevel,
    ),
  };
}

export function selectResponsiveZoomLevel(
  input: ResponsiveViewportDimensions | number,
  heightOrPreviousLevel?: number | null,
  previousLevel?: number | null,
): ResponsiveZoomLevel {
  const levels = deriveResponsiveZoomConstraintLevels(input, heightOrPreviousLevel, previousLevel);
  return Math.min(levels.widthLevel, levels.heightLevel, levels.areaLevel) as ResponsiveZoomLevel;
}

export function zoomLevelToScale(level: number) {
  return 1.2 ** level;
}

export function isPhonePortraitViewport(width: number, height: number) {
  const normalizedWidth = finiteMeasuredDimension(width);
  const normalizedHeight = finiteMeasuredDimension(height);
  return normalizedWidth > 0 && normalizedWidth < RESPONSIVE_PHONE_WIDTH_THRESHOLD_PX && normalizedHeight > normalizedWidth;
}

export function isPhoneLandscapeViewport(width: number, height: number) {
  const normalizedWidth = finiteMeasuredDimension(width);
  const normalizedHeight = finiteMeasuredDimension(height);
  return normalizedHeight > 0 && normalizedHeight < RESPONSIVE_PHONE_WIDTH_THRESHOLD_PX && normalizedWidth > normalizedHeight;
}

export function derivePhoneLandscapeViewportDimensions(width: number, height: number) {
  const normalizedWidth = finiteMeasuredDimension(width);
  const normalizedHeight = finiteMeasuredDimension(height);
  const rawLandscapeWidth = Math.max(normalizedWidth, normalizedHeight);
  const rawLandscapeHeight = Math.min(normalizedWidth, normalizedHeight);
  const measuredHeight = Math.max(
    rawLandscapeHeight,
    Math.ceil(rawLandscapeWidth / RESPONSIVE_PHONE_LANDSCAPE_MAX_ASPECT_RATIO),
  );

  return {
    measuredHeight,
    measuredWidth: rawLandscapeWidth,
    sidePadding: (measuredHeight - rawLandscapeHeight) / 2,
  };
}

export function deriveNativePhoneLandscapeViewportDimensions(width: number, height: number) {
  const normalizedWidth = finiteMeasuredDimension(width);
  const normalizedHeight = finiteMeasuredDimension(height);
  const measuredWidth = Math.min(
    normalizedWidth,
    Math.floor(normalizedHeight * RESPONSIVE_PHONE_LANDSCAPE_MAX_ASPECT_RATIO),
  );

  return {
    measuredHeight: normalizedHeight,
    measuredWidth,
    sidePadding: (normalizedWidth - measuredWidth) / 2,
  };
}

export function deriveResponsiveViewportPolicy({
  height,
  previousLevel,
  width,
}: {
  height: number;
  previousLevel?: number | null;
  width: number;
}) {
  const normalizedWidth = finiteMeasuredDimension(width);
  const normalizedHeight = finiteMeasuredDimension(height);
  const phoneLandscape = isPhonePortraitViewport(normalizedWidth, normalizedHeight);
  const phoneViewport = phoneLandscape || isPhoneLandscapeViewport(normalizedWidth, normalizedHeight);
  const phoneLandscapeDimensions = phoneLandscape
    ? derivePhoneLandscapeViewportDimensions(normalizedWidth, normalizedHeight)
    : isPhoneLandscapeViewport(normalizedWidth, normalizedHeight)
      ? deriveNativePhoneLandscapeViewportDimensions(normalizedWidth, normalizedHeight)
      : null;
  const measuredWidth = phoneLandscapeDimensions?.measuredWidth ?? normalizedWidth;
  const measuredHeight = phoneLandscapeDimensions?.measuredHeight ?? normalizedHeight;
  const constraintLevels = deriveResponsiveZoomConstraintLevels({
    height: measuredHeight,
    previousLevel,
    width: measuredWidth,
  });
  const zoomLevel = Math.min(
    constraintLevels.widthLevel,
    constraintLevels.heightLevel,
    constraintLevels.areaLevel,
  ) as ResponsiveZoomLevel;
  const responsiveScale = zoomLevelToScale(zoomLevel);
  const scale = phoneViewport
    ? Math.min(responsiveScale, RESPONSIVE_PHONE_VIEWPORT_MAX_SCALE)
    : responsiveScale;

  return {
    constraintLevels,
    effectiveHeight: scale > 0 ? measuredHeight / scale : measuredHeight,
    effectiveWidth: scale > 0 ? measuredWidth / scale : measuredWidth,
    measuredArea: measuredWidth * measuredHeight,
    measuredHeight,
    measuredWidth,
    phoneLandscape,
    phoneViewport,
    phoneLandscapeSidePadding: phoneLandscapeDimensions?.sidePadding ?? 0,
    scale,
    zoomLevel,
  };
}
