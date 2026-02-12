import 'package:flutter/material.dart';

enum AppLanguage {
  english('en'),
  khmer('km');

  const AppLanguage(this.languageCode);

  final String languageCode;

  Locale get locale => Locale(languageCode);

  static AppLanguage fromLocale(Locale locale) {
    return AppLanguage.values.firstWhere(
      (language) => language.languageCode == locale.languageCode,
      orElse: () => AppLanguage.english,
    );
  }
}

class LocaleController extends ValueNotifier<Locale> {
  LocaleController() : super(AppLanguage.english.locale);

  void switchLanguage(AppLanguage language) {
    final nextLocale = language.locale;
    if (value == nextLocale) return;
    value = nextLocale;
  }
}

class AppLocaleScope extends InheritedNotifier<LocaleController> {
  const AppLocaleScope({
    super.key,
    required LocaleController controller,
    required super.child,
  }) : super(notifier: controller);

  static LocaleController controllerOf(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<AppLocaleScope>();
    assert(scope != null, 'AppLocaleScope not found in widget tree.');
    return scope!.notifier!;
  }
}

extension LocaleControllerContext on BuildContext {
  LocaleController get localeController => AppLocaleScope.controllerOf(this);
}
