part of '../views/inventory_views.dart';

class _InventoryItemCard extends StatelessWidget {
  const _InventoryItemCard({
    required this.title,
    required this.itemPictureIcon,
    required this.unitsInStock,
    required this.totalValueLabel,
    required this.onTap,
  });

  final String title;
  final IconData itemPictureIcon;
  final double unitsInStock;
  final String totalValueLabel;
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
                      Text(title, style: Theme.of(context).textTheme.bodyLarge),
                      const SizedBox(height: AppThemeTokens.cardInlineGap),
                      Wrap(
                        spacing: AppThemeTokens.wrapSpacing,
                        runSpacing: AppThemeTokens.wrapRunSpacing,
                        children: [
                          Chip(
                            backgroundColor: AppThemeTokens.chipBackground,
                            side: BorderSide.none,
                            materialTapTargetSize:
                                MaterialTapTargetSize.shrinkWrap,
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
                            label: Text(
                              'Units in Stock: ${_formatNumber(unitsInStock)}',
                              style: Theme.of(context).textTheme.bodyMedium
                                  ?.copyWith(color: AppThemeTokens.textPrimary),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: AppThemeTokens.cardInlineGap),
                      Text(
                        'Total Value',
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                      Text(
                        totalValueLabel,
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
}
