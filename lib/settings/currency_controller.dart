import 'package:flutter/material.dart';

enum AppCurrency {
  usd,
  khr;

  String get code {
    return switch (this) {
      AppCurrency.usd => 'USD',
      AppCurrency.khr => 'KHR',
    };
  }
}

class CurrencyController extends ValueNotifier<AppCurrency> {
  CurrencyController() : super(AppCurrency.usd);

  void switchCurrency(AppCurrency currency) {
    if (value == currency) return;
    value = currency;
  }
}

class AppCurrencyScope extends InheritedNotifier<CurrencyController> {
  const AppCurrencyScope({
    super.key,
    required CurrencyController controller,
    required super.child,
  }) : super(notifier: controller);

  static final CurrencyController _fallbackController = CurrencyController();

  static CurrencyController controllerOf(BuildContext context) {
    final scope = context
        .dependOnInheritedWidgetOfExactType<AppCurrencyScope>();
    return scope?.notifier ?? _fallbackController;
  }
}

extension CurrencyControllerContext on BuildContext {
  CurrencyController get currencyController =>
      AppCurrencyScope.controllerOf(this);
}
