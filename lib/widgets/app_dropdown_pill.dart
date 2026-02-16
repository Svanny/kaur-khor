import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/foundation.dart';

import '../theme/app_theme.dart';

const bool _dropdownDebugLogs = bool.fromEnvironment(
  'BANJI_DROPDOWN_DEBUG',
  defaultValue: false,
);

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
  final GlobalKey _targetKey = GlobalKey();
  final GlobalKey _pillKey = GlobalKey();
  final GlobalKey _menuPanelKey = GlobalKey();
  OverlayEntry? _overlayEntry;
  late final AnimationController _animationController;
  late final CurvedAnimation _dropdownAnimation;
  bool _isOpen = false;
  double _menuWidth = 100;
  double _horizontalOffset = 0;
  bool _didPostLayoutCorrection = false;
  bool _postLayoutCorrectionPending = false;

  void _debugLog(String message) {
    if (!_dropdownDebugLogs || !kDebugMode) return;
    debugPrint(
      'AppDropdownPill[key=${widget.key ?? '<none>'} menuKey=${widget.menuKey ?? '<none>'}] $message',
    );
  }

  Rect? _rectInOverlay(RenderBox? box, RenderBox? overlayRenderBox) {
    if (box == null || overlayRenderBox == null || !box.hasSize) {
      return null;
    }
    final topLeft = box.localToGlobal(Offset.zero, ancestor: overlayRenderBox);
    return topLeft & box.size;
  }

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
    final insertionOverlay = Overlay.of(context, rootOverlay: true);
    final overlayRenderBox = _overlayRenderBoxFor(insertionOverlay);
    final overlayWidth = _overlayWidth(overlayRenderBox);
    final pillSize = renderObject.size;
    final contentMenuWidth = _menuWidthForContent(context);
    final unconstrainedWidth = math.max(
      math.max(pillSize.width, widget.minMenuWidth),
      contentMenuWidth,
    );
    final defaultMaxMenuWidth = _usableOverlayWidth(overlayWidth);
    final constrainedMaxWidth = math.min(
      widget.maxMenuWidth ?? defaultMaxMenuWidth,
      defaultMaxMenuWidth,
    );
    final constrainedMinWidth = math.min(
      widget.minMenuWidth,
      constrainedMaxWidth,
    );
    _menuWidth = unconstrainedWidth
        .clamp(constrainedMinWidth, constrainedMaxWidth)
        .toDouble();
    _debugLog(
      'open: pillSize=$pillSize overlayWidth=$overlayWidth '
      'contentMenuWidth=$contentMenuWidth unconstrainedWidth=$unconstrainedWidth '
      'minMenuWidth=${widget.minMenuWidth} maxMenuWidth=${widget.maxMenuWidth ?? '<auto>'} '
      'constrainedMinWidth=$constrainedMinWidth constrainedMaxWidth=$constrainedMaxWidth '
      'finalMenuWidth=$_menuWidth',
    );

    final targetAnchor = Alignment(
      -1,
      widget.menuYAlignment == AppDropdownYAlignment.top ? -1 : 1,
    );
    final followerAnchor = Alignment(
      -1,
      widget.menuYAlignment == AppDropdownYAlignment.top ? 1 : -1,
    );
    final verticalOffset =
        (widget.menuYAlignment == AppDropdownYAlignment.top ? -1 : 1) *
        (AppThemeTokens.unit / 2);
    _horizontalOffset = _horizontalViewportNudge(
      renderBox: renderObject,
      overlayRenderBox: overlayRenderBox,
      pillSize: pillSize,
      menuWidth: _menuWidth,
      xAlignment: widget.menuXAlignment,
    );
    _debugLog(
      'anchors: targetAnchor=$targetAnchor followerAnchor=$followerAnchor '
      'menuXAlignment=${widget.menuXAlignment} menuYAlignment=${widget.menuYAlignment} '
      'horizontalOffset=$_horizontalOffset verticalOffset=$verticalOffset',
    );
    final leaderRenderObject = _targetKey.currentContext?.findRenderObject();
    final leaderRenderBox = leaderRenderObject is RenderBox
        ? leaderRenderObject
        : null;
    _debugLog(
      'open geometry: leaderRect=${_rectInOverlay(leaderRenderBox, overlayRenderBox)} '
      'pillRect=${_rectInOverlay(renderObject, overlayRenderBox)}',
    );
    _didPostLayoutCorrection = false;
    _postLayoutCorrectionPending = false;

    _overlayEntry = OverlayEntry(
      builder: (context) {
        _schedulePostLayoutCorrection(insertionOverlay);
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
                offset: Offset(_horizontalOffset, verticalOffset),
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
                        key: _menuPanelKey,
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
              ),
            ],
          ),
        );
      },
    );

    insertionOverlay.insert(_overlayEntry!);
    setState(() => _isOpen = true);
    _animationController.forward(from: 0);
    _debugLog('overlay inserted and animation started');
  }

  RenderBox? _overlayRenderBoxFor(OverlayState overlay) {
    final overlayRenderObject = overlay.context.findRenderObject();
    if (overlayRenderObject is RenderBox && overlayRenderObject.hasSize) {
      return overlayRenderObject;
    }
    return null;
  }

  double _overlayWidth(RenderBox? overlayRenderBox) {
    if (overlayRenderBox != null) {
      return overlayRenderBox.size.width;
    }
    final view = View.maybeOf(context);
    if (view != null) {
      return view.physicalSize.width / view.devicePixelRatio;
    }
    return MediaQuery.sizeOf(context).width;
  }

  double _usableOverlayWidth(double overlayWidth) {
    const horizontalMargin = AppThemeTokens.space4 * 2;
    return math.max(0, overlayWidth - horizontalMargin);
  }

  void _schedulePostLayoutCorrection(OverlayState insertionOverlay) {
    if (_didPostLayoutCorrection || _postLayoutCorrectionPending) {
      _debugLog(
        'post-layout correction skipped: '
        'didCorrection=$_didPostLayoutCorrection pending=$_postLayoutCorrectionPending',
      );
      return;
    }
    _debugLog('post-layout correction scheduled');
    _postLayoutCorrectionPending = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _postLayoutCorrectionPending = false;
      if (!mounted || !_isOpen || _didPostLayoutCorrection) {
        _debugLog(
          'post-layout correction aborted: mounted=$mounted isOpen=$_isOpen '
          'didCorrection=$_didPostLayoutCorrection',
        );
        return;
      }

      final menuRenderObject = _menuPanelKey.currentContext?.findRenderObject();
      final menuRenderBox = menuRenderObject is RenderBox
          ? menuRenderObject
          : null;
      final targetRenderObject = _pillKey.currentContext?.findRenderObject();
      final targetRenderBox = targetRenderObject is RenderBox
          ? targetRenderObject
          : null;
      final overlayRenderBox = _overlayRenderBoxFor(insertionOverlay);
      if (menuRenderBox == null ||
          targetRenderBox == null ||
          overlayRenderBox == null ||
          !menuRenderBox.hasSize ||
          !targetRenderBox.hasSize) {
        _debugLog(
          'post-layout correction missing render boxes: '
          'menuRenderBox=$menuRenderBox targetRenderBox=$targetRenderBox '
          'overlayRenderBox=$overlayRenderBox',
        );
        return;
      }

      final menuLeft = menuRenderBox
          .localToGlobal(Offset.zero, ancestor: overlayRenderBox)
          .dx;
      final leaderRenderObject = _targetKey.currentContext?.findRenderObject();
      final leaderRenderBox = leaderRenderObject is RenderBox
          ? leaderRenderObject
          : null;
      final leaderRect = _rectInOverlay(leaderRenderBox, overlayRenderBox);
      final clampedLeft = _clampedMenuLeft(
        desiredLeft: menuLeft,
        menuWidth: menuRenderBox.size.width,
        overlayWidth: overlayRenderBox.size.width,
      );
      final overlayDelta = clampedLeft - menuLeft;
      _debugLog(
        'post-layout measured: menuLeft=$menuLeft menuWidth=${menuRenderBox.size.width} '
        'menuRect=${_rectInOverlay(menuRenderBox, overlayRenderBox)} '
        'leaderRect=$leaderRect '
        'overlayWidth=${overlayRenderBox.size.width} clampedLeft=$clampedLeft '
        'overlayDelta=$overlayDelta',
      );
      if (leaderRect != null) {
        final expectedLeft = _desiredLeftForAlignment(
          triggerLeft: leaderRect.left,
          triggerRight: leaderRect.right,
          menuWidth: menuRenderBox.size.width,
          xAlignment: widget.menuXAlignment,
        );
        _debugLog(
          'post-layout expected from leader: expectedLeft=$expectedLeft '
          'actualMenuLeft=$menuLeft expectedDelta=${expectedLeft - menuLeft}',
        );
      }

      _didPostLayoutCorrection = true;
      if (overlayDelta.abs() <= 0.5) {
        _debugLog('post-layout correction not needed (overlayDelta threshold)');
        return;
      }

      final targetDelta = _overlayDxToTargetDx(
        renderBox: targetRenderBox,
        overlayRenderBox: overlayRenderBox,
        overlayDx: overlayDelta,
      );
      if (targetDelta.abs() <= 0.001) {
        _debugLog(
          'post-layout correction too small in target space: targetDelta=$targetDelta',
        );
        return;
      }

      _horizontalOffset += targetDelta;
      _debugLog(
        'post-layout correction applied: targetDelta=$targetDelta '
        'newHorizontalOffset=$_horizontalOffset',
      );
      _overlayEntry?.markNeedsBuild();
    });
  }

  double _horizontalViewportNudge({
    required RenderBox renderBox,
    required RenderBox? overlayRenderBox,
    required Size pillSize,
    required double menuWidth,
    required AppDropdownXAlignment xAlignment,
  }) {
    assert(
      (renderBox.size.width - pillSize.width).abs() < 1.0,
      'renderBox and pillSize must describe the same widget.',
    );

    if (overlayRenderBox == null) {
      final globalTopLeft = renderBox.localToGlobal(Offset.zero);
      final triggerLeft = globalTopLeft.dx;
      final triggerRight = triggerLeft + pillSize.width;
      final desiredLeft = _desiredLeftForAlignment(
        triggerLeft: triggerLeft,
        triggerRight: triggerRight,
        menuWidth: menuWidth,
        xAlignment: xAlignment,
      );
      final clampedLeft = _clampedMenuLeft(
        desiredLeft: desiredLeft,
        menuWidth: menuWidth,
        overlayWidth: _overlayWidth(null),
      );
      final overlayDelta = clampedLeft - triggerLeft;
      _debugLog(
        'nudge(no overlay box): triggerLeft=$triggerLeft triggerRight=$triggerRight '
        'desiredLeft=$desiredLeft clampedLeft=$clampedLeft '
        'overlayWidth=${_overlayWidth(null)} overlayDelta=$overlayDelta',
      );
      return overlayDelta;
    }

    final triggerLeft = renderBox
        .localToGlobal(Offset.zero, ancestor: overlayRenderBox)
        .dx;
    final triggerRight = renderBox
        .localToGlobal(Offset(pillSize.width, 0), ancestor: overlayRenderBox)
        .dx;
    final desiredLeft = _desiredLeftForAlignment(
      triggerLeft: triggerLeft,
      triggerRight: triggerRight,
      menuWidth: menuWidth,
      xAlignment: xAlignment,
    );
    final overlayWidth = overlayRenderBox.size.width;
    final clampedLeft = _clampedMenuLeft(
      desiredLeft: desiredLeft,
      menuWidth: menuWidth,
      overlayWidth: overlayWidth,
    );
    final overlayDelta = clampedLeft - triggerLeft;
    final targetDelta = _overlayDxToTargetDx(
      renderBox: renderBox,
      overlayRenderBox: overlayRenderBox,
      overlayDx: overlayDelta,
    );
    _debugLog(
      'nudge: triggerLeft=$triggerLeft triggerRight=$triggerRight '
      'desiredLeft=$desiredLeft clampedLeft=$clampedLeft '
      'overlayWidth=$overlayWidth overlayDelta=$overlayDelta targetDelta=$targetDelta',
    );
    return targetDelta;
  }

  double _desiredLeftForAlignment({
    required double triggerLeft,
    required double triggerRight,
    required double menuWidth,
    required AppDropdownXAlignment xAlignment,
  }) {
    final triggerCenter = (triggerLeft + triggerRight) / 2;
    return switch (xAlignment) {
      AppDropdownXAlignment.left => triggerLeft,
      AppDropdownXAlignment.center => triggerCenter - (menuWidth / 2),
      AppDropdownXAlignment.right => triggerRight - menuWidth,
    };
  }

  double _clampedMenuLeft({
    required double desiredLeft,
    required double menuWidth,
    required double overlayWidth,
  }) {
    const margin = AppThemeTokens.space4;
    const minLeft = margin;
    final maxRight = overlayWidth - margin;
    final maxLeft = maxRight - menuWidth;
    if (maxLeft >= minLeft) {
      return desiredLeft.clamp(minLeft, maxLeft).toDouble();
    }
    return minLeft;
  }

  double _overlayDxToTargetDx({
    required RenderBox renderBox,
    required RenderBox overlayRenderBox,
    required double overlayDx,
  }) {
    final transform = renderBox.getTransformTo(overlayRenderBox);
    final origin = MatrixUtils.transformPoint(transform, Offset.zero);
    final unitX = MatrixUtils.transformPoint(transform, const Offset(1, 0));
    final dxPerLocalUnit = unitX.dx - origin.dx;
    if (dxPerLocalUnit.abs() < 1e-6) {
      _debugLog(
        'overlayDxToTargetDx fallback: dxPerLocalUnit=$dxPerLocalUnit '
        'overlayDx=$overlayDx',
      );
      return overlayDx;
    }
    final result = overlayDx / dxPerLocalUnit;
    _debugLog(
      'overlayDxToTargetDx: overlayDx=$overlayDx dxPerLocalUnit=$dxPerLocalUnit '
      'targetDx=$result',
    );
    return result;
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

    _debugLog('close requested');
    setState(() => _isOpen = false);
    _animationController.reverse().whenComplete(_removeOverlay);
  }

  void _removeOverlay() {
    _debugLog('overlay removed');
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
      key: _targetKey,
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
