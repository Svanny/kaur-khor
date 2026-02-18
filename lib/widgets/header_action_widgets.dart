part of '../views/inventory_views.dart';

class _DetailHeader extends StatelessWidget {
  const _DetailHeader({
    required this.title,
    required this.onBack,
    required this.onCancel,
    required this.onSave,
    this.titleIcon,
    this.showActions = true,
    this.actionsKey,
    this.actionSize = 40,
    this.backIcon = Icons.arrow_back,
    this.cancelIcon = Icons.close,
    this.cancelTooltip = 'Cancel',
    this.flipCancelIconHorizontally = false,
  });

  final String title;
  final IconData? titleIcon;
  final VoidCallback onBack;
  final VoidCallback onCancel;
  final VoidCallback? onSave;
  final bool showActions;
  final Key? actionsKey;
  final double actionSize;
  final IconData backIcon;
  final IconData cancelIcon;
  final String cancelTooltip;
  final bool flipCancelIconHorizontally;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        IconButton(
          onPressed: onBack,
          padding: EdgeInsets.zero,
          icon: Icon(backIcon),
        ),
        const SizedBox(width: AppThemeTokens.sectionCardInlineGap),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.only(
              right: AppThemeTokens.sectionCardInlineGap,
            ),
            child: Row(
              key: const ValueKey('detail-header-title-row'),
              children: [
                if (titleIcon != null) ...[
                  SizedBox(
                    key: const ValueKey('detail-header-category-icon'),
                    child: _ItemPictureGlyph(
                      titleIcon!,
                      fill: false,
                      color: AppThemeTokens.textPrimary,
                    ),
                  ),
                  const SizedBox(width: AppThemeTokens.sectionCardInlineGap),
                ],
                Expanded(
                  child: Text(
                    title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      fontSize: AppThemeTokens.fontSizeTitleMedium,
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
        if (showActions)
          Row(
            key: actionsKey,
            mainAxisSize: MainAxisSize.min,
            children: [
              _CircleOutlineAction(
                icon: cancelIcon,
                onPressed: onCancel,
                tooltip: cancelTooltip,
                size: actionSize,
                flipIconHorizontally: flipCancelIconHorizontally,
              ),
              const SizedBox(width: AppThemeTokens.sectionCardInlineGap),
              _CircleFilledAction(
                icon: Icons.check,
                onPressed: onSave,
                tooltip: onSave == null ? 'Fix required fields' : 'Save',
                size: actionSize,
              ),
            ],
          ),
      ],
    );
  }
}

class _CircleFilledAction extends StatelessWidget {
  const _CircleFilledAction({
    required this.icon,
    required this.onPressed,
    required this.tooltip,
    this.size = 40,
  });

  final IconData icon;
  final VoidCallback? onPressed;
  final String tooltip;
  final double size;

  @override
  Widget build(BuildContext context) {
    final sideColor = onPressed == null
        ? AppThemeTokens.error
        : AppThemeTokens.primary;
    return SizedBox(
      width: size,
      height: size,
      child: Tooltip(
        message: tooltip,
        child: FilledButton(
          onPressed: onPressed,
          style: FilledButton.styleFrom(
            shape: const CircleBorder(),
            padding: EdgeInsets.zero,
            side: BorderSide(color: sideColor, width: 2),
          ),
          child: Icon(icon, size: size * 0.45),
        ),
      ),
    );
  }
}

class _CircleOutlineAction extends StatelessWidget {
  const _CircleOutlineAction({
    required this.icon,
    required this.onPressed,
    required this.tooltip,
    this.size = 40,
    this.flipIconHorizontally = false,
  });

  final IconData icon;
  final VoidCallback onPressed;
  final String tooltip;
  final double size;
  final bool flipIconHorizontally;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: size,
      height: size,
      child: Tooltip(
        message: tooltip,
        child: OutlinedButton(
          onPressed: onPressed,
          style: OutlinedButton.styleFrom(
            shape: const CircleBorder(),
            padding: EdgeInsets.zero,
            side: const BorderSide(color: AppThemeTokens.border, width: 2),
          ),
          child: Transform(
            alignment: Alignment.center,
            transform: Matrix4.diagonal3Values(
              flipIconHorizontally ? -1 : 1,
              1,
              1,
            ),
            child: Icon(icon, size: size * 0.45),
          ),
        ),
      ),
    );
  }
}
