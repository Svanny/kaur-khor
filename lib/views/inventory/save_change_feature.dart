part of '../inventory_views.dart';

enum UnsavedExitAction { confirm, discard, goBack }

Widget buildSaveChangeHeader({
  required String title,
  required VoidCallback onBack,
  required VoidCallback onCancel,
  required VoidCallback onSave,
  required bool hasChanges,
  required bool isValid,
  IconData? titleIcon,
  double actionSize = 40,
  IconData backIcon = Icons.arrow_back,
  IconData cancelIcon = Icons.close,
  String cancelTooltip = 'Cancel',
  bool flipCancelIconHorizontally = false,
  Key? actionsKey,
}) {
  return _DetailHeader(
    title: title,
    titleIcon: titleIcon,
    onBack: onBack,
    onCancel: onCancel,
    onSave: hasChanges && isValid ? onSave : null,
    showActions: hasChanges,
    actionSize: actionSize,
    backIcon: backIcon,
    cancelIcon: cancelIcon,
    cancelTooltip: cancelTooltip,
    flipCancelIconHorizontally: flipCancelIconHorizontally,
    actionsKey: actionsKey,
  );
}

Future<UnsavedExitAction?> showUnsavedChangesDialog({
  required BuildContext context,
  required bool isValid,
  required List<String> validationErrors,
}) {
  final isInvalidVariant = !isValid;
  final title = isInvalidVariant ? 'Invalid fields' : 'Unsaved changes';
  final message = isInvalidVariant
      ? validationErrors.join('\n')
      : 'You have unsaved changes. Confirm to keep them or discard to exit.';

  return showTwoActionConfirmationDialog<UnsavedExitAction>(
    context: context,
    barrierLabel: 'Dismiss unsaved changes',
    title: title,
    message: message,
    secondaryLabel: 'Discard',
    primaryLabel: isInvalidVariant ? 'Go Back' : 'Confirm',
    secondaryResult: UnsavedExitAction.discard,
    primaryResult: isInvalidVariant
        ? UnsavedExitAction.goBack
        : UnsavedExitAction.confirm,
  );
}

Future<T?> showTwoActionConfirmationDialog<T>({
  required BuildContext context,
  required String barrierLabel,
  required String title,
  required String message,
  required String secondaryLabel,
  required String primaryLabel,
  required T secondaryResult,
  required T primaryResult,
  T? barrierDismissResult,
  double maxWidth = 360,
  EdgeInsets secondaryPadding = const EdgeInsets.symmetric(
    horizontal: AppThemeTokens.buttonPaddingX,
    vertical: AppThemeTokens.buttonPaddingY,
  ),
  EdgeInsets primaryPadding = const EdgeInsets.symmetric(
    horizontal: AppThemeTokens.buttonPaddingX,
    vertical: AppThemeTokens.buttonPaddingY,
  ),
  bool compactSecondary = false,
  bool compactPrimary = false,
}) {
  return showGeneralDialog<T>(
    context: context,
    barrierDismissible: false,
    barrierLabel: barrierLabel,
    barrierColor: Colors.transparent,
    transitionDuration: Duration.zero,
    pageBuilder: (_, __, ___) => _TwoActionConfirmationPopup<T>(
      title: title,
      message: message,
      secondaryLabel: secondaryLabel,
      primaryLabel: primaryLabel,
      secondaryResult: secondaryResult,
      primaryResult: primaryResult,
      barrierDismissResult: barrierDismissResult,
      maxWidth: maxWidth,
      secondaryPadding: secondaryPadding,
      primaryPadding: primaryPadding,
      compactSecondary: compactSecondary,
      compactPrimary: compactPrimary,
    ),
    transitionBuilder: (_, __, ___, child) => child,
  );
}

class _TwoActionConfirmationPopup<T> extends StatelessWidget {
  const _TwoActionConfirmationPopup({
    required this.title,
    required this.message,
    required this.secondaryLabel,
    required this.primaryLabel,
    required this.secondaryResult,
    required this.primaryResult,
    required this.barrierDismissResult,
    required this.maxWidth,
    required this.secondaryPadding,
    required this.primaryPadding,
    required this.compactSecondary,
    required this.compactPrimary,
  });

  final String title;
  final String message;
  final String secondaryLabel;
  final String primaryLabel;
  final T secondaryResult;
  final T primaryResult;
  final T? barrierDismissResult;
  final double maxWidth;
  final EdgeInsets secondaryPadding;
  final EdgeInsets primaryPadding;
  final bool compactSecondary;
  final bool compactPrimary;

  @override
  Widget build(BuildContext context) {
    final width = math
        .min(
          MediaQuery.sizeOf(context).width - (AppThemeTokens.popupInset * 2),
          maxWidth,
        )
        .toDouble();
    final titleStyle = Theme.of(context).textTheme.titleMedium?.copyWith(
      color: AppThemeTokens.textPrimary,
      fontWeight: _fontWeight(AppThemeTokens.fontWeightSemibold),
    );
    final bodyStyle = Theme.of(
      context,
    ).textTheme.bodyLarge?.copyWith(color: AppThemeTokens.textSecondary);
    final actionStyle = Theme.of(context).textTheme.bodyLarge?.copyWith(
      fontWeight: _fontWeight(AppThemeTokens.fontWeightSemibold),
    );

    return Material(
      color: Colors.transparent,
      child: Stack(
        children: [
          Positioned.fill(
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: () => Navigator.of(context).pop(barrierDismissResult),
              child: ColoredBox(
                color: Colors.black.withValues(alpha: 0.55),
                child: const SizedBox.expand(),
              ),
            ),
          ),
          Center(
            child: GestureDetector(
              onTap: () {},
              child: Container(
                width: width,
                decoration: BoxDecoration(
                  color: AppThemeTokens.surface,
                  borderRadius: BorderRadius.circular(32),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(AppThemeTokens.popupInset),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: titleStyle),
                      const SizedBox(height: AppThemeTokens.headerToContentGap),
                      Text(message, style: bodyStyle),
                      const SizedBox(height: AppThemeTokens.popupInset),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          TextButton(
                            onPressed: () =>
                                Navigator.of(context).pop(secondaryResult),
                            style: TextButton.styleFrom(
                              foregroundColor: AppThemeTokens.primary,
                              minimumSize: compactSecondary ? Size.zero : null,
                              tapTargetSize: compactSecondary
                                  ? MaterialTapTargetSize.shrinkWrap
                                  : null,
                              padding: secondaryPadding,
                            ),
                            child: Text(
                              secondaryLabel,
                              style: actionStyle?.copyWith(
                                color: AppThemeTokens.primary,
                              ),
                            ),
                          ),
                          const SizedBox(width: AppThemeTokens.popupActionGap),
                          FilledButton(
                            onPressed: () =>
                                Navigator.of(context).pop(primaryResult),
                            style: FilledButton.styleFrom(
                              foregroundColor: AppThemeTokens.white,
                              minimumSize: compactPrimary ? Size.zero : null,
                              tapTargetSize: compactPrimary
                                  ? MaterialTapTargetSize.shrinkWrap
                                  : null,
                              shape: const StadiumBorder(),
                              padding: primaryPadding,
                            ),
                            child: Text(
                              primaryLabel,
                              style: actionStyle?.copyWith(
                                color: AppThemeTokens.white,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
