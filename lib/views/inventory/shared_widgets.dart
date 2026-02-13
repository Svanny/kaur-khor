part of '../inventory_views.dart';

class _DetailHeader extends StatelessWidget {
  const _DetailHeader({
    required this.title,
    required this.onBack,
    required this.onCancel,
    required this.onSave,
    this.showActions = true,
    this.actionsKey,
  });

  final String title;
  final VoidCallback onBack;
  final VoidCallback onCancel;
  final VoidCallback? onSave;
  final bool showActions;
  final Key? actionsKey;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        IconButton(onPressed: onBack, icon: const Icon(Icons.arrow_back)),
        const SizedBox(width: AppThemeTokens.space2),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.only(right: AppThemeTokens.space2),
            child: Text(
              title,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                fontSize: AppThemeTokens.fontSizeTitleMedium,
              ),
            ),
          ),
        ),
        if (showActions)
          Row(
            key: actionsKey,
            mainAxisSize: MainAxisSize.min,
            children: [
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
    final sideColor = onPressed == null
        ? AppThemeTokens.error
        : AppThemeTokens.primary;
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
            side: BorderSide(color: sideColor, width: 2),
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
            side: const BorderSide(color: AppThemeTokens.border, width: 2),
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

class _MediaPlaceholderCard extends StatefulWidget {
  const _MediaPlaceholderCard({required this.itemPictureIcon});

  final IconData itemPictureIcon;

  @override
  State<_MediaPlaceholderCard> createState() => _MediaPlaceholderCardState();
}

class _MediaPlaceholderCardState extends State<_MediaPlaceholderCard> {
  static const int _pageCount = 2;
  static const Duration _autoScrollEvery = Duration(seconds: 10);
  static const Duration _pageAnimationDuration = Duration(milliseconds: 350);
  static const String _editSquareAsset =
      'icons/edit_square_24dp_E3E3E3_FILL0_wght400_GRAD0_opsz24.svg';

  late final PageController _pageController;
  Timer? _autoScrollTimer;
  int _activePage = 0;

  @override
  void initState() {
    super.initState();
    _pageController = PageController();
    _restartAutoScrollTimer();
  }

  @override
  void dispose() {
    _autoScrollTimer?.cancel();
    _pageController.dispose();
    super.dispose();
  }

  void _advancePage() {
    if (!mounted || !_pageController.hasClients) {
      return;
    }
    final nextPage = (_activePage + 1) % _pageCount;
    _pageController.animateToPage(
      nextPage,
      duration: _pageAnimationDuration,
      curve: Curves.easeInOutCubic,
    );
  }

  void _restartAutoScrollTimer() {
    _autoScrollTimer?.cancel();
    _autoScrollTimer = Timer(_autoScrollEvery, _advancePage);
  }

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: EdgeInsets.zero,
      child: SizedBox(
        height: 260,
        child: Stack(
          children: [
            Positioned.fill(
              child: PageView(
                controller: _pageController,
                onPageChanged: (index) {
                  setState(() => _activePage = index);
                  _restartAutoScrollTimer();
                },
                children: [
                  Stack(
                    children: [
                      Center(
                        child: Text(
                          'Chart graphing updates +\nest. (banded) values\n\nand picture for the other',
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.bodyLarge
                              ?.copyWith(color: AppThemeTokens.textSecondary),
                        ),
                      ),
                      Positioned(
                        top: AppThemeTokens.space2,
                        right: AppThemeTokens.space2,
                        child: IconButton(
                          onPressed: () {},
                          tooltip: 'Filter chart',
                          icon: const Icon(Icons.filter_alt_outlined),
                        ),
                      ),
                    ],
                  ),
                  Stack(
                    children: [
                      Center(
                        child: Container(
                          width: AppThemeTokens.unit * 36,
                          height: AppThemeTokens.unit * 36,
                          decoration: BoxDecoration(
                            color: AppThemeTokens.accentDarker,
                            borderRadius: BorderRadius.circular(
                              AppThemeTokens.radiusMd,
                            ),
                          ),
                          child: Padding(
                            padding: const EdgeInsets.all(
                              AppThemeTokens.space2,
                            ),
                            child: _ItemPictureGlyph(
                              widget.itemPictureIcon,
                              fill: true,
                              color: AppThemeTokens.white,
                            ),
                          ),
                        ),
                      ),
                      Positioned(
                        top: AppThemeTokens.space2,
                        right: AppThemeTokens.space2,
                        child: IconButton(
                          onPressed: () {},
                          tooltip: 'Edit picture',
                          icon: SvgPicture.asset(
                            _editSquareAsset,
                            width: 24,
                            height: 24,
                            colorFilter: const ColorFilter.mode(
                              AppThemeTokens.textPrimary,
                              BlendMode.srcIn,
                            ),
                          ),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
            Positioned(
              left: 0,
              right: 0,
              bottom: AppThemeTokens.space3,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(_pageCount * 2 - 1, (index) {
                  if (index.isOdd) {
                    return const SizedBox(width: AppThemeTokens.space2);
                  }
                  final dotIndex = index ~/ 2;
                  return _CarouselDot(
                    key: ValueKey('media-carousel-dot-$dotIndex'),
                    active: _activePage == dotIndex,
                    onTap: () {
                      _restartAutoScrollTimer();
                      if (!_pageController.hasClients) {
                        return;
                      }
                      if (_activePage == dotIndex) {
                        return;
                      }
                      _pageController.animateToPage(
                        dotIndex,
                        duration: _pageAnimationDuration,
                        curve: Curves.easeInOutCubic,
                      );
                    },
                  );
                }),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CarouselDot extends StatelessWidget {
  const _CarouselDot({super.key, required this.active, required this.onTap});

  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        width: 10,
        height: 10,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: active ? AppThemeTokens.primary : AppThemeTokens.border,
        ),
      ),
    );
  }
}

class _ItemPictureField extends StatelessWidget {
  const _ItemPictureField({
    required this.onUseDefault,
    required this.defaultLabel,
  });

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
                Expanded(
                  child: Text(
                    'Preview shown in carousel. Required field. $defaultLabel.',
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
    this.maxLength,
    this.hintText,
  });

  final String label;
  final TextEditingController controller;
  final int maxLines;
  final bool enabled;
  final TextInputType? keyboardType;
  final ValueChanged<String>? onChanged;
  final int? maxLength;
  final String? hintText;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: AppThemeTokens.space1),
        if (maxLength == null)
          TextField(
            controller: controller,
            maxLines: maxLines,
            enabled: enabled,
            keyboardType: keyboardType,
            onChanged: onChanged,
            decoration: InputDecoration(hintText: hintText ?? label),
          )
        else
          Stack(
            children: [
              TextField(
                controller: controller,
                maxLines: maxLines,
                enabled: enabled,
                keyboardType: keyboardType,
                onChanged: onChanged,
                maxLength: maxLength,
                textAlignVertical: maxLines > 1
                    ? TextAlignVertical.top
                    : TextAlignVertical.center,
                decoration: InputDecoration(
                  hintText: hintText ?? label,
                  counterText: '',
                  suffix: maxLines == 1
                      ? const SizedBox(
                          width: AppThemeTokens.space8 + AppThemeTokens.space2,
                        )
                      : null,
                  contentPadding: maxLines > 1
                      ? const EdgeInsets.fromLTRB(
                          AppThemeTokens.inputPaddingX,
                          AppThemeTokens.inputPaddingY,
                          AppThemeTokens.inputPaddingX,
                          AppThemeTokens.inputPaddingY + AppThemeTokens.space6,
                        )
                      : null,
                ),
              ),
              Positioned(
                right: AppThemeTokens.inputPaddingX,
                bottom: AppThemeTokens.space2,
                child: IgnorePointer(
                  child: ValueListenableBuilder<TextEditingValue>(
                    valueListenable: controller,
                    builder: (context, value, _) {
                      return Text(
                        '${value.text.length}/$maxLength',
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: AppThemeTokens.textSecondary,
                        ),
                      );
                    },
                  ),
                ),
              ),
            ],
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
