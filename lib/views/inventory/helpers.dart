part of '../inventory_views.dart';

const String _pointOfSaleSvgAsset =
    'icons/sell_24dp_E3E3E3_FILL0_wght400_GRAD0_opsz24.svg';
const String _listAltSvgAsset =
    'icons/list_alt_24dp_E3E3E3_FILL0_wght400_GRAD0_opsz24.svg';
const String _labelSvgAsset =
    'icons/label_24dp_E3E3E3_FILL0_wght400_GRAD0_opsz24.svg';
const String _descriptionSvgAsset =
    'icons/description_24dp_E3E3E3_FILL0_wght400_GRAD0_opsz24.svg';
const String _package2SvgAsset =
    'icons/package_2_24dp_E3E3E3_FILL0_wght400_GRAD0_opsz24.svg';
const String _paymentsSvgAsset =
    'icons/payments_24dp_E3E3E3_FILL0_wght400_GRAD0_opsz24.svg';

double _inventorySvgIconWidth({
  required String assetPath,
  required double size,
}) {
  if (assetPath == _defaultServicePictureAsset) {
    // Keep apron glyph visually aligned with inventory_2_outlined footprint.
    return size * AppThemeTokens.serviceSvgOutlineScale;
  }
  return size;
}

Widget _inventorySvgIcon({
  required String assetPath,
  required double size,
  required Color color,
  Key? key,
}) {
  return SvgPicture.asset(
    assetPath,
    key: key,
    width: _inventorySvgIconWidth(assetPath: assetPath, size: size),
    height: size,
    fit: BoxFit.contain,
    colorFilter: ColorFilter.mode(color, BlendMode.srcIn),
  );
}

double? _tryDouble(String raw) => double.tryParse(raw.trim());

String _trimNumber(double value) {
  if (value == value.roundToDouble()) {
    return value.toStringAsFixed(0);
  }
  return value.toStringAsFixed(2);
}

String _formatNumber(num value, {int maxFractionDigits = 2}) {
  if (value == value.roundToDouble()) {
    return value.toStringAsFixed(0);
  }
  final fixed = value.toStringAsFixed(maxFractionDigits);
  return fixed.replaceFirst(RegExp(r'\.?0+$'), '');
}

String _compactNumber(num value) {
  final absoluteValue = value.abs().toDouble();
  const divisors = <double>[1e15, 1e12, 1e9, 1e6, 1e3];
  const suffixes = <String>['q', 't', 'b', 'm', 'k'];

  for (var i = 0; i < divisors.length; i++) {
    if (absoluteValue >= divisors[i]) {
      return '${_formatNumber(value / divisors[i], maxFractionDigits: 1)}${suffixes[i]}';
    }
  }

  return _formatNumber(value, maxFractionDigits: 2);
}

String _currencyLabel(double value, {String currencyCode = 'USD'}) {
  return '${_formatNumber(value, maxFractionDigits: 2)} $currencyCode';
}

FontWeight _fontWeight(double tokenWeight) {
  return switch (tokenWeight.round()) {
    100 => FontWeight.w100,
    200 => FontWeight.w200,
    300 => FontWeight.w300,
    400 => FontWeight.w400,
    500 => FontWeight.w500,
    600 => FontWeight.w600,
    700 => FontWeight.w700,
    800 => FontWeight.w800,
    900 => FontWeight.w900,
    _ => FontWeight.w400,
  };
}
