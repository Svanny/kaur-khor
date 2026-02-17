import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../l10n/generated/app_localizations.dart';
import '../localization/locale_controller.dart';
import '../settings/currency_controller.dart';
import '../theme/app_theme.dart';
import '../widgets/app_dropdown_pill.dart';

class SettingsView extends StatefulWidget {
  const SettingsView({super.key});

  @override
  State<SettingsView> createState() => _SettingsViewState();
}

class _SettingsViewState extends State<SettingsView> {
  static const List<AppCurrency> _currencyOptions = AppCurrency.values;

  @override
  Widget build(BuildContext context) {
    final l10n = AppLocalizations.of(context);
    final localeController = context.localeController;
    final currencyController = context.currencyController;
    final selectedLanguage = AppLanguage.fromLocale(localeController.value);
    final edgePadding = AppThemeTokens.screenEdgePadding(context);
    final contentPadding = EdgeInsets.fromLTRB(
      edgePadding.left,
      AppThemeTokens.sectionGap,
      edgePadding.right,
      edgePadding.bottom,
    );

    return Scaffold(
      backgroundColor: AppThemeTokens.background,
      appBar: AppBar(
        backgroundColor: AppThemeTokens.background,
        foregroundColor: AppThemeTokens.textPrimary,
        iconTheme: const IconThemeData(color: AppThemeTokens.textPrimary),
        titleSpacing: AppThemeTokens.headerToContentGap,
        title: Text(l10n.settingsTitle),
      ),
      body: Padding(
        padding: contentPadding,
        child: Column(
          children: [
            _SettingsRow(
              label: l10n.settingsLanguage,
              trailing: AppDropdownPill<AppLanguage>(
                key: const ValueKey('settings-language-dropdown'),
                triggerKey: const ValueKey('settings-language-trigger'),
                menuKey: const ValueKey('settings-language-menu'),
                value: selectedLanguage,
                options: AppLanguage.values,
                labelBuilder: (language) => _languageLabel(l10n, language),
                onChanged: localeController.switchLanguage,
                menuXAlignment: AppDropdownXAlignment.right,
                menuYAlignment: AppDropdownYAlignment.bottom,
              ),
            ),
            const SizedBox(height: AppThemeTokens.sectionGap),
            _SettingsRow(
              label: l10n.settingsCurrency,
              trailing: ValueListenableBuilder<AppCurrency>(
                valueListenable: currencyController,
                builder: (_, selectedCurrency, __) {
                  return AppDropdownPill<AppCurrency>(
                    key: const ValueKey('settings-currency-dropdown'),
                    triggerKey: const ValueKey('settings-currency-trigger'),
                    menuKey: const ValueKey('settings-currency-menu'),
                    value: selectedCurrency,
                    options: _currencyOptions,
                    labelBuilder: (currency) => _currencyLabel(l10n, currency),
                    onChanged: currencyController.switchCurrency,
                    menuXAlignment: AppDropdownXAlignment.right,
                    menuYAlignment: AppDropdownYAlignment.bottom,
                  );
                },
              ),
            ),
            const SizedBox(height: AppThemeTokens.sectionGap),
            _SettingsRow(
              label: l10n.settingsManualBackup,
              trailing: _CircleIconButton(
                icon: SvgPicture.asset(
                  'icons/backup_24dp_E3E3E3_FILL0_wght400_GRAD0_opsz24.svg',
                  width: AppThemeTokens.iconSizeMedium,
                  height: AppThemeTokens.iconSizeMedium,
                  colorFilter: const ColorFilter.mode(
                    AppThemeTokens.white,
                    BlendMode.srcIn,
                  ),
                ),
                onPressed: () {},
              ),
            ),
            const Spacer(),
            Row(
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                const Icon(
                  Icons.info_outline,
                  size: AppThemeTokens.fontSizeBodyLarge,
                  color: AppThemeTokens.textPrimary,
                ),
                const SizedBox(width: AppThemeTokens.sectionGapCompact),
                Expanded(
                  child: Text(
                    l10n.settingsDisclaimer,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                      color: AppThemeTokens.textPrimary,
                      fontWeight: FontWeight.w600,
                      height: 1,
                    ),
                  ),
                ),
                const SizedBox(width: AppThemeTokens.sectionGapCompact),
                FilledButton(
                  onPressed: () {},
                  style: FilledButton.styleFrom(
                    backgroundColor: AppThemeTokens.primary,
                    foregroundColor: AppThemeTokens.white,
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppThemeTokens.buttonPaddingX,
                      vertical: AppThemeTokens.buttonPaddingY,
                    ),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(
                        AppThemeTokens.radiusPill,
                      ),
                    ),
                  ),
                  child: Text(
                    l10n.settingsLogout,
                    style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                      color: AppThemeTokens.white,
                      fontSize: AppThemeTokens.fontSizeBodyLarge,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

String _languageLabel(AppLocalizations l10n, AppLanguage language) {
  return switch (language) {
    AppLanguage.english => l10n.languageEnglish,
    AppLanguage.khmer => l10n.languageKhmer,
  };
}

String _currencyLabel(AppLocalizations l10n, AppCurrency currency) {
  return switch (currency) {
    AppCurrency.usd => l10n.currencyOptionUsd,
    AppCurrency.khr => l10n.currencyOptionKhr,
  };
}

class _SettingsRow extends StatelessWidget {
  const _SettingsRow({required this.label, required this.trailing});

  final String label;
  final Widget trailing;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: Theme.of(context).textTheme.bodyLarge?.copyWith(
              color: AppThemeTokens.textPrimary,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
        trailing,
      ],
    );
  }
}

class _CircleIconButton extends StatelessWidget {
  const _CircleIconButton({required this.icon, required this.onPressed});

  final Widget icon;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return IconButton.filled(
      onPressed: onPressed,
      style: IconButton.styleFrom(
        backgroundColor: AppThemeTokens.primary,
        foregroundColor: AppThemeTokens.white,
        padding: const EdgeInsets.symmetric(
          horizontal: AppThemeTokens.buttonPaddingX,
          vertical: AppThemeTokens.buttonPaddingY,
        ),
        minimumSize: Size.zero,
        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        shape: const CircleBorder(),
      ),
      icon: icon,
    );
  }
}
