part of '../inventory_views.dart';

int? _tryInt(String raw) => int.tryParse(raw.trim());

double? _tryDouble(String raw) => double.tryParse(raw.trim());

String _trimNumber(double value) {
  if (value == value.roundToDouble()) {
    return value.toStringAsFixed(0);
  }
  return value.toStringAsFixed(2);
}

String _currencyLabel(double value) {
  if (value >= 1000) {
    return '${(value / 1000).toStringAsFixed(1)}k USD';
  }
  return '${value.toStringAsFixed(0)} USD';
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
