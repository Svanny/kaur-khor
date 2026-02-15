part of '../inventory_views.dart';

enum UnsavedExitAction { confirm, discard, goBack }

Widget buildSaveChangeHeader({
  required String title,
  required VoidCallback onBack,
  required VoidCallback onCancel,
  required VoidCallback onSave,
  required bool hasChanges,
  required bool isValid,
  double actionSize = 40,
  IconData backIcon = Icons.arrow_back,
  Key? actionsKey,
}) {
  return _DetailHeader(
    title: title,
    onBack: onBack,
    onCancel: onCancel,
    onSave: hasChanges && isValid ? onSave : null,
    showActions: hasChanges,
    actionSize: actionSize,
    backIcon: backIcon,
    actionsKey: actionsKey,
  );
}

Future<UnsavedExitAction?> showUnsavedChangesDialog({
  required BuildContext context,
  required bool isValid,
  required List<String> validationErrors,
}) {
  return showGeneralDialog<UnsavedExitAction>(
    context: context,
    barrierDismissible: false,
    barrierLabel: 'Dismiss unsaved changes',
    barrierColor: Colors.transparent,
    transitionDuration: Duration.zero,
    pageBuilder: (_, __, ___) => _UnsavedChangesPopup(
      isValid: isValid,
      validationErrors: validationErrors,
    ),
    transitionBuilder: (_, __, ___, child) => child,
  );
}

class _UnsavedChangesPopup extends StatelessWidget {
  const _UnsavedChangesPopup({
    required this.isValid,
    required this.validationErrors,
  });

  final bool isValid;
  final List<String> validationErrors;

  @override
  Widget build(BuildContext context) {
    final width = math
        .min(
          MediaQuery.sizeOf(context).width - (AppThemeTokens.popupInset * 2),
          360,
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
    final isInvalidVariant = !isValid;
    final title = isInvalidVariant ? 'Invalid fields' : 'Unsaved changes';
    final message = isInvalidVariant
        ? validationErrors.join('\n')
        : 'You have unsaved changes. Confirm to keep them or discard to exit.';

    return Material(
      color: Colors.transparent,
      child: Stack(
        children: [
          Positioned.fill(
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: () => Navigator.of(context).pop(),
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
                            onPressed: () => Navigator.of(
                              context,
                            ).pop(UnsavedExitAction.discard),
                            style: TextButton.styleFrom(
                              foregroundColor: AppThemeTokens.primary,
                              padding: const EdgeInsets.symmetric(
                                horizontal: AppThemeTokens.buttonPaddingX,
                                vertical: AppThemeTokens.buttonPaddingY,
                              ),
                            ),
                            child: Text(
                              'Discard',
                              style: actionStyle?.copyWith(
                                color: AppThemeTokens.primary,
                              ),
                            ),
                          ),
                          const SizedBox(width: AppThemeTokens.popupActionGap),
                          FilledButton(
                            onPressed: () => Navigator.of(context).pop(
                              isInvalidVariant
                                  ? UnsavedExitAction.goBack
                                  : UnsavedExitAction.confirm,
                            ),
                            style: FilledButton.styleFrom(
                              foregroundColor: AppThemeTokens.white,
                              shape: const StadiumBorder(),
                              padding: const EdgeInsets.symmetric(
                                horizontal: AppThemeTokens.buttonPaddingX,
                                vertical: AppThemeTokens.buttonPaddingY,
                              ),
                            ),
                            child: Text(
                              isInvalidVariant ? 'Go Back' : 'Confirm',
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
