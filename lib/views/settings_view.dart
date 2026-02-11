import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../theme/app_theme.dart';

class SettingsView extends StatefulWidget {
  const SettingsView({super.key});

  @override
  State<SettingsView> createState() => _SettingsViewState();
}

class _SettingsViewState extends State<SettingsView> {
  static const List<String> _languageOptions = ['English', 'Khmer'];
  static const List<String> _currencyOptions = ['USD', 'KHR'];

  String _selectedLanguage = _languageOptions.first;
  String _selectedCurrency = _currencyOptions.first;

  @override
  Widget build(BuildContext context) {
    final edgePadding = AppThemeTokens.screenEdgePadding(context);
    final contentPadding = EdgeInsets.fromLTRB(
      edgePadding.left,
      AppThemeTokens.space4,
      edgePadding.right,
      edgePadding.bottom,
    );

    return Scaffold(
      backgroundColor: AppThemeTokens.background,
      appBar: AppBar(
        backgroundColor: AppThemeTokens.background,
        foregroundColor: AppThemeTokens.textPrimary,
        iconTheme: const IconThemeData(color: AppThemeTokens.textPrimary),
        titleSpacing: AppThemeTokens.space3,
        title: const Text('Settings'),
      ),
      body: Padding(
        padding: contentPadding,
        child: Column(
          children: [
            _SettingsRow(
              label: 'Language',
              trailing: _DropdownPill(
                value: _selectedLanguage,
                options: _languageOptions,
                onChanged: (value) {
                  setState(() => _selectedLanguage = value);
                },
              ),
            ),
            const SizedBox(height: AppThemeTokens.space4),
            _SettingsRow(
              label: 'Currency',
              trailing: _DropdownPill(
                value: _selectedCurrency,
                options: _currencyOptions,
                onChanged: (value) {
                  setState(() => _selectedCurrency = value);
                },
              ),
            ),
            const SizedBox(height: AppThemeTokens.space4),
            _SettingsRow(
              label: 'Manually Backup',
              trailing: _CircleIconButton(
                icon: SvgPicture.asset(
                  'icons/backup_24dp_E3E3E3_FILL0_wght400_GRAD0_opsz24.svg',
                  width: AppThemeTokens.iconSizeMedium,
                  height: AppThemeTokens.iconSizeMedium,
                  colorFilter: const ColorFilter.mode(
                    AppThemeTokens.white,
                    BlendMode.srcIn,
                  ),
                ),
                onPressed: () {},
              ),
            ),
            const Spacer(),
            Row(
              children: [
                const Icon(
                  Icons.info_outline,
                  size: AppThemeTokens.fontSizeBodyLarge,
                  color: AppThemeTokens.textPrimary,
                ),
                const SizedBox(width: AppThemeTokens.space2),
                Text(
                  'Disclaimer',
                  style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                        color: AppThemeTokens.textPrimary,
                        fontWeight: FontWeight.w600,
                      ),
                ),
                const Spacer(),
                FilledButton(
                  onPressed: () {},
                  style: FilledButton.styleFrom(
                    backgroundColor: AppThemeTokens.textPrimary,
                    foregroundColor: AppThemeTokens.white,
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppThemeTokens.buttonPaddingX,
                      vertical: AppThemeTokens.buttonPaddingY,
                    ),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(
                        AppThemeTokens.radiusPill,
                      ),
                    ),
                  ),
                  child: Text(
                    'Logout',
                    style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                          color: AppThemeTokens.white,
                          fontSize: AppThemeTokens.fontSizeBodyLarge,
                          fontWeight: FontWeight.w500,
                        ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _SettingsRow extends StatelessWidget {
  const _SettingsRow({
    required this.label,
    required this.trailing,
  });

  final String label;
  final Widget trailing;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        Expanded(
          child: Text(
            label,
            style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                  color: AppThemeTokens.textPrimary,
                  fontWeight: FontWeight.w700,
                ),
          ),
        ),
        trailing,
      ],
    );
  }
}

class _DropdownPill extends StatefulWidget {
  const _DropdownPill({
    required this.value,
    required this.options,
    required this.onChanged,
  });

  final String value;
  final List<String> options;
  final ValueChanged<String> onChanged;

  @override
  State<_DropdownPill> createState() => _DropdownPillState();
}

class _DropdownPillState extends State<_DropdownPill>
    with SingleTickerProviderStateMixin {
  static const double _dropdownMinWidth = 100;

  final LayerLink _layerLink = LayerLink();
  final GlobalKey _pillKey = GlobalKey();
  OverlayEntry? _overlayEntry;
  late final AnimationController _animationController = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 180),
  );
  late final CurvedAnimation _dropdownAnimation = CurvedAnimation(
    parent: _animationController,
    curve: Curves.easeOutCubic,
    reverseCurve: Curves.easeInCubic,
  );
  bool _isOpen = false;
  double _menuWidth = _dropdownMinWidth;
  double _pillWidth = 0;
  double _pillHeight = 0;

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
    _menuWidth = math.max(
      math.max(pillSize.width, _dropdownMinWidth),
      contentMenuWidth,
    );
    _pillWidth = pillSize.width;
    _pillHeight = pillSize.height;

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
                offset: Offset(
                  _pillWidth - _menuWidth,
                  _pillHeight + (AppThemeTokens.unit / 2),
                ),
                child: Material(
                  color: Colors.transparent,
                  child: FadeTransition(
                    opacity: _dropdownAnimation,
                    child: SizeTransition(
                      sizeFactor: _dropdownAnimation,
                      axisAlignment: -1,
                      child: _DropdownMenuPanel(
                        width: _menuWidth,
                        options: widget.options,
                        selectedValue: widget.value,
                        onSelected: (value) {
                          widget.onChanged(value);
                          _closeDropdown();
                        },
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

  double _menuWidthForContent(BuildContext context) {
    final baseTextStyle =
        Theme.of(context).textTheme.bodyLarge?.copyWith(
              fontWeight: FontWeight.w600,
            ) ??
            const TextStyle(
              fontSize: AppThemeTokens.fontSizeBodyLarge,
              fontWeight: FontWeight.w600,
            );

    final textScaler = MediaQuery.textScalerOf(context);
    double maxTextWidth = 0;
    for (final option in widget.options) {
      final textPainter = TextPainter(
        text: TextSpan(text: option, style: baseTextStyle),
        textDirection: TextDirection.ltr,
        maxLines: 1,
        textScaler: textScaler,
      )..layout();
      maxTextWidth = math.max(maxTextWidth, textPainter.width);
    }

    const horizontalPadding = AppThemeTokens.space3 * 2;
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
    return CompositedTransformTarget(
      link: _layerLink,
      child: GestureDetector(
        key: _pillKey,
        onTap: _toggleDropdown,
        child: DecoratedBox(
          decoration: BoxDecoration(
            color: AppThemeTokens.textPrimary,
            borderRadius: BorderRadius.circular(AppThemeTokens.radiusPill),
          ),
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppThemeTokens.chipPaddingX,
              vertical: AppThemeTokens.chipPaddingY,
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  widget.value,
                  style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                        color: AppThemeTokens.white,
                      ),
                ),
                const SizedBox(width: AppThemeTokens.space1),
                AnimatedRotation(
                  turns: _isOpen ? 0.5 : 0,
                  duration: const Duration(milliseconds: 180),
                  curve: Curves.easeOutCubic,
                  child: const Icon(
                    Icons.keyboard_arrow_down_rounded,
                    color: AppThemeTokens.white,
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

class _DropdownMenuPanel extends StatelessWidget {
  const _DropdownMenuPanel({
    required this.width,
    required this.options,
    required this.selectedValue,
    required this.onSelected,
  });

  final double width;
  final List<String> options;
  final String selectedValue;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      decoration: BoxDecoration(
        color: AppThemeTokens.textPrimary,
        borderRadius: BorderRadius.circular(AppThemeTokens.radiusMd * 2),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: AppThemeTokens.space2),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: options
              .map(
                (option) => InkWell(
                  onTap: () => onSelected(option),
                  borderRadius: BorderRadius.circular(AppThemeTokens.radiusMd),
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: AppThemeTokens.space3,
                      vertical: AppThemeTokens.space2,
                    ),
                    child: Row(
                      children: [
                        Expanded(
                          child: Text(
                            option,
                            maxLines: 1,
                            softWrap: false,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.bodyLarge
                                ?.copyWith(
                                  color: AppThemeTokens.white,
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
                          const Icon(
                            Icons.check_rounded,
                            size: AppThemeTokens.iconSizeMedium,
                            color: AppThemeTokens.white,
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

class _CircleIconButton extends StatelessWidget {
  const _CircleIconButton({
    required this.icon,
    required this.onPressed,
  });

  final Widget icon;
  final VoidCallback onPressed;

  @override
  Widget build(BuildContext context) {
    return IconButton.filled(
      onPressed: onPressed,
      style: IconButton.styleFrom(
        backgroundColor: AppThemeTokens.textPrimary,
        foregroundColor: AppThemeTokens.white,
        padding: const EdgeInsets.symmetric(
          horizontal: AppThemeTokens.buttonPaddingX,
          vertical: AppThemeTokens.buttonPaddingY,
        ),
        minimumSize: Size.zero,
        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
        shape: const CircleBorder(),
      ),
      icon: icon,
    );
  }
}
