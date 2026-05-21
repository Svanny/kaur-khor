#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE_FILE="$ROOT_DIR/src/renderer/src/globals.css"
OUTPUT_FILE="$ROOT_DIR/design-tokens.js"

if [[ -f "$ROOT_DIR/docs/reference/assets/design-system.html" ]]; then
  OUTPUT_FILE="$ROOT_DIR/docs/reference/assets/design-tokens.js"
fi

read_css_var() {
  local name="$1"
  local value

  value="$(sed -nE "s/^[[:space:]]*--${name}: (.*);/\\1/p" "$SOURCE_FILE" | head -n 1)"
  if [[ -z "$value" ]]; then
    echo "Missing CSS token in $SOURCE_FILE: $name" >&2
    exit 1
  fi

  echo "$value"
}

PRIMARY="$(read_css_var primary)"
SECONDARY="$(read_css_var secondary)"
BACKGROUND="$(read_css_var background)"
SURFACE="$(read_css_var card)"
BORDER="$(read_css_var border)"
TEXT_PRIMARY="$(read_css_var foreground)"
TEXT_SECONDARY="$(read_css_var muted-foreground)"
WHITE="#ffffff"
ERROR="$(read_css_var destructive)"
WARNING="oklch(0.79 0.16 72)"
SUCCESS="oklch(0.67 0.12 148)"
ACCENT_LIGHTER="$(read_css_var secondary)"
ACCENT_DARKER="$(read_css_var accent)"
CHIP_BG="$(read_css_var secondary)"
CHIP_SELECTED="$(read_css_var accent)"
NAV_INDICATOR="$(read_css_var accent)"
BADGE_BG="$(read_css_var secondary)"
BAR_BG="$(read_css_var secondary)"
SHADOW="0 10px 30px rgba(27, 15, 7, 0.06)"

FONT_FAMILY="'Noto Sans Oriya', 'Helvetica Neue', 'Noto Sans Khmer', 'Segoe UI', sans-serif"
FS_HEADLINE="42px"
FS_TITLE_LARGE="30px"
FS_TITLE_MEDIUM="22px"
FS_BODY_LARGE="16px"
FS_BODY_MEDIUM="13px"
FW_REGULAR="400"
FW_MEDIUM="500"
FW_SEMIBOLD="600"
FW_BOLD="700"
LH_BODY_LARGE="1.55"
LH_BODY_MEDIUM="1.45"
LS_HEADLINE="-0.4px"

RADIUS_MD="0.7875rem"
RADIUS_PILL="999px"
RADIUS_NAV="0.7875rem"

SPACE_1="4px"
SPACE_2="8px"
SPACE_3="12px"
SPACE_4="16px"
SPACE_6="24px"
SPACE_8="32px"

BUTTON_PAD_X="16px"
BUTTON_PAD_Y="12px"
INPUT_PAD_X="14px"
INPUT_PAD_Y="12px"
CHIP_PAD_X="12px"
CHIP_PAD_Y="8px"
NAV_ITEM_PAD_X="12px"
NAV_ITEM_PAD_Y="10px"
SCREEN_EDGE_PADDING_MIN="1.1rem"
SCREEN_EDGE_PADDING_MAX="2rem"
SCREEN_EDGE_PADDING_WIDTH_VW="1.8vw"
SCREEN_EDGE_PADDING_VERTICAL_MIN="1.1rem"
ELEVATION_1="$SHADOW"

cat > "$OUTPUT_FILE" <<EOF_JS
window.APP_THEME_TOKENS = {
  source: "src/renderer/src/globals.css",
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
  layout: {
    "edge-min": "${SCREEN_EDGE_PADDING_MIN}",
    "edge-max": "${SCREEN_EDGE_PADDING_MAX}",
    "edge-vw": "${SCREEN_EDGE_PADDING_WIDTH_VW}",
    "edge-vertical-min": "${SCREEN_EDGE_PADDING_VERTICAL_MIN}"
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
