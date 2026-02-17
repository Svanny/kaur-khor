part of '../views/inventory_views.dart';

class _InventoryItemCard extends StatelessWidget {
  const _InventoryItemCard({
    required this.title,
    required this.itemPictureIcon,
    required this.unitsPillLabel,
    required this.valuePillAmount,
    required this.valuePillCurrencyCode,
    required this.summaryLabel,
    required this.summaryValueLabel,
    required this.valueIconAssetPath,
    required this.valueIconKey,
    required this.onTap,
  });

  final String title;
  final IconData itemPictureIcon;
  final String unitsPillLabel;
  final double valuePillAmount;
  final String valuePillCurrencyCode;
  final String summaryLabel;
  final String summaryValueLabel;
  final String valueIconAssetPath;
  final Key valueIconKey;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(AppThemeTokens.radiusMd),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(AppThemeTokens.cardInset),
          child: IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                AspectRatio(
                  aspectRatio: 1,
                  child: Container(
                    decoration: BoxDecoration(
                      color: AppThemeTokens.accentDarker,
                      borderRadius: BorderRadius.circular(
                        AppThemeTokens.radiusMd,
                      ),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(
                        AppThemeTokens.cardInnerInset,
                      ),
                      child: Center(
                        child: _ItemPictureGlyph(
                          itemPictureIcon,
                          fill: true,
                          color: AppThemeTokens.white,
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: AppThemeTokens.cardContentGap),
                Flexible(
                  fit: FlexFit.loose,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodyLarge,
                      ),
                      const SizedBox(height: AppThemeTokens.cardInlineGap),
                      Wrap(
                        spacing: AppThemeTokens.wrapSpacing,
                        runSpacing: AppThemeTokens.wrapRunSpacing,
                        children: [
                          _infoPill(
                            context: context,
                            key: const ValueKey('inventory-item-units-pill'),
                            icon: _inventorySvgIcon(
                              key: const ValueKey('inventory-item-units-icon'),
                              assetPath: _package2SvgAsset,
                              size: AppThemeTokens.fontSizeBodyLarge,
                              color: AppThemeTokens.textPrimary,
                            ),
                            label: unitsPillLabel,
                          ),
                          _infoPill(
                            context: context,
                            key: const ValueKey('inventory-item-value-pill'),
                            icon: _inventorySvgIcon(
                              key: valueIconKey,
                              assetPath: valueIconAssetPath,
                              size: AppThemeTokens.fontSizeBodyLarge,
                              color: AppThemeTokens.textPrimary,
                            ),
                            label:
                                '${_formatNumber(valuePillAmount, maxFractionDigits: 2)} $valuePillCurrencyCode',
                          ),
                        ],
                      ),
                      const SizedBox(height: AppThemeTokens.cardInlineGap),
                      Text(
                        summaryLabel,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                      Text(
                        summaryValueLabel,
                        style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                          fontWeight: _fontWeight(
                            AppThemeTokens.fontWeightBold,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _infoPill({
    required BuildContext context,
    required Key key,
    required Widget icon,
    required String label,
  }) {
    return Chip(
      key: key,
      backgroundColor: AppThemeTokens.chipBackground,
      side: BorderSide.none,
      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
      visualDensity: VisualDensity.compact,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.all(
          Radius.circular(AppThemeTokens.radiusPill),
        ),
        side: BorderSide.none,
      ),
      padding: const EdgeInsets.symmetric(
        horizontal: AppThemeTokens.inventoryChipPadX,
        vertical: AppThemeTokens.inventoryChipPadY,
      ),
      label: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          icon,
          const SizedBox(width: AppThemeTokens.space1),
          Text(
            label,
            style: Theme.of(
              context,
            ).textTheme.bodyMedium?.copyWith(color: AppThemeTokens.textPrimary),
          ),
        ],
      ),
    );
  }
}
