part of '../views/inventory_views.dart';

enum _InputMode { text, integer, decimal }

TextInputType _keyboardTypeForInputMode(_InputMode mode) {
  return switch (mode) {
    _InputMode.text => TextInputType.text,
    _InputMode.integer => const TextInputType.numberWithOptions(
      signed: false,
      decimal: false,
    ),
    _InputMode.decimal => const TextInputType.numberWithOptions(
      signed: false,
      decimal: true,
    ),
  };
}

void _dismissSoftInputIfNoEditableFocus() {
  WidgetsBinding.instance.addPostFrameCallback((_) {
    final focusedWidget = FocusManager.instance.primaryFocus?.context?.widget;
    if (focusedWidget is! EditableText) {
      SystemChannels.textInput.invokeMethod<void>('TextInput.hide');
    }
  });
}

void _handleTapOutside({
  required TextEditingController controller,
  ValueChanged<String>? onChanged,
  VoidCallback? onTapOutside,
}) {
  FocusManager.instance.primaryFocus?.unfocus();
  _dismissSoftInputIfNoEditableFocus();
  onChanged?.call(controller.text);
  onTapOutside?.call();
}

class _SearchField extends StatelessWidget {
  const _SearchField({
    required this.controller,
    required this.hintText,
    required this.onChanged,
    this.inputMode = _InputMode.text,
  });

  final TextEditingController controller;
  final String hintText;
  final ValueChanged<String> onChanged;
  final _InputMode inputMode;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      keyboardType: _keyboardTypeForInputMode(inputMode),
      onChanged: onChanged,
      onTapOutside: (_) =>
          _handleTapOutside(controller: controller, onChanged: onChanged),
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

class _FieldEditor extends StatelessWidget {
  const _FieldEditor({
    required this.label,
    required this.controller,
    this.maxLines = 1,
    this.hasError = false,
    this.onTapOutside,
    this.inputMode = _InputMode.text,
    this.onChanged,
    this.maxLength,
    this.hintText,
    this.labelIconAsset,
    this.labelIconKey,
  });

  final String label;
  final TextEditingController controller;
  final int maxLines;
  final bool hasError;
  final VoidCallback? onTapOutside;
  final _InputMode inputMode;
  final ValueChanged<String>? onChanged;
  final int? maxLength;
  final String? hintText;
  final String? labelIconAsset;
  final Key? labelIconKey;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _FieldLabel(
          label: label,
          iconAsset: labelIconAsset,
          iconKey: labelIconKey,
        ),
        const SizedBox(height: AppThemeTokens.fieldLabelToControlGap),
        if (maxLength == null)
          TextField(
            controller: controller,
            maxLines: maxLines,
            keyboardType: _keyboardTypeForInputMode(inputMode),
            onChanged: onChanged,
            onTapOutside: (_) => _handleTapOutside(
              controller: controller,
              onChanged: onChanged,
              onTapOutside: onTapOutside,
            ),
            decoration: _buildDecoration(
              InputDecoration(hintText: hintText ?? label),
            ),
          )
        else
          Stack(
            children: [
              TextField(
                controller: controller,
                maxLines: maxLines,
                keyboardType: _keyboardTypeForInputMode(inputMode),
                onChanged: onChanged,
                onTapOutside: (_) => _handleTapOutside(
                  controller: controller,
                  onChanged: onChanged,
                  onTapOutside: onTapOutside,
                ),
                maxLength: maxLength,
                textAlignVertical: maxLines > 1
                    ? TextAlignVertical.top
                    : TextAlignVertical.center,
                decoration: _buildDecoration(
                  InputDecoration(
                    hintText: hintText ?? label,
                    counterText: '',
                    suffix: maxLines == 1
                        ? const SizedBox(
                            width:
                                AppThemeTokens.scrollBottomReservePrimary +
                                AppThemeTokens.sectionGapCompact,
                          )
                        : null,
                    contentPadding: maxLines > 1
                        ? const EdgeInsets.fromLTRB(
                            AppThemeTokens.inputPaddingX,
                            AppThemeTokens.inputPaddingY,
                            AppThemeTokens.inputPaddingX,
                            AppThemeTokens.inputPaddingY +
                                AppThemeTokens.scrollBottomReserveSecondary,
                          )
                        : null,
                  ),
                ),
              ),
              Positioned(
                right: AppThemeTokens.inputPaddingX,
                bottom: AppThemeTokens.cardInlineGap,
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

  InputDecoration _buildDecoration(InputDecoration decoration) {
    if (!hasError) {
      return decoration;
    }

    final errorBorder = OutlineInputBorder(
      borderRadius: BorderRadius.circular(AppThemeTokens.radiusMd),
      borderSide: const BorderSide(color: AppThemeTokens.error),
    );
    return decoration.copyWith(
      border: errorBorder,
      enabledBorder: errorBorder,
      focusedBorder: errorBorder,
    );
  }
}

class _CurrencyFieldWithCode extends StatelessWidget {
  const _CurrencyFieldWithCode({
    required this.label,
    required this.controller,
    required this.currencyCode,
    this.hintText,
    this.hasError = false,
    this.inputMode = _InputMode.decimal,
    this.onTapOutside,
    this.onChanged,
    this.labelIconAsset,
    this.labelIconKey,
  });

  final String label;
  final TextEditingController controller;
  final String currencyCode;
  final String? hintText;
  final bool hasError;
  final _InputMode inputMode;
  final VoidCallback? onTapOutside;
  final ValueChanged<String>? onChanged;
  final String? labelIconAsset;
  final Key? labelIconKey;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _FieldLabel(
          label: label,
          iconAsset: labelIconAsset,
          iconKey: labelIconKey,
        ),
        const SizedBox(height: AppThemeTokens.fieldLabelToControlGap),
        TextField(
          controller: controller,
          keyboardType: _keyboardTypeForInputMode(inputMode),
          onChanged: onChanged,
          onTapOutside: (_) => _handleTapOutside(
            controller: controller,
            onChanged: onChanged,
            onTapOutside: onTapOutside,
          ),
          decoration: _buildDecoration(
            context,
            InputDecoration(
              hintText: hintText ?? label,
              suffix: Padding(
                padding: const EdgeInsets.only(
                  left: AppThemeTokens.cardContentGap,
                ),
                child: Text(
                  currencyCode,
                  style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                    color: AppThemeTokens.textSecondary,
                    fontWeight: _fontWeight(AppThemeTokens.fontWeightSemibold),
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }

  InputDecoration _buildDecoration(
    BuildContext context,
    InputDecoration decoration,
  ) {
    if (!hasError) {
      return decoration;
    }

    final errorBorder = OutlineInputBorder(
      borderRadius: BorderRadius.circular(AppThemeTokens.radiusMd),
      borderSide: const BorderSide(color: AppThemeTokens.error),
    );
    return decoration.copyWith(
      border: errorBorder,
      enabledBorder: errorBorder,
      focusedBorder: errorBorder,
    );
  }
}

class _FieldLabel extends StatelessWidget {
  const _FieldLabel({
    required this.label,
    this.iconAsset,
    this.iconKey,
    this.centerText = false,
    this.textStyle,
    this.trailing,
  });

  final String label;
  final String? iconAsset;
  final Key? iconKey;
  final bool centerText;
  final TextStyle? textStyle;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final resolvedStyle = textStyle ?? Theme.of(context).textTheme.titleMedium;
    final labelFontSize =
        resolvedStyle?.fontSize ?? AppThemeTokens.fontSizeTitleMedium;
    final iconSize = AppThemeTokens.attachedLabelIconSize(labelFontSize);
    final iconGap = AppThemeTokens.attachedLabelIconGap(iconSize);
    const trailingGap = AppThemeTokens.fieldLabelToControlGap;
    final trailingWidth = trailing == null
        ? 0.0
        : (AppThemeTokens.attachedLabelIconSize(labelFontSize) +
                  AppThemeTokens.unit)
              .toDouble();

    if (iconAsset == null) {
      if (centerText) {
        return Center(child: Text(label, style: resolvedStyle));
      }
      return Text(label, style: resolvedStyle);
    }

    if (!centerText) {
      return Row(
        children: [
          _buildLabelIcon(iconSize),
          SizedBox(width: iconGap),
          Expanded(
            child: Text(
              label,
              style: resolvedStyle,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          if (trailing != null) const SizedBox(width: trailingGap),
          if (trailing != null)
            SizedBox(
              width: trailingWidth,
              child: Center(child: trailing),
            ),
        ],
      );
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        final textPainter = TextPainter(
          text: TextSpan(text: label, style: resolvedStyle),
          textDirection: Directionality.of(context),
          maxLines: 1,
        )..layout(maxWidth: constraints.maxWidth);

        final textWidth = textPainter.width;
        final trailingReserve = trailing == null
            ? 0.0
            : (trailingGap + trailingWidth);
        final desiredIconLeft =
            (constraints.maxWidth / 2) - (textWidth / 2) - iconGap - iconSize;
        final desiredTrailingLeft =
            (constraints.maxWidth / 2) + (textWidth / 2) + trailingGap;
        final clampedIconLeft = desiredIconLeft
            .clamp(0.0, math.max(0.0, constraints.maxWidth - iconSize))
            .toDouble();
        final clampedTrailingLeft = desiredTrailingLeft
            .clamp(0.0, math.max(0.0, constraints.maxWidth - trailingWidth))
            .toDouble();
        final labelHeight = math.max(
          textPainter.height,
          math.max(iconSize, trailingWidth),
        );
        final safeTextMaxWidth = math.max(
          0.0,
          constraints.maxWidth - trailingReserve,
        );

        return SizedBox(
          width: constraints.maxWidth,
          height: labelHeight,
          child: Stack(
            fit: StackFit.expand,
            children: [
              Center(
                child: ConstrainedBox(
                  constraints: BoxConstraints(maxWidth: safeTextMaxWidth),
                  child: Text(
                    label,
                    style: resolvedStyle,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                  ),
                ),
              ),
              Positioned(
                left: clampedIconLeft,
                top: 0,
                bottom: 0,
                child: Center(child: _buildLabelIcon(iconSize)),
              ),
              if (trailing != null)
                Positioned(
                  left: clampedTrailingLeft,
                  top: 0,
                  bottom: 0,
                  child: SizedBox(
                    width: trailingWidth,
                    child: Center(child: trailing),
                  ),
                ),
            ],
          ),
        );
      },
    );
  }

  Widget _buildLabelIcon(double iconSize) {
    return ColorFiltered(
      colorFilter: const ColorFilter.mode(
        AppThemeTokens.textPrimary,
        BlendMode.srcIn,
      ),
      child: SvgPicture.asset(
        iconAsset!,
        key: iconKey,
        width: iconSize,
        height: iconSize,
      ),
    );
  }
}

class _AdaptiveCurrencyReadOnlyField extends StatelessWidget {
  const _AdaptiveCurrencyReadOnlyField({
    required this.label,
    required this.value,
    required this.currencyCode,
  });

  final String label;
  final num value;
  final String currencyCode;

  @override
  Widget build(BuildContext context) {
    final valueStyle = Theme.of(context).textTheme.bodyLarge?.copyWith(
      fontWeight: _fontWeight(AppThemeTokens.fontWeightSemibold),
    );
    final trailingStyle = Theme.of(context).textTheme.bodyLarge?.copyWith(
      color: AppThemeTokens.textSecondary,
      fontWeight: _fontWeight(AppThemeTokens.fontWeightSemibold),
    );
    final fullValue = _formatNumber(value, maxFractionDigits: 2);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _FieldLabel(label: label),
        const SizedBox(height: AppThemeTokens.fieldLabelToControlGap),
        LayoutBuilder(
          builder: (context, constraints) {
            final availableWidth =
                (constraints.maxWidth - (AppThemeTokens.inputPaddingX * 2))
                    .clamp(0, double.infinity);
            final fullTextWidth = _measureTextWidth(
              context,
              fullValue,
              valueStyle,
            );
            final trailingWidth = _measureTextWidth(
              context,
              currencyCode,
              trailingStyle,
            );
            final canUseFull =
                fullTextWidth + AppThemeTokens.cardInlineGap + trailingWidth <=
                availableWidth;
            final resolvedValue = canUseFull
                ? fullValue
                : _compactNumber(value);

            return InputDecorator(
              decoration: const InputDecoration(enabled: false),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      resolvedValue,
                      textAlign: TextAlign.start,
                      style: valueStyle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const SizedBox(width: AppThemeTokens.cardInlineGap),
                  Text(currencyCode, style: trailingStyle),
                ],
              ),
            );
          },
        ),
      ],
    );
  }

  static double _measureTextWidth(
    BuildContext context,
    String text,
    TextStyle? style,
  ) {
    final painter = TextPainter(
      text: TextSpan(text: text, style: style),
      textDirection: Directionality.of(context),
      maxLines: 1,
    )..layout();
    return painter.width;
  }
}
