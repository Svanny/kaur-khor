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
  const ProductRankingPage({super.key});

  @override
  State<ProductRankingPage> createState() => _ProductRankingPageState();
}

class _ProductRankingPageState extends State<ProductRankingPage> {
  static const double _rankPillWidth = 40;
  static const double _rankGap = AppThemeTokens.cardInlineGap;
  static const double _priceColumnWidth = 136;
  static const double _rowHeight = 56;
  static const double _rowExtent =
      _rowHeight + AppThemeTokens.sectionGapCompact;

  bool _initialized = false;
  bool _allowPop = false;
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
                onSave: _save,
                hasChanges: _hasChanges,
                isValid: true,
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
              _buildTableHeader(context),
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
          const SizedBox(width: _rankPillWidth),
          const SizedBox(width: _rankGap),
          Expanded(
            child: Text(
              'Name',
              style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                fontWeight: _fontWeight(AppThemeTokens.fontWeightSemibold),
              ),
            ),
          ),
          SizedBox(
            width: _priceColumnWidth,
            child: Text(
              'Price',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                fontWeight: _fontWeight(AppThemeTokens.fontWeightSemibold),
              ),
            ),
          ),
          const SizedBox(width: AppThemeTokens.space8),
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
                const Icon(
                  Icons.drag_handle,
                  color: AppThemeTokens.textSecondary,
                  size:
                      AppThemeTokens.fontSizeBodyLarge + AppThemeTokens.space1,
                ),
                const SizedBox(width: AppThemeTokens.cardInlineGap),
                Expanded(
                  child: Text(
                    entry.name,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                      fontWeight: _fontWeight(AppThemeTokens.fontWeightBold),
                    ),
                  ),
                ),
                const SizedBox(width: AppThemeTokens.cardInlineGap),
                SizedBox(
                  width: _priceColumnWidth,
                  child: Text(
                    _currencyLabel(entry.price, currencyCode: currencyCode),
                    key: ValueKey('product-ranking-price-${entry.id}'),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                      fontWeight: _fontWeight(
                        entry.type == _ProductRankingItemType.service
                            ? AppThemeTokens.fontWeightSemibold
                            : AppThemeTokens.fontWeightMedium,
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
                                AppThemeTokens.radiusMd,
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
    final shouldPop = await _confirmExitIfNeeded();
    if (!mounted || !shouldPop) {
      return;
    }
    _popWithoutSaving();
  }

  Future<bool> _confirmExitIfNeeded() async {
    if (!_hasChanges) {
      return true;
    }
    final choice = await showUnsavedChangesDialog(
      context: context,
      isValid: true,
      validationErrors: const <String>[],
    );
    if (!mounted) {
      return false;
    }
    if (choice == UnsavedExitAction.confirm) {
      _save();
      return false;
    }
    return choice == UnsavedExitAction.discard;
  }

  void _popWithoutSaving() {
    setState(() => _allowPop = true);
    Navigator.of(context).pop();
  }

  void _resetChanges() {
    if (!_hasChanges) {
      return;
    }
    setState(() => _entries = List<_ProductRankingEntry>.of(_initialEntries));
  }

  void _save() {
    Navigator.of(
      context,
    ).pushReplacement(MaterialPageRoute(builder: (_) => const ViewAllPage()));
  }
}
