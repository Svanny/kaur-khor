part of '../views/inventory_views.dart';

class _SlidingYesNoToggle extends StatelessWidget {
  const _SlidingYesNoToggle({
    required this.value,
    required this.onChanged,
    super.key,
  });

  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    return _SlidingTogglePill(
      options: const ['No', 'Yes'],
      selectedIndex: value ? 1 : 0,
      onChanged: (index) => onChanged(index == 1),
      trackWidth: AppThemeTokens.segmentedToggleTrackWidth,
    );
  }
}

class _SlidingTogglePill extends StatelessWidget {
  const _SlidingTogglePill({
    required this.options,
    required this.selectedIndex,
    required this.onChanged,
    this.trackWidth,
    this.contentDrivenWidth = false,
  }) : assert(options.length >= 2),
       assert(selectedIndex >= 0),
       assert(selectedIndex < options.length);

  static const Duration _duration = Duration(milliseconds: 220);

  final List<String> options;
  final int selectedIndex;
  final ValueChanged<int> onChanged;
  final double? trackWidth;
  final bool contentDrivenWidth;

  @override
  Widget build(BuildContext context) {
    final labelStyle = Theme.of(context).textTheme.bodyMedium?.copyWith(
      fontWeight: _fontWeight(AppThemeTokens.fontWeightSemibold),
    );
    const inset = AppThemeTokens.segmentedToggleTrackInset;
    final segmentWidths = contentDrivenWidth
        ? options
              .map(
                (label) =>
                    _measureLabelWidth(context, label, labelStyle) +
                    (AppThemeTokens.togglePillLabelPadX * 2) +
                    (inset * 2),
              )
              .toList(growable: false)
        : List<double>.filled(
            options.length,
            (trackWidth ?? AppThemeTokens.segmentedToggleTrackWidth) /
                options.length,
          );
    final resolvedTrackWidth = segmentWidths.fold<double>(
      0,
      (sum, width) => sum + width,
    );
    final selectedLeft =
        segmentWidths
            .take(selectedIndex)
            .fold<double>(0, (sum, width) => sum + width) +
        inset;
    final selectedWidth = math.max(
      0.0,
      segmentWidths[selectedIndex] - (inset * 2),
    );

    return SizedBox(
      width: resolvedTrackWidth,
      height: AppThemeTokens.segmentedToggleTrackHeight,
      child: DecoratedBox(
        decoration: BoxDecoration(
          color: AppThemeTokens.surface,
          borderRadius: BorderRadius.circular(AppThemeTokens.radiusPill),
          border: Border.all(color: AppThemeTokens.border),
        ),
        child: Stack(
          children: [
            AnimatedPositioned(
              duration: _duration,
              curve: Curves.easeInOutCubic,
              top: inset,
              left: selectedLeft,
              width: selectedWidth,
              height: AppThemeTokens.segmentedToggleThumbHeight,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: AppThemeTokens.primary,
                  borderRadius: BorderRadius.circular(
                    AppThemeTokens.radiusPill,
                  ),
                ),
              ),
            ),
            Row(
              children: List.generate(options.length, (index) {
                final isSelected = index == selectedIndex;
                return SizedBox(
                  width: segmentWidths[index],
                  child: GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: () => onChanged(index),
                    child: Center(
                      child: Padding(
                        padding: const EdgeInsets.symmetric(
                          horizontal: AppThemeTokens.togglePillLabelPadX,
                        ),
                        child: Text(
                          options[index],
                          style: labelStyle?.copyWith(
                            color: isSelected
                                ? AppThemeTokens.white
                                : AppThemeTokens.textSecondary,
                          ),
                        ),
                      ),
                    ),
                  ),
                );
              }),
            ),
          ],
        ),
      ),
    );
  }

  double _measureLabelWidth(
    BuildContext context,
    String label,
    TextStyle? style,
  ) {
    final textPainter = TextPainter(
      text: TextSpan(text: label, style: style),
      maxLines: 1,
      textDirection: Directionality.of(context),
    )..layout();
    return textPainter.width;
  }
}
