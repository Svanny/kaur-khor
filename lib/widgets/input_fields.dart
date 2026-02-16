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

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: Theme.of(context).textTheme.titleMedium),
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
  });

  final String label;
  final TextEditingController controller;
  final String currencyCode;
  final String? hintText;
  final bool hasError;
  final _InputMode inputMode;
  final VoidCallback? onTapOutside;
  final ValueChanged<String>? onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: Theme.of(context).textTheme.titleMedium),
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
        Text(label, style: Theme.of(context).textTheme.titleMedium),
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
