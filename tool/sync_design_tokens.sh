#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_FILE="$ROOT_DIR/lib/theme/app_theme.dart"
OUTPUT_FILE="$ROOT_DIR/design-tokens.js"

read_color_const() {
  local name="$1"
  local hex
  hex="$(sed -nE "s/^[[:space:]]*static const Color ${name} = Color\(0x([0-9A-Fa-f]{8})\);/\1/p" "$SOURCE_FILE" | head -n 1)"
  if [[ -z "$hex" ]]; then
    echo "Missing color token in $SOURCE_FILE: $name" >&2
    exit 1
  fi
  echo "$hex" | tr '[:lower:]' '[:upper:]'
}

color_to_css() {
  local hex="$1"
  local a="${hex:0:2}"
  local r="${hex:2:2}"
  local g="${hex:4:2}"
  local b="${hex:6:2}"

  if [[ "$a" == "FF" ]]; then
    echo "#${r}${g}${b}"
    return
  fi

  local ai ri gi bi
  ai=$((16#$a))
  ri=$((16#$r))
  gi=$((16#$g))
  bi=$((16#$b))

  local alpha
  alpha="$(awk -v a="$ai" 'BEGIN { printf "%.4f", a / 255 }')"
  alpha="$(echo "$alpha" | sed 's/0*$//; s/\.$//')"
  echo "rgba(${ri}, ${gi}, ${bi}, ${alpha})"
}

read_number_const() {
  local name="$1"
  local value
  value="$(sed -nE "s/^[[:space:]]*static const (double|int) ${name} = (-?[0-9]+(\.[0-9]+)?);/\2/p" "$SOURCE_FILE" | head -n 1)"
  if [[ -z "$value" ]]; then
    echo "Missing numeric token in $SOURCE_FILE: $name" >&2
    exit 1
  fi
  echo "$value"
}

read_string_const() {
  local name="$1"
  local value
  value="$(sed -nE "s/^[[:space:]]*static const String ${name} = '([^']+)';/\1/p" "$SOURCE_FILE" | head -n 1)"
  if [[ -z "$value" ]]; then
    echo "Missing string token in $SOURCE_FILE: $name" >&2
    exit 1
  fi
  echo "$value"
}

px() {
  printf "%spx" "$1"
}

PRIMARY="$(color_to_css "$(read_color_const primary)")"
SECONDARY="$(color_to_css "$(read_color_const secondary)")"
BACKGROUND="$(color_to_css "$(read_color_const background)")"
SURFACE="$(color_to_css "$(read_color_const surface)")"
BORDER="$(color_to_css "$(read_color_const border)")"
TEXT_PRIMARY="$(color_to_css "$(read_color_const textPrimary)")"
TEXT_SECONDARY="$(color_to_css "$(read_color_const textSecondary)")"
WHITE="$(color_to_css "$(read_color_const white)")"
ERROR="$(color_to_css "$(read_color_const error)")"
WARNING="$(color_to_css "$(read_color_const warning)")"
SUCCESS="$(color_to_css "$(read_color_const success)")"
ACCENT_LIGHTER="$(color_to_css "$(read_color_const accentLighter)")"
ACCENT_DARKER="$(color_to_css "$(read_color_const accentDarker)")"
CHIP_BG="$(color_to_css "$(read_color_const chipBackground)")"
CHIP_SELECTED="$(color_to_css "$(read_color_const chipSelected)")"
NAV_INDICATOR="$(color_to_css "$(read_color_const navIndicator)")"
BADGE_BG="$(color_to_css "$(read_color_const badgeBackground)")"
BAR_BG="$(color_to_css "$(read_color_const barBackground)")"
SHADOW="$(color_to_css "$(read_color_const shadow)")"

FONT_FAMILY_BASE="$(read_string_const fontFamily)"
FONT_FAMILY="'${FONT_FAMILY_BASE}', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"

FS_HEADLINE="$(px "$(read_number_const fontSizeHeadlineSmall)")"
FS_TITLE_LARGE="$(px "$(read_number_const fontSizeTitleLarge)")"
FS_TITLE_MEDIUM="$(px "$(read_number_const fontSizeTitleMedium)")"
FS_BODY_LARGE="$(px "$(read_number_const fontSizeBodyLarge)")"
FS_BODY_MEDIUM="$(px "$(read_number_const fontSizeBodyMedium)")"
FW_REGULAR="$(read_number_const fontWeightRegular)"
FW_MEDIUM="$(read_number_const fontWeightMedium)"
FW_SEMIBOLD="$(read_number_const fontWeightSemibold)"
FW_BOLD="$(read_number_const fontWeightBold)"
LH_BODY_LARGE="$(read_number_const lineHeightBodyLarge)"
LH_BODY_MEDIUM="$(read_number_const lineHeightBodyMedium)"
LS_HEADLINE="$(px "$(read_number_const letterSpacingHeadline)")"

RADIUS_MD="$(px "$(read_number_const radiusMd)")"
RADIUS_PILL="$(px "$(read_number_const radiusPill)")"
RADIUS_NAV="$(px "$(read_number_const radiusNavItem)")"

SPACE_1="$(px "$(read_number_const space1)")"
SPACE_2="$(px "$(read_number_const space2)")"
SPACE_3="$(px "$(read_number_const space3)")"
SPACE_4="$(px "$(read_number_const space4)")"
SPACE_6="$(px "$(read_number_const space6)")"
SPACE_8="$(px "$(read_number_const space8)")"

BUTTON_PAD_X="$(px "$(read_number_const buttonPaddingX)")"
BUTTON_PAD_Y="$(px "$(read_number_const buttonPaddingY)")"
INPUT_PAD_X="$(px "$(read_number_const inputPaddingX)")"
INPUT_PAD_Y="$(px "$(read_number_const inputPaddingY)")"
CHIP_PAD_X="$(px "$(read_number_const chipPaddingX)")"
CHIP_PAD_Y="$(px "$(read_number_const chipPaddingY)")"
NAV_ITEM_PAD_X="$(px "$(read_number_const navItemPaddingX)")"
NAV_ITEM_PAD_Y="$(px "$(read_number_const navItemPaddingY)")"

ELEVATION1_Y="$(px "$(read_number_const elevation1OffsetY)")"
ELEVATION1_BLUR="$(px "$(read_number_const elevation1Blur)")"
ELEVATION_1="0 ${ELEVATION1_Y} ${ELEVATION1_BLUR} ${SHADOW}"

cat > "$OUTPUT_FILE" <<EOF_JS
window.APP_THEME_TOKENS = {
  source: "lib/theme/app_theme.dart",
  colors: {
    "primary": "${PRIMARY}",
    "secondary": "${SECONDARY}",
    "background": "${BACKGROUND}",
    "surface": "${SURFACE}",
    "border": "${BORDER}",
    "text-primary": "${TEXT_PRIMARY}",
    "text-secondary": "${TEXT_SECONDARY}",
    "white": "${WHITE}",
    "error": "${ERROR}",
    "warning": "${WARNING}",
    "success": "${SUCCESS}",
    "accent-lighter": "${ACCENT_LIGHTER}",
    "accent-darker": "${ACCENT_DARKER}",
    "chip-bg": "${CHIP_BG}",
    "chip-selected": "${CHIP_SELECTED}",
    "nav-indicator": "${NAV_INDICATOR}",
    "badge-bg": "${BADGE_BG}",
    "bar-bg": "${BAR_BG}",
    "shadow": "${SHADOW}"
  },
  typography: {
    "font-size-headline-small": "${FS_HEADLINE}",
    "font-size-title-large": "${FS_TITLE_LARGE}",
    "font-size-title-medium": "${FS_TITLE_MEDIUM}",
    "font-size-body-large": "${FS_BODY_LARGE}",
    "font-size-body-medium": "${FS_BODY_MEDIUM}",
    "font-weight-regular": "${FW_REGULAR}",
    "font-weight-medium": "${FW_MEDIUM}",
    "font-weight-semibold": "${FW_SEMIBOLD}",
    "font-weight-bold": "${FW_BOLD}",
    "line-height-body-large": "${LH_BODY_LARGE}",
    "line-height-body-medium": "${LH_BODY_MEDIUM}",
    "letter-spacing-headline": "${LS_HEADLINE}"
  },
  radius: {
    "md": "${RADIUS_MD}",
    "pill": "${RADIUS_PILL}",
    "nav": "${RADIUS_NAV}"
  },
  spacing: {
    "1": "${SPACE_1}",
    "2": "${SPACE_2}",
    "3": "${SPACE_3}",
    "4": "${SPACE_4}",
    "6": "${SPACE_6}",
    "8": "${SPACE_8}"
  },
  component: {
    "button-padding-x": "${BUTTON_PAD_X}",
    "button-padding-y": "${BUTTON_PAD_Y}",
    "input-padding-x": "${INPUT_PAD_X}",
    "input-padding-y": "${INPUT_PAD_Y}",
    "chip-padding-x": "${CHIP_PAD_X}",
    "chip-padding-y": "${CHIP_PAD_Y}",
    "nav-item-padding-x": "${NAV_ITEM_PAD_X}",
    "nav-item-padding-y": "${NAV_ITEM_PAD_Y}"
  },
  elevation: {
    "1": "${ELEVATION_1}"
  },
  font: {
    "family": "${FONT_FAMILY}"
  },
  generatedAt: "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
};
EOF_JS

echo "Updated $OUTPUT_FILE from $SOURCE_FILE"
