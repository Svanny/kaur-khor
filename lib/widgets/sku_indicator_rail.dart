import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

enum SkuIndicatorDensityRule {
  balanced,
  dense,
  airy;

  double get gapToHeightRatio {
    return switch (this) {
      SkuIndicatorDensityRule.balanced => 0.6,
      SkuIndicatorDensityRule.dense => 0.35,
      SkuIndicatorDensityRule.airy => 1.0,
    };
  }
}

class SkuIndicatorRail extends StatelessWidget {
  const SkuIndicatorRail({
    required this.count,
    required this.selectedIndex,
    required this.animationDuration,
    required this.trackKey,
    super.key,
    this.densityRule = SkuIndicatorDensityRule.balanced,
    this.gapScale = 1.0,
    this.indicatorPrefix = 'update-stock-indicator',
    this.indicatorWidth = AppThemeTokens.stockIndicatorWidth,
    this.selectedColor = AppThemeTokens.stockIndicatorSelected,
    this.unselectedColor = AppThemeTokens.stockIndicatorUnselected,
  });

  final int count;
  final int selectedIndex;
  final Duration animationDuration;
  final Key trackKey;
  final SkuIndicatorDensityRule densityRule;
  final double gapScale;
  final String indicatorPrefix;
  final double indicatorWidth;
  final Color selectedColor;
  final Color unselectedColor;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        if (count <= 0) {
          return const SizedBox.shrink();
        }

        final availableHeight = constraints.maxHeight;
        if (availableHeight <= 0) {
          return SizedBox(key: trackKey, width: indicatorWidth);
        }

        final ratio = densityRule.gapToHeightRatio * gapScale;
        final pillHeight = _pillHeightFor(
          availableHeight: availableHeight,
          count: count,
          ratio: ratio,
        );
        final gap = count > 1 ? ratio * pillHeight : 0.0;

        final children = <Widget>[];
        for (var index = 0; index < count; index++) {
          final isActive = index == selectedIndex;
          children.add(
            AnimatedContainer(
              key: ValueKey(
                '$indicatorPrefix-$index-${isActive ? 'active' : 'inactive'}',
              ),
              duration: animationDuration,
              width: indicatorWidth,
              height: pillHeight,
              decoration: BoxDecoration(
                color: isActive ? selectedColor : unselectedColor,
                borderRadius: BorderRadius.circular(AppThemeTokens.radiusPill),
              ),
            ),
          );
          if (index < count - 1) {
            children.add(SizedBox(height: gap));
          }
        }

        return SizedBox(
          key: trackKey,
          width: indicatorWidth,
          child: Column(mainAxisSize: MainAxisSize.max, children: children),
        );
      },
    );
  }

  double _pillHeightFor({
    required double availableHeight,
    required int count,
    required double ratio,
  }) {
    if (count == 1) {
      return availableHeight;
    }
    return availableHeight / (count + (ratio * (count - 1)));
  }
}
