part of '../views/inventory_views.dart';

class _ItemPictureGlyph extends StatelessWidget {
  const _ItemPictureGlyph(this.icon, {required this.fill, required this.color});

  final IconData icon;
  final bool fill;
  final Color color;

  @override
  Widget build(BuildContext context) {
    if (!fill) {
      return _baseGlyph(AppThemeTokens.iconSizeMedium);
    }

    // Keep fill-mode intrinsic-safe inside IntrinsicHeight-based parents.
    return Align(
      alignment: Alignment.center,
      child: FittedBox(
        fit: BoxFit.contain,
        child: _baseGlyph(AppThemeTokens.unit * 16),
      ),
    );
  }

  Widget _baseGlyph(double size) {
    if (icon == _defaultServicePictureIcon) {
      return _inventorySvgIcon(
        assetPath: _defaultServicePictureAsset,
        size: size,
        color: color,
      );
    }

    return Icon(icon, size: size, color: color);
  }
}
