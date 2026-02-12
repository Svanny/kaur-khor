import 'package:flutter/material.dart';

import 'l10n/generated/app_localizations.dart';
import 'localization/locale_controller.dart';
import 'theme/app_theme.dart';
import 'views/home_view.dart';

void main() {
  runApp(const BanjiApp());
}

class BanjiApp extends StatefulWidget {
  const BanjiApp({super.key});

  @override
  State<BanjiApp> createState() => _BanjiAppState();
}

class _BanjiAppState extends State<BanjiApp> {
  late final LocaleController _localeController;

  @override
  void initState() {
    super.initState();
    _localeController = LocaleController();
  }

  @override
  void dispose() {
    _localeController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AppLocaleScope(
      controller: _localeController,
      child: ValueListenableBuilder<Locale>(
        valueListenable: _localeController,
        builder: (_, locale, __) {
          return MaterialApp(
            debugShowCheckedModeBanner: false,
            onGenerateTitle: (context) => AppLocalizations.of(context).appTitle,
            theme: AppTheme.light(),
            locale: locale,
            supportedLocales: AppLocalizations.supportedLocales,
            localizationsDelegates: AppLocalizations.localizationsDelegates,
            home: const HomeView(),
          );
        },
      ),
    );
  }
}
