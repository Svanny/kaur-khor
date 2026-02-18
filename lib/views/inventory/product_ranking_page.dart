part of '../inventory_views.dart';

enum _ProductRankingItemType { service, sku }

class _ProductRankingEntry {
  const _ProductRankingEntry({
    required this.id,
    required this.name,
    required this.price,
    required this.type,
  });

  final String id;
  final String name;
  final double price;
  final _ProductRankingItemType type;
}

class ProductRankingPage extends StatefulWidget {
  const ProductRankingPage({super.key, this.initialBottomMessage});

  final String? initialBottomMessage;

  @override
  State<ProductRankingPage> createState() => _ProductRankingPageState();
}

class _ProductRankingPageState extends State<ProductRankingPage> {
  static const double _rankPillWidth = 40;
  static const double _rankGap = AppThemeTokens.cardInlineGap;
  static const double _rowHandleSize =
      AppThemeTokens.fontSizeBodyLarge + AppThemeTokens.space1;
  static const double _rowHandleGap = AppThemeTokens.cardInlineGap;
  static const double _rowDividerGap = AppThemeTokens.cardInlineGap;
  static const double _rowDividerHeight = AppThemeTokens.iconSizeMedium;
  static const double _amountColumnWidth = 84;
  static const double _currencyColumnWidth = 52;
  static const double _priceColumnsGap = 2;
  static const double _priceAreaWidth =
      _amountColumnWidth + _priceColumnsGap + _currencyColumnWidth;
  static const double _rowHeight = 56;
  static const double _rowExtent =
      _rowHeight + AppThemeTokens.sectionGapCompact;
  static const Duration _resetTextFadeDuration = Duration(milliseconds: 180);

  bool _initialized = false;
  bool _didShowInitialBottomMessage = false;
  bool _allowPop = false;
  double _rowTextOpacity = 1;
  bool _resetAnimationInProgress = false;
  final ScrollController _listScrollController = ScrollController();
  late List<_ProductRankingEntry> _initialEntries;
  late List<_ProductRankingEntry> _entries;

  bool get _hasChanges {
    if (_entries.length != _initialEntries.length) {
      return true;
    }
    for (var i = 0; i < _entries.length; i += 1) {
      if (_entries[i].id != _initialEntries[i].id) {
        return true;
      }
    }
    return false;
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialized) {
      return;
    }
    final inventory = context.inventoryController.value;
    _initialEntries = [
      for (final service in inventory.services)
        _ProductRankingEntry(
          id: 'service:${service.id}',
          name: service.name,
          price: service.price,
          type: _ProductRankingItemType.service,
        ),
      for (final sku in inventory.skus)
        if (sku.soldAsProduct && sku.productPrice != null)
          _ProductRankingEntry(
            id: 'sku:${sku.id}',
            name: sku.name,
            price: sku.productPrice!,
            type: _ProductRankingItemType.sku,
          ),
    ];
    _entries = List<_ProductRankingEntry>.of(_initialEntries);
    _initialized = true;
    _showInitialBottomMessageIfAny();
  }

  @override
  void dispose() {
    _listScrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final edge = AppThemeTokens.screenEdgePadding(context);
    final currencyCode = context.currencyController.value.code;
    return PopScope<void>(
      canPop: _allowPop || !_hasChanges,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop || !_hasChanges) {
          return;
        }
        unawaited(_onBackPressed());
      },
      child: Scaffold(
        body: Padding(
          padding: EdgeInsets.fromLTRB(edge.left, edge.top, edge.right, 0),
          child: Column(
            children: [
              buildSaveChangeHeader(
                title: '',
                onBack: _onBackPressed,
                onCancel: _resetChanges,
                onSave: _onSavePressed,
                hasChanges: true,
                isValid: true,
                cancelIcon: Icons.refresh,
                cancelTooltip: 'Reset order',
                flipCancelIconHorizontally: true,
              ),
              const SizedBox(height: AppThemeTokens.headerToContentGap),
              Text(
                'Sales Ranking Update',
                key: const ValueKey('product-ranking-title'),
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                  fontWeight: _fontWeight(AppThemeTokens.fontWeightBold),
                  fontSize: AppThemeTokens.fontSizeTitleLarge,
                ),
              ),
              const SizedBox(height: AppThemeTokens.sectionGap),
              Row(
                children: [
                  SizedBox(
                    width: _rankPillWidth,
                    height: _rankPillWidth,
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        color: AppThemeTokens.surface,
                        borderRadius: BorderRadius.circular(
                          AppThemeTokens.radiusMd,
                        ),
                        border: Border.all(color: AppThemeTokens.border),
                      ),
                      child: Center(
                        child: _inventorySvgIcon(
                          key: const ValueKey(
                            'product-ranking-leaderboard-icon',
                          ),
                          assetPath: _leaderboardSvgAsset,
                          size: AppThemeTokens.iconSizeMedium,
                          color: AppThemeTokens.textPrimary,
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: _rankGap),
                  Expanded(child: _buildTableHeader(context)),
                ],
              ),
              const SizedBox(height: AppThemeTokens.sectionGapCompact),
              Expanded(
                child: LayoutBuilder(
                  builder: (context, constraints) {
                    return Stack(
                      children: [
                        Positioned(
                          top: 0,
                          bottom: 0,
                          left: 0,
                          width: _rankPillWidth,
                          child: IgnorePointer(
                            child: _buildRankPillsOverlay(
                              context: context,
                              viewportHeight: constraints.maxHeight,
                            ),
                          ),
                        ),
                        Positioned.fill(
                          left: _rankPillWidth + _rankGap,
                          child: ReorderableListView.builder(
                            key: const ValueKey('product-ranking-list'),
                            scrollController: _listScrollController,
                            buildDefaultDragHandles: false,
                            proxyDecorator: (child, _, __) => child,
                            padding: EdgeInsets.only(
                              bottom:
                                  MediaQuery.viewPaddingOf(context).bottom +
                                  AppThemeTokens.scrollBottomReservePrimary,
                            ),
                            itemCount: _entries.length,
                            onReorder: _onReorder,
                            itemBuilder: (context, index) {
                              final entry = _entries[index];
                              return SizedBox(
                                key: ValueKey(
                                  'product-ranking-row-${entry.id}',
                                ),
                                height: _rowExtent,
                                child: Align(
                                  alignment: Alignment.topCenter,
                                  child: _buildRow(
                                    context: context,
                                    index: index,
                                    entry: entry,
                                    currencyCode: currencyCode,
                                  ),
                                ),
                              );
                            },
                          ),
                        ),
                      ],
                    );
                  },
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildTableHeader(BuildContext context) {
    final headerStyle = Theme.of(context).textTheme.bodyLarge?.copyWith(
      fontWeight: _fontWeight(AppThemeTokens.fontWeightSemibold),
    );
    final labelFontSize =
        headerStyle?.fontSize ?? AppThemeTokens.fontSizeBodyLarge;
    final headerIconSize = AppThemeTokens.attachedLabelIconSize(labelFontSize);
    final headerIconGap = AppThemeTokens.attachedLabelIconGap(headerIconSize);
    return Container(
      key: const ValueKey('product-ranking-table-header'),
      decoration: BoxDecoration(
        color: AppThemeTokens.accentLighter,
        borderRadius: BorderRadius.circular(AppThemeTokens.radiusMd),
        border: Border.all(color: AppThemeTokens.border),
      ),
      padding: const EdgeInsets.symmetric(
        horizontal: AppThemeTokens.cardInset,
        vertical: AppThemeTokens.sectionCardInset,
      ),
      child: Row(
        children: [
          Expanded(
            key: const ValueKey('product-ranking-name-header-column'),
            child: Center(
              child: Row(
                key: const ValueKey('product-ranking-name-header-group'),
                mainAxisSize: MainAxisSize.min,
                children: [
                  _inventorySvgIcon(
                    key: const ValueKey('product-ranking-header-name-icon'),
                    assetPath: _labelSvgAsset,
                    size: headerIconSize,
                    color: AppThemeTokens.textPrimary,
                  ),
                  SizedBox(width: headerIconGap),
                  Text('Name', style: headerStyle),
                ],
              ),
            ),
          ),
          const SizedBox(width: _rowDividerGap),
          Container(
            key: const ValueKey('product-ranking-header-divider'),
            width: AppThemeTokens.dividerThickness,
            height: _rowDividerHeight,
            color: AppThemeTokens.textPrimary.withValues(alpha: 0.28),
          ),
          const SizedBox(width: _rowDividerGap),
          SizedBox(
            key: const ValueKey('product-ranking-price-header-column'),
            width: _priceAreaWidth,
            child: Center(
              child: Row(
                key: const ValueKey('product-ranking-price-header-group'),
                mainAxisSize: MainAxisSize.min,
                children: [
                  _inventorySvgIcon(
                    key: const ValueKey('product-ranking-header-price-icon'),
                    assetPath: _pointOfSaleSvgAsset,
                    size: headerIconSize,
                    color: AppThemeTokens.textPrimary,
                  ),
                  SizedBox(width: headerIconGap),
                  Text(
                    'Price',
                    textAlign: TextAlign.center,
                    style: headerStyle,
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildRow({
    required BuildContext context,
    required int index,
    required _ProductRankingEntry entry,
    required String currencyCode,
  }) {
    return ReorderableDragStartListener(
      key: ValueKey('product-ranking-draggable-${entry.id}'),
      index: index,
      child: SizedBox(
        height: _rowHeight,
        child: Card(
          margin: EdgeInsets.zero,
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppThemeTokens.cardInset,
              vertical: AppThemeTokens.sectionCardInset,
            ),
            child: Row(
              children: [
                _inventorySvgIcon(
                  key: ValueKey('product-ranking-drag-icon-${entry.id}'),
                  assetPath: _dragIndicatorSvgAsset,
                  size: _rowHandleSize,
                  color: AppThemeTokens.primary,
                ),
                const SizedBox(width: _rowHandleGap),
                Expanded(
                  child: AnimatedOpacity(
                    key: ValueKey('product-ranking-text-fade-name-${entry.id}'),
                    opacity: _rowTextOpacity,
                    duration: _resetTextFadeDuration,
                    curve: Curves.easeInOutCubic,
                    child: Text(
                      entry.name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                        fontWeight: _fontWeight(AppThemeTokens.fontWeightBold),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: _rowDividerGap),
                Container(
                  key: ValueKey('product-ranking-row-divider-${entry.id}'),
                  width: AppThemeTokens.dividerThickness,
                  height: _rowDividerHeight,
                  color: AppThemeTokens.textPrimary.withValues(alpha: 0.28),
                ),
                const SizedBox(width: _rowDividerGap),
                SizedBox(
                  key: ValueKey('product-ranking-price-column-${entry.id}'),
                  width: _priceAreaWidth,
                  child: Row(
                    children: [
                      SizedBox(
                        key: ValueKey(
                          'product-ranking-amount-column-${entry.id}',
                        ),
                        width: _amountColumnWidth,
                        child: AnimatedOpacity(
                          key: ValueKey(
                            'product-ranking-text-fade-amount-${entry.id}',
                          ),
                          opacity: _rowTextOpacity,
                          duration: _resetTextFadeDuration,
                          curve: Curves.easeInOutCubic,
                          child: Text(
                            _groupedAmountLabel(entry.price),
                            key: ValueKey('product-ranking-price-${entry.id}'),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            textAlign: TextAlign.right,
                            style: Theme.of(context).textTheme.bodyLarge
                                ?.copyWith(
                                  fontWeight: _fontWeight(
                                    AppThemeTokens.fontWeightMedium,
                                  ),
                                ),
                          ),
                        ),
                      ),
                      const SizedBox(width: _priceColumnsGap),
                      SizedBox(
                        key: ValueKey(
                          'product-ranking-currency-column-${entry.id}',
                        ),
                        width: _currencyColumnWidth,
                        child: AnimatedOpacity(
                          key: ValueKey(
                            'product-ranking-text-fade-currency-${entry.id}',
                          ),
                          opacity: _rowTextOpacity,
                          duration: _resetTextFadeDuration,
                          curve: Curves.easeInOutCubic,
                          child: Text(
                            currencyCode,
                            key: ValueKey(
                              'product-ranking-price-currency-${entry.id}',
                            ),
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            textAlign: TextAlign.right,
                            style: Theme.of(context).textTheme.bodyLarge
                                ?.copyWith(
                                  fontWeight: _fontWeight(
                                    AppThemeTokens.fontWeightMedium,
                                  ),
                                ),
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

  Widget _buildRankPillsOverlay({
    required BuildContext context,
    required double viewportHeight,
  }) {
    return AnimatedBuilder(
      animation: _listScrollController,
      builder: (_, __) {
        final offset = _listScrollController.hasClients
            ? _listScrollController.offset
            : 0.0;
        final bottomPadding =
            MediaQuery.viewPaddingOf(context).bottom +
            AppThemeTokens.scrollBottomReservePrimary;
        final contentHeight = (_entries.length * _rowExtent) + bottomPadding;

        return ClipRect(
          child: SizedBox(
            height: viewportHeight,
            child: Transform.translate(
              offset: Offset(0, -offset),
              child: SizedBox(
                height: contentHeight,
                child: Column(
                  children: [
                    for (var i = 0; i < _entries.length; i += 1)
                      SizedBox(
                        key: ValueKey('product-ranking-rank-slot-$i'),
                        height: _rowExtent,
                        child: Align(
                          alignment: Alignment.topCenter,
                          child: Container(
                            width: _rankPillWidth,
                            height: _rowHeight,
                            decoration: BoxDecoration(
                              color: AppThemeTokens.surface,
                              borderRadius: BorderRadius.circular(
                                AppThemeTokens.radiusPill,
                              ),
                              border: Border.all(color: AppThemeTokens.border),
                            ),
                            alignment: Alignment.center,
                            child: Text(
                              '${i + 1}',
                              style: Theme.of(context).textTheme.bodyLarge
                                  ?.copyWith(
                                    fontWeight: _fontWeight(
                                      AppThemeTokens.fontWeightSemibold,
                                    ),
                                  ),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }

  void _onReorder(int oldIndex, int newIndex) {
    setState(() {
      final next = List<_ProductRankingEntry>.of(_entries);
      if (newIndex > oldIndex) {
        newIndex -= 1;
      }
      final moved = next.removeAt(oldIndex);
      next.insert(newIndex, moved);
      _entries = next;
    });
  }

  Future<void> _onBackPressed() async {
    final action = await _showSaveChangesPrompt();
    if (!mounted || action == null || action == UnsavedExitAction.goBack) {
      return;
    }
    if (action == UnsavedExitAction.confirm) {
      _save();
      return;
    }
    _popWithoutSaving(message: 'Sales ranking updates discarded.');
  }

  Future<UnsavedExitAction?> _showSaveChangesPrompt() {
    return showUnsavedChangesDialog(
      context: context,
      isValid: true,
      validationErrors: const <String>[],
    );
  }

  void _popWithoutSaving({String? message}) {
    final messenger = ScaffoldMessenger.maybeOf(Navigator.of(context).context);
    final transitionDuration = _routeExitTransitionDuration(context);
    setState(() => _allowPop = true);
    Navigator.of(context).popUntil((route) => route.isFirst);
    if (message == null || message.isEmpty) {
      return;
    }
    _scheduleBottomMessage(
      messenger: messenger,
      message: message,
      delay: transitionDuration,
    );
  }

  void _resetChanges() {
    unawaited(_animateResetWithTextFade());
  }

  Future<void> _animateResetWithTextFade() async {
    if (!_hasChanges) {
      return;
    }
    if (_resetAnimationInProgress) {
      return;
    }
    setState(() {
      _resetAnimationInProgress = true;
      _rowTextOpacity = 0;
    });
    await Future<void>.delayed(_resetTextFadeDuration);
    if (!mounted) {
      return;
    }
    setState(() {
      _entries = List<_ProductRankingEntry>.of(_initialEntries);
      _rowTextOpacity = 1;
    });
    await Future<void>.delayed(_resetTextFadeDuration);
    if (!mounted) {
      return;
    }
    setState(() => _resetAnimationInProgress = false);
  }

  void _save() {
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(
        builder: (_) => const ViewAllPage(
          initialBottomMessage: 'Sales ranking updates saved.',
        ),
      ),
    );
  }

  Future<void> _onSavePressed() async {
    final shouldSave = await _showSaveConfirmationDialog();
    if (!mounted || !shouldSave) {
      return;
    }
    _save();
  }

  Future<bool> _showSaveConfirmationDialog() async {
    final selection = await showTwoActionConfirmationDialog<bool>(
      context: context,
      barrierLabel: 'Dismiss save confirmation',
      title: 'Save ranking updates?',
      message: 'Confirm to save this sales ranking order.',
      secondaryLabel: 'Back to edit',
      primaryLabel: 'Confirm',
      secondaryResult: false,
      primaryResult: true,
      barrierDismissResult: false,
      maxWidth: 420,
      secondaryPadding: const EdgeInsets.symmetric(
        horizontal: AppThemeTokens.space1,
        vertical: AppThemeTokens.buttonPaddingY,
      ),
      primaryPadding: const EdgeInsets.symmetric(
        horizontal: AppThemeTokens.space1,
        vertical: AppThemeTokens.buttonPaddingY,
      ),
      compactSecondary: true,
      compactPrimary: true,
      contentPadding: const EdgeInsets.fromLTRB(
        AppThemeTokens.space4 + AppThemeTokens.unit,
        AppThemeTokens.popupInset,
        AppThemeTokens.space4 + AppThemeTokens.unit,
        AppThemeTokens.popupInset,
      ),
    );
    return selection ?? false;
  }

  String _groupedAmountLabel(double value) {
    final normalized = value.toStringAsFixed(2);
    final parts = normalized.split('.');
    final whole = parts.first;
    final isNegative = whole.startsWith('-');
    final digits = isNegative ? whole.substring(1) : whole;
    final grouped = digits.replaceAllMapped(
      RegExp(r'\B(?=(\d{3})+(?!\d))'),
      (_) => ',',
    );
    final prefix = isNegative ? '-' : '';
    if (parts.length == 1) {
      return '$prefix$grouped';
    }
    return '$prefix$grouped.${parts[1]}';
  }

  void _showInitialBottomMessageIfAny() {
    if (_didShowInitialBottomMessage) {
      return;
    }
    final message = widget.initialBottomMessage;
    if (message == null || message.isEmpty) {
      return;
    }
    _didShowInitialBottomMessage = true;
    _scheduleBottomMessage(
      messenger: ScaffoldMessenger.maybeOf(context),
      message: message,
      delay: _routeEnterTransitionDuration(context),
    );
  }
}
