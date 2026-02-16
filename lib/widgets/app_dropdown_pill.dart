import 'dart:math' as math;

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../theme/app_theme.dart';

typedef AppDropdownTriggerBuilder<T> =
    Widget Function(BuildContext context, bool isOpen, T value);

typedef AppDropdownMenuBuilder<T> =
    Widget Function(
      BuildContext context,
      double width,
      List<T> options,
      T selectedValue,
      ValueChanged<T> onSelected,
      Color backgroundColor,
      Color foregroundColor,
    );

enum AppDropdownXAlignment { left, center, right }

enum AppDropdownYAlignment { top, bottom }

class AppDropdownPill<T> extends StatefulWidget {
  const AppDropdownPill({
    required this.value,
    required this.options,
    required this.labelBuilder,
    required this.onChanged,
    super.key,
    this.triggerKey,
    this.menuKey,
    this.triggerBuilder,
    this.menuBuilder,
    this.menuXAlignment = AppDropdownXAlignment.right,
    this.menuYAlignment = AppDropdownYAlignment.bottom,
    this.minMenuWidth = 100,
    this.maxMenuWidth,
    this.backgroundColor = AppThemeTokens.primary,
    this.foregroundColor = AppThemeTokens.white,
    this.menuBackgroundColor = AppThemeTokens.primary,
  });

  final T value;
  final List<T> options;
  final String Function(T option) labelBuilder;
  final ValueChanged<T> onChanged;
  final Key? triggerKey;
  final Key? menuKey;
  final AppDropdownTriggerBuilder<T>? triggerBuilder;
  final AppDropdownMenuBuilder<T>? menuBuilder;
  final AppDropdownXAlignment menuXAlignment;
  final AppDropdownYAlignment menuYAlignment;
  final double minMenuWidth;
  final double? maxMenuWidth;
  final Color backgroundColor;
  final Color foregroundColor;
  final Color menuBackgroundColor;

  @override
  State<AppDropdownPill<T>> createState() => _AppDropdownPillState<T>();
}

class _AppDropdownPillState<T> extends State<AppDropdownPill<T>>
    with SingleTickerProviderStateMixin {
  final LayerLink _layerLink = LayerLink();
  final GlobalKey _pillKey = GlobalKey();
  OverlayEntry? _overlayEntry;
  late final AnimationController _animationController;
  late final CurvedAnimation _dropdownAnimation;
  bool _isOpen = false;
  double _menuWidth = 100;

  @override
  void didUpdateWidget(covariant AppDropdownPill<T> oldWidget) {
    super.didUpdateWidget(oldWidget);
    final optionsChanged = !listEquals(oldWidget.options, widget.options);
    if (_isOpen && (oldWidget.value != widget.value || optionsChanged)) {
      _closeDropdown();
    }
  }

  @override
  void initState() {
    super.initState();
    _animationController = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 180),
    );
    _dropdownAnimation = CurvedAnimation(
      parent: _animationController,
      curve: Curves.easeOutCubic,
      reverseCurve: Curves.easeInCubic,
    );
  }

  @override
  void dispose() {
    _removeOverlay();
    _animationController.dispose();
    super.dispose();
  }

  void _toggleDropdown() {
    if (_isOpen) {
      _closeDropdown();
    } else {
      _openDropdown();
    }
  }

  void _openDropdown() {
    final renderObject = _pillKey.currentContext?.findRenderObject();
    if (renderObject is! RenderBox || !renderObject.hasSize) return;
    final pillSize = renderObject.size;
    final contentMenuWidth = _menuWidthForContent(context);
    final unconstrainedWidth = math.max(
      math.max(pillSize.width, widget.minMenuWidth),
      contentMenuWidth,
    );
    final defaultMaxMenuWidth =
        MediaQuery.sizeOf(context).width - (AppThemeTokens.space4 * 2);
    final constrainedMaxWidth = widget.maxMenuWidth ?? defaultMaxMenuWidth;
    final constrainedMinWidth = math.min(
      widget.minMenuWidth,
      constrainedMaxWidth,
    );
    _menuWidth = unconstrainedWidth
        .clamp(constrainedMinWidth, constrainedMaxWidth)
        .toDouble();

    final xAlignment = _xAlignmentValue(widget.menuXAlignment);
    final targetAnchor = Alignment(
      xAlignment,
      widget.menuYAlignment == AppDropdownYAlignment.top ? -1 : 1,
    );
    final followerAnchor = Alignment(
      xAlignment,
      widget.menuYAlignment == AppDropdownYAlignment.top ? 1 : -1,
    );
    final verticalOffset =
        (widget.menuYAlignment == AppDropdownYAlignment.top ? -1 : 1) *
        (AppThemeTokens.unit / 2);
    final horizontalOffset = _horizontalViewportNudge(
      renderBox: renderObject,
      overlayRenderBox: _rootOverlayRenderBox(),
      pillSize: pillSize,
      menuWidth: _menuWidth,
      xAlignment: widget.menuXAlignment,
    );

    _overlayEntry = OverlayEntry(
      builder: (context) {
        return Positioned.fill(
          child: Stack(
            children: [
              GestureDetector(
                behavior: HitTestBehavior.translucent,
                onTap: _closeDropdown,
                child: const SizedBox.expand(),
              ),
              CompositedTransformFollower(
                link: _layerLink,
                showWhenUnlinked: false,
                targetAnchor: targetAnchor,
                followerAnchor: followerAnchor,
                offset: Offset(horizontalOffset, verticalOffset),
                child: Material(
                  color: Colors.transparent,
                  child: FadeTransition(
                    opacity: _dropdownAnimation,
                    child: SizeTransition(
                      sizeFactor: _dropdownAnimation,
                      axisAlignment:
                          widget.menuYAlignment == AppDropdownYAlignment.top
                          ? 1
                          : -1,
                      child: KeyedSubtree(
                        key: widget.menuKey,
                        child:
                            widget.menuBuilder?.call(
                              context,
                              _menuWidth,
                              widget.options,
                              widget.value,
                              (value) {
                                widget.onChanged(value);
                                _closeDropdown();
                              },
                              widget.menuBackgroundColor,
                              widget.foregroundColor,
                            ) ??
                            _AppDropdownMenuPanel<T>(
                              width: _menuWidth,
                              backgroundColor: widget.menuBackgroundColor,
                              foregroundColor: widget.foregroundColor,
                              options: widget.options,
                              selectedValue: widget.value,
                              labelBuilder: widget.labelBuilder,
                              onSelected: (value) {
                                widget.onChanged(value);
                                _closeDropdown();
                              },
                            ),
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );

    Overlay.of(context, rootOverlay: true).insert(_overlayEntry!);
    setState(() => _isOpen = true);
    _animationController.forward(from: 0);
  }

  double _xAlignmentValue(AppDropdownXAlignment alignment) {
    return switch (alignment) {
      AppDropdownXAlignment.left => -1,
      AppDropdownXAlignment.center => 0,
      AppDropdownXAlignment.right => 1,
    };
  }

  RenderBox? _rootOverlayRenderBox() {
    final overlayRenderObject = Overlay.of(
      context,
      rootOverlay: true,
    ).context.findRenderObject();
    if (overlayRenderObject is RenderBox && overlayRenderObject.hasSize) {
      return overlayRenderObject;
    }
    return null;
  }

  double _horizontalViewportNudge({
    required RenderBox renderBox,
    required RenderBox? overlayRenderBox,
    required Size pillSize,
    required double menuWidth,
    required AppDropdownXAlignment xAlignment,
  }) {
    final globalTopLeft = renderBox.localToGlobal(Offset.zero);
    final triggerLeft = globalTopLeft.dx;
    final triggerRight = triggerLeft + pillSize.width;
    final triggerCenter = triggerLeft + (pillSize.width / 2);
    final desiredLeft = switch (xAlignment) {
      AppDropdownXAlignment.left => triggerLeft,
      AppDropdownXAlignment.center => triggerCenter - (menuWidth / 2),
      AppDropdownXAlignment.right => triggerRight - menuWidth,
    };
    final overlayTopLeft = overlayRenderBox?.localToGlobal(Offset.zero);
    final overlayLeft = overlayTopLeft?.dx ?? 0;
    final overlayWidth =
        overlayRenderBox?.size.width ?? MediaQuery.sizeOf(context).width;
    final overlayRight = overlayLeft + overlayWidth;
    const margin = AppThemeTokens.space4;
    final minLeft = overlayLeft + margin;
    final maxLeft = overlayRight - margin - menuWidth;
    if (maxLeft <= minLeft) {
      return 0;
    }
    final clampedLeft = desiredLeft.clamp(minLeft, maxLeft).toDouble();
    return clampedLeft - desiredLeft;
  }

  double _menuWidthForContent(BuildContext context) {
    final baseTextStyle =
        Theme.of(
          context,
        ).textTheme.bodyLarge?.copyWith(fontWeight: FontWeight.w600) ??
        const TextStyle(
          fontSize: AppThemeTokens.fontSizeBodyLarge,
          fontWeight: FontWeight.w600,
        );

    final textScaler = MediaQuery.textScalerOf(context);
    double maxTextWidth = 0;
    for (final option in widget.options) {
      final textPainter = TextPainter(
        text: TextSpan(text: widget.labelBuilder(option), style: baseTextStyle),
        textDirection: TextDirection.ltr,
        maxLines: 1,
        textScaler: textScaler,
      )..layout();
      maxTextWidth = math.max(maxTextWidth, textPainter.width);
    }

    const horizontalPadding = AppThemeTokens.dropdownOptionPadTotalX;
    const minTrailingArea =
        AppThemeTokens.dropdownCheckSpacing + AppThemeTokens.iconSizeMedium;
    return maxTextWidth + horizontalPadding + minTrailingArea;
  }

  void _closeDropdown() {
    if (!_isOpen) return;

    setState(() => _isOpen = false);
    _animationController.reverse().whenComplete(_removeOverlay);
  }

  void _removeOverlay() {
    _overlayEntry?.remove();
    _overlayEntry = null;
  }

  @override
  Widget build(BuildContext context) {
    final trigger =
        widget.triggerBuilder?.call(context, _isOpen, widget.value) ??
        _DefaultDropdownTrigger<T>(
          label: widget.labelBuilder(widget.value),
          isOpen: _isOpen,
          foregroundColor: widget.foregroundColor,
        );

    return CompositedTransformTarget(
      link: _layerLink,
      child: GestureDetector(
        key: _pillKey,
        onTap: _toggleDropdown,
        child: DecoratedBox(
          key: widget.triggerKey,
          decoration: BoxDecoration(
            color: widget.backgroundColor,
            borderRadius: BorderRadius.circular(AppThemeTokens.radiusPill),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppThemeTokens.chipPaddingX,
              vertical: AppThemeTokens.chipPaddingY,
            ),
            child: trigger,
          ),
        ),
      ),
    );
  }
}

class _DefaultDropdownTrigger<T> extends StatelessWidget {
  const _DefaultDropdownTrigger({
    required this.label,
    required this.isOpen,
    required this.foregroundColor,
  });

  final String label;
  final bool isOpen;
  final Color foregroundColor;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Text(
          label,
          style: Theme.of(
            context,
          ).textTheme.bodyLarge?.copyWith(color: foregroundColor),
        ),
        const SizedBox(width: AppThemeTokens.dropdownToggleIconGap),
        AnimatedRotation(
          turns: isOpen ? 0.5 : 0,
          duration: const Duration(milliseconds: 180),
          curve: Curves.easeOutCubic,
          child: Icon(
            Icons.keyboard_arrow_down_rounded,
            color: foregroundColor,
          ),
        ),
      ],
    );
  }
}

class _AppDropdownMenuPanel<T> extends StatelessWidget {
  const _AppDropdownMenuPanel({
    required this.width,
    required this.backgroundColor,
    required this.foregroundColor,
    required this.options,
    required this.selectedValue,
    required this.labelBuilder,
    required this.onSelected,
  });

  final double width;
  final Color backgroundColor;
  final Color foregroundColor;
  final List<T> options;
  final T selectedValue;
  final String Function(T option) labelBuilder;
  final ValueChanged<T> onSelected;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      decoration: BoxDecoration(
        color: backgroundColor,
        borderRadius: BorderRadius.circular(AppThemeTokens.radiusMd * 2),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          vertical: AppThemeTokens.dropdownPanelInsetY,
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: options
              .map(
                (option) => InkWell(
                  onTap: () => onSelected(option),
                  borderRadius: BorderRadius.circular(AppThemeTokens.radiusMd),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppThemeTokens.dropdownOptionPadX,
                      vertical: AppThemeTokens.dropdownOptionPadY,
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            labelBuilder(option),
                            maxLines: 1,
                            softWrap: false,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.bodyLarge
                                ?.copyWith(
                                  color: foregroundColor,
                                  fontWeight: option == selectedValue
                                      ? FontWeight.w600
                                      : FontWeight.w500,
                                ),
                          ),
                        ),
                        if (option == selectedValue)
                          const SizedBox(
                            width: AppThemeTokens.dropdownCheckSpacing,
                          ),
                        if (option == selectedValue)
                          Icon(
                            Icons.check_rounded,
                            size: AppThemeTokens.iconSizeMedium,
                            color: foregroundColor,
                          ),
                      ],
                    ),
                  ),
                ),
              )
              .toList(),
        ),
      ),
    );
  }
}
