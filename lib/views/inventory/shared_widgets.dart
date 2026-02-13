part of '../inventory_views.dart';

class _DetailHeader extends StatelessWidget {
  const _DetailHeader({
    required this.title,
    required this.onBack,
    required this.onCancel,
    required this.onSave,
  });

  final String title;
  final VoidCallback onBack;
  final VoidCallback onCancel;
  final VoidCallback? onSave;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        IconButton(onPressed: onBack, icon: const Icon(Icons.arrow_back)),
        const SizedBox(width: AppThemeTokens.space2),
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
        _CircleOutlineAction(
          icon: Icons.close,
          onPressed: onCancel,
          tooltip: 'Cancel',
        ),
        const SizedBox(width: AppThemeTokens.space2),
        _CircleFilledAction(
          icon: Icons.check,
          onPressed: onSave,
          tooltip: onSave == null ? 'Fix required fields' : 'Save',
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
  });

  final IconData icon;
  final VoidCallback? onPressed;
  final String tooltip;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 40,
      height: 40,
      child: Tooltip(
        message: tooltip,
        child: FilledButton(
          onPressed: onPressed,
          style: FilledButton.styleFrom(
            shape: const CircleBorder(),
            padding: EdgeInsets.zero,
          ),
          child: Icon(icon, size: 18),
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
  });

  final IconData icon;
  final VoidCallback onPressed;
  final String tooltip;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 40,
      height: 40,
      child: Tooltip(
        message: tooltip,
        child: OutlinedButton(
          onPressed: onPressed,
          style: OutlinedButton.styleFrom(
            shape: const CircleBorder(),
            padding: EdgeInsets.zero,
          ),
          child: Icon(icon, size: 18),
        ),
      ),
    );
  }
}

class _PageHeader extends StatelessWidget {
  const _PageHeader({required this.title, required this.onBack});

  final String title;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        IconButton(onPressed: onBack, icon: const Icon(Icons.arrow_back)),
        const SizedBox(width: AppThemeTokens.space2),
        Expanded(
          child: Text(
            title,
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
              fontSize: AppThemeTokens.fontSizeTitleMedium,
            ),
          ),
        ),
      ],
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        const Expanded(child: Divider()),
        Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppThemeTokens.space2,
          ),
          child: Text(
            title,
            style: Theme.of(context).textTheme.bodyLarge?.copyWith(
              fontWeight: _fontWeight(AppThemeTokens.fontWeightSemibold),
            ),
          ),
        ),
        const Expanded(child: Divider()),
      ],
    );
  }
}

class _SearchField extends StatelessWidget {
  const _SearchField({
    required this.controller,
    required this.hintText,
    required this.onChanged,
  });

  final TextEditingController controller;
  final String hintText;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      onChanged: onChanged,
      decoration: InputDecoration(
        hintText: hintText,
        hintStyle: Theme.of(
          context,
        ).textTheme.bodyLarge?.copyWith(color: AppThemeTokens.textSecondary),
        prefixIcon: const Icon(Icons.search),
        prefixIconColor: AppThemeTokens.textSecondary,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: AppThemeTokens.inputPaddingX,
          vertical: AppThemeTokens.inputPaddingY,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppThemeTokens.radiusPill),
          borderSide: const BorderSide(color: AppThemeTokens.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppThemeTokens.radiusPill),
          borderSide: const BorderSide(color: AppThemeTokens.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppThemeTokens.radiusPill),
          borderSide: const BorderSide(color: AppThemeTokens.primary),
        ),
      ),
    );
  }
}

class _InventoryItemCard extends StatelessWidget {
  const _InventoryItemCard({
    required this.title,
    required this.itemPictureIcon,
    required this.pieces,
    required this.bulk,
    required this.totalValueLabel,
    required this.onTap,
  });

  final String title;
  final IconData itemPictureIcon;
  final int pieces;
  final int bulk;
  final String totalValueLabel;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(AppThemeTokens.radiusMd),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(AppThemeTokens.space4),
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
                      padding: const EdgeInsets.all(AppThemeTokens.space2),
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
                const SizedBox(width: AppThemeTokens.space3),
                Flexible(
                  fit: FlexFit.loose,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: Theme.of(context).textTheme.bodyLarge),
                      const SizedBox(height: AppThemeTokens.space2),
                      Wrap(
                        spacing: AppThemeTokens.space2,
                        runSpacing: AppThemeTokens.space2,
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
                              horizontal:
                                  AppThemeTokens.chipPaddingX -
                                  AppThemeTokens.space1,
                              vertical:
                                  AppThemeTokens.chipPaddingY -
                                  AppThemeTokens.space1,
                            ),
                            label: Text(
                              'Pieces: $pieces',
                              style: Theme.of(context).textTheme.bodyMedium
                                  ?.copyWith(color: AppThemeTokens.textPrimary),
                            ),
                          ),
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
                              horizontal:
                                  AppThemeTokens.chipPaddingX -
                                  AppThemeTokens.space1,
                              vertical:
                                  AppThemeTokens.chipPaddingY -
                                  AppThemeTokens.space1,
                            ),
                            label: Text(
                              'Bulk: $bulk',
                              style: Theme.of(context).textTheme.bodyMedium
                                  ?.copyWith(color: AppThemeTokens.textPrimary),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: AppThemeTokens.space2),
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

class _MediaPlaceholderCard extends StatelessWidget {
  const _MediaPlaceholderCard();

  @override
  Widget build(BuildContext context) {
    return Card(
      child: SizedBox(
        height: 260,
        child: Stack(
          children: [
            const Positioned(
              top: AppThemeTokens.space3,
              right: AppThemeTokens.space3,
              child: Icon(Icons.filter_alt_outlined),
            ),
            Center(
              child: Text(
                'Chart graphing updates +\nest. (banded) values\n\nand picture for the other',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                  color: AppThemeTokens.textSecondary,
                ),
              ),
            ),
            const Positioned(
              left: 0,
              right: 0,
              bottom: AppThemeTokens.space3,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  _CarouselDot(active: false),
                  SizedBox(width: AppThemeTokens.space2),
                  _CarouselDot(active: true),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CarouselDot extends StatelessWidget {
  const _CarouselDot({required this.active});

  final bool active;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 10,
      height: 10,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: active ? AppThemeTokens.primary : AppThemeTokens.border,
      ),
    );
  }
}

class _ItemPictureField extends StatelessWidget {
  const _ItemPictureField({
    required this.icon,
    required this.onUseDefault,
    required this.defaultLabel,
  });

  final IconData icon;
  final VoidCallback onUseDefault;
  final String defaultLabel;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Item Picture *', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: AppThemeTokens.space1),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(AppThemeTokens.space3),
            child: Row(
              children: [
                Container(
                  width: AppThemeTokens.unit * 14,
                  height: AppThemeTokens.unit * 14,
                  decoration: BoxDecoration(
                    color: AppThemeTokens.accentDarker,
                    borderRadius: BorderRadius.circular(
                      AppThemeTokens.radiusMd,
                    ),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(AppThemeTokens.space1),
                    child: _ItemPictureGlyph(
                      icon,
                      fill: true,
                      color: AppThemeTokens.white,
                    ),
                  ),
                ),
                const SizedBox(width: AppThemeTokens.space3),
                Expanded(
                  child: Text(
                    'Required field. $defaultLabel.',
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                ),
                OutlinedButton(
                  onPressed: onUseDefault,
                  child: const Text('Default'),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

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
      return SvgPicture.asset(
        _defaultServicePictureAsset,
        width: size,
        height: size,
        colorFilter: ColorFilter.mode(color, BlendMode.srcIn),
      );
    }

    return Icon(icon, size: size, color: color);
  }
}

class _FieldEditor extends StatelessWidget {
  const _FieldEditor({
    required this.label,
    required this.controller,
    this.maxLines = 1,
    this.enabled = true,
    this.keyboardType,
    this.onChanged,
  });

  final String label;
  final TextEditingController controller;
  final int maxLines;
  final bool enabled;
  final TextInputType? keyboardType;
  final ValueChanged<String>? onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: AppThemeTokens.space1),
        TextField(
          controller: controller,
          maxLines: maxLines,
          enabled: enabled,
          keyboardType: keyboardType,
          onChanged: onChanged,
          decoration: InputDecoration(hintText: label),
        ),
      ],
    );
  }
}

class _ReadOnlyField extends StatelessWidget {
  const _ReadOnlyField({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: AppThemeTokens.space1),
        InputDecorator(
          decoration: const InputDecoration(enabled: false),
          child: Text(
            value,
            style: Theme.of(context).textTheme.bodyLarge?.copyWith(
              fontWeight: _fontWeight(AppThemeTokens.fontWeightSemibold),
            ),
          ),
        ),
      ],
    );
  }
}
