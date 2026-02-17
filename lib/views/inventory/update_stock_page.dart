part of '../inventory_views.dart';

enum StockInputMode { changes, total }

enum IncrementPreset { small, medium, big }

extension IncrementPresetValues on IncrementPreset {
  double get countStep {
    return switch (this) {
      IncrementPreset.small => 1,
      IncrementPreset.medium => 5,
      IncrementPreset.big => 20,
    };
  }

  double get costStep {
    return switch (this) {
      IncrementPreset.small => 0.25,
      IncrementPreset.medium => 0.5,
      IncrementPreset.big => 1,
    };
  }

  String get label {
    return switch (this) {
      IncrementPreset.small => 'Small',
      IncrementPreset.medium => 'Medium',
      IncrementPreset.big => 'Big',
    };
  }

  String get description {
    return switch (this) {
      IncrementPreset.small => '±1 and ±\$0.25',
      IncrementPreset.medium => '±5 and ±\$0.50',
      IncrementPreset.big => '±20 and ±\$1.00',
    };
  }

  String get countStepLabel {
    return switch (this) {
      IncrementPreset.small => '± 1',
      IncrementPreset.medium => '± 5',
      IncrementPreset.big => '± 20',
    };
  }

  String get costStepLabel {
    return switch (this) {
      IncrementPreset.small => '± \$0.25',
      IncrementPreset.medium => '± \$0.50',
      IncrementPreset.big => '± \$1.00',
    };
  }
}

class StockDraft {
  const StockDraft({
    required this.skuId,
    required this.baseCount,
    required this.baseUnitCost,
    this.countDelta = 0,
    this.costDelta = 0,
  });

  factory StockDraft.fromSku(SkuItem sku) {
    return StockDraft(
      skuId: sku.id,
      baseCount: sku.unitsInStock,
      baseUnitCost: sku.costPerUnit,
    );
  }

  final String skuId;
  final double baseCount;
  final double baseUnitCost;
  final double countDelta;
  final double costDelta;

  double get effectiveCount => math.max(0.0, baseCount + countDelta);
  double get effectiveUnitCost => math.max(0.0, baseUnitCost + costDelta);
  double get effectiveTotalValue => effectiveCount * effectiveUnitCost;

  StockDraft copyWith({
    double? countDelta,
    double? costDelta,
    double? baseCount,
    double? baseUnitCost,
  }) {
    return StockDraft(
      skuId: skuId,
      baseCount: baseCount ?? this.baseCount,
      baseUnitCost: baseUnitCost ?? this.baseUnitCost,
      countDelta: countDelta ?? this.countDelta,
      costDelta: costDelta ?? this.costDelta,
    );
  }

  StockDraft reset() => copyWith(countDelta: 0, costDelta: 0);

  StockDraft adjustCount({
    required StockInputMode mode,
    required bool increment,
    required double step,
  }) {
    final direction = increment ? 1 : -1;
    if (mode == StockInputMode.changes) {
      return copyWith(countDelta: countDelta + (direction * step));
    }
    final nextTotal = math.max(0.0, effectiveCount + (direction * step));
    return copyWith(countDelta: nextTotal - baseCount);
  }

  StockDraft adjustUnitCost({
    required StockInputMode mode,
    required bool increment,
    required double step,
  }) {
    final direction = increment ? 1 : -1;
    if (mode == StockInputMode.changes) {
      return copyWith(costDelta: costDelta + (direction * step));
    }
    final nextTotal = math.max(0.0, effectiveUnitCost + (direction * step));
    return copyWith(costDelta: nextTotal - baseUnitCost);
  }

  SkuItem applyToSku(SkuItem sku) {
    return sku.copyWith(
      unitsInStock: effectiveCount,
      costPerUnit: effectiveUnitCost,
    );
  }
}

class UpdateStockPage extends StatefulWidget {
  const UpdateStockPage({super.key});

  @override
  State<UpdateStockPage> createState() => _UpdateStockPageState();
}

class _UpdateStockPageState extends State<UpdateStockPage> {
  static const double _swipeVelocityThreshold = 220;
  static const Duration _switcherDuration = Duration(milliseconds: 220);
  static const String _costInputDisabledTooltip =
      'Cannot enter cost if change is negative.';

  bool _initialized = false;
  late InventoryController _inventoryController;
  late List<SkuItem> _sourceSkus;
  late List<StockDraft> _drafts;

  StockInputMode _mode = StockInputMode.changes;
  IncrementPreset _preset = IncrementPreset.small;
  int _selectedSkuIndex = 0;
  bool _showConfirmationCard = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_initialized) {
      return;
    }
    _inventoryController = context.inventoryController;
    _sourceSkus = _inventoryController.value.skus;
    _drafts = _sourceSkus.map(StockDraft.fromSku).toList(growable: false);
    _initialized = true;
  }

  @override
  Widget build(BuildContext context) {
    final edge = AppThemeTokens.screenEdgePadding(context);
    final currencyCode = context.currencyController.value.code;

    return Scaffold(
      body: Padding(
        padding: EdgeInsets.fromLTRB(
          edge.left,
          edge.top,
          edge.right,
          edge.bottom,
        ),
        child: _sourceSkus.isEmpty
            ? _buildEmptyState()
            : Column(
                children: [
                  _buildHeader(),
                  const SizedBox(height: AppThemeTokens.headerToContentGap),
                  Text(
                    "SKU's Stock Count Update",
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      fontWeight: _fontWeight(AppThemeTokens.fontWeightBold),
                    ),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: AppThemeTokens.sectionGap),
                  Expanded(
                    child: GestureDetector(
                      onVerticalDragEnd: _onVerticalDragEnd,
                      child: Stack(
                        children: [
                          Positioned.fill(
                            child: Align(
                              alignment: Alignment.topCenter,
                              child: FractionallySizedBox(
                                widthFactor:
                                    AppThemeTokens.stockCardViewportWidthFactor,
                                heightFactor: AppThemeTokens
                                    .stockCardViewportHeightFactor,
                                child: AnimatedSwitcher(
                                  duration: _switcherDuration,
                                  switchInCurve: Curves.easeOutCubic,
                                  switchOutCurve: Curves.easeInCubic,
                                  child: _showConfirmationCard
                                      ? _buildConfirmationCard(
                                          key: const ValueKey(
                                            'update-stock-confirmation-card',
                                          ),
                                        )
                                      : _buildSkuCard(
                                          key: ValueKey(
                                            'update-stock-sku-card-$_selectedSkuIndex',
                                          ),
                                          sku: _sourceSkus[_selectedSkuIndex],
                                          draft: _drafts[_selectedSkuIndex],
                                          currencyCode: currencyCode,
                                        ),
                                ),
                              ),
                            ),
                          ),
                          Positioned(
                            right: AppThemeTokens.stockIndicatorRightInset,
                            top: 0,
                            bottom: 0,
                            child: IgnorePointer(child: _buildSkuIndicator()),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: AppThemeTokens.sectionGapLarge),
                  _buildIncrementSelector(),
                ],
              ),
      ),
    );
  }

  Widget _buildEmptyState() {
    return Column(
      children: [
        _buildHeader(),
        const SizedBox(height: AppThemeTokens.headerToContentGap),
        Expanded(
          child: Center(
            child: Text(
              'No SKUs available to update.',
              style: Theme.of(context).textTheme.bodyLarge,
            ),
          ),
        ),
      ],
    );
  }

  Widget _buildHeader() {
    return Row(
      children: [
        IconButton(
          key: const ValueKey('update-stock-back'),
          onPressed: () => Navigator.of(context).pop(),
          icon: const Icon(Icons.arrow_back),
        ),
        const Spacer(),
        _ChangesTotalToggle(
          value: _mode,
          onChanged: (mode) => setState(() => _mode = mode),
        ),
      ],
    );
  }

  Widget _buildSkuCard({
    required Key key,
    required SkuItem sku,
    required StockDraft draft,
    required String currencyCode,
  }) {
    final isCostInputDisabled = _isCostInputDisabled(draft);

    return Card(
      key: key,
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(AppThemeTokens.stockCardInset),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Expanded(
              child: Container(
                decoration: BoxDecoration(
                  color: AppThemeTokens.accentDarker,
                  borderRadius: BorderRadius.circular(AppThemeTokens.radiusMd),
                ),
                child: Center(
                  child: _ItemPictureGlyph(
                    sku.itemPictureIcon,
                    fill: true,
                    color: AppThemeTokens.white,
                  ),
                ),
              ),
            ),
            const SizedBox(height: AppThemeTokens.sectionGap),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  sku.name,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: _fontWeight(AppThemeTokens.fontWeightBold),
                  ),
                ),
                IconButton(
                  key: const ValueKey('update-stock-reset-current'),
                  tooltip: 'Reset changes',
                  onPressed: _resetCurrentDraft,
                  icon: const Icon(Icons.restart_alt),
                ),
              ],
            ),
            Text(
              _currencyLabel(
                draft.effectiveTotalValue,
                currencyCode: currencyCode,
              ),
              key: const ValueKey('update-stock-total-value'),
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: AppThemeTokens.sectionGap),
            _StockStepper(
              label: 'Count',
              valueKey: const ValueKey('update-stock-count-value'),
              valueContainerKey: const ValueKey(
                'update-stock-count-value-pill',
              ),
              decrementKey: const ValueKey('update-stock-count-decrement'),
              incrementKey: const ValueKey('update-stock-count-increment'),
              value: _mode == StockInputMode.changes
                  ? _signedNumber(draft.countDelta)
                  : _formatNumber(draft.effectiveCount),
              onDecrement: () => _updateCurrentDraft(
                (item) => item.adjustCount(
                  mode: _mode,
                  increment: false,
                  step: _preset.countStep,
                ),
              ),
              onIncrement: () => _updateCurrentDraft(
                (item) => item.adjustCount(
                  mode: _mode,
                  increment: true,
                  step: _preset.countStep,
                ),
              ),
            ),
            const SizedBox(height: AppThemeTokens.sectionGapCompact),
            _StockStepper(
              label: 'Cost',
              valueKey: const ValueKey('update-stock-cost-value'),
              valueContainerKey: const ValueKey('update-stock-cost-value-pill'),
              decrementKey: const ValueKey('update-stock-cost-decrement'),
              incrementKey: const ValueKey('update-stock-cost-increment'),
              actionsEnabled: !isCostInputDisabled,
              disabledTooltip: isCostInputDisabled
                  ? _costInputDisabledTooltip
                  : null,
              value: _mode == StockInputMode.changes
                  ? _unsignedCostLabel(
                      draft.costDelta,
                      currencyCode: currencyCode,
                    )
                  : _currencyLabel(
                      draft.effectiveUnitCost,
                      currencyCode: currencyCode,
                    ),
              onDecrement: () => _updateCurrentDraft(
                (item) => item.adjustUnitCost(
                  mode: _mode,
                  increment: false,
                  step: _preset.costStep,
                ),
              ),
              onIncrement: () => _updateCurrentDraft(
                (item) => item.adjustUnitCost(
                  mode: _mode,
                  increment: true,
                  step: _preset.costStep,
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  bool _isCostInputDisabled(StockDraft draft) {
    final isNegativeChangeInChangesMode =
        _mode == StockInputMode.changes && draft.countDelta < 0;
    final isCurrentTotalBelowPreviousTotal =
        draft.effectiveCount < draft.baseCount;
    return isNegativeChangeInChangesMode || isCurrentTotalBelowPreviousTotal;
  }

  Widget _buildConfirmationCard({required Key key}) {
    final changedCount = _drafts
        .where((draft) => draft.countDelta != 0 || draft.costDelta != 0)
        .length;

    return Card(
      key: key,
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(AppThemeTokens.stockCardInset),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(
              'Confirm Updates',
              style: Theme.of(context).textTheme.titleMedium?.copyWith(
                fontWeight: _fontWeight(AppThemeTokens.fontWeightBold),
              ),
            ),
            const SizedBox(height: AppThemeTokens.sectionGapCompact),
            Text(
              '$changedCount SKU(s) changed',
              style: Theme.of(context).textTheme.bodyLarge,
            ),
            const SizedBox(height: AppThemeTokens.sectionGapLarge),
            OutlinedButton(
              key: const ValueKey('update-stock-back-to-edit'),
              onPressed: () => setState(() => _showConfirmationCard = false),
              child: const Text('Back to Edit'),
            ),
            const SizedBox(height: AppThemeTokens.sectionGapCompact),
            FilledButton(
              key: const ValueKey('update-stock-save-all'),
              onPressed: _saveAllAndOpenViewAll,
              child: const Text('Save All'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildSkuIndicator() {
    return Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: List.generate(_sourceSkus.length * 2 - 1, (index) {
        if (index.isOdd) {
          return const SizedBox(height: AppThemeTokens.stockIndicatorGap);
        }
        final pillIndex = index ~/ 2;
        final isActive = pillIndex == _selectedSkuIndex;
        return AnimatedContainer(
          key: ValueKey(
            'update-stock-indicator-$pillIndex-${isActive ? 'active' : 'inactive'}',
          ),
          duration: _switcherDuration,
          width: AppThemeTokens.stockIndicatorWidth,
          height: AppThemeTokens.stockIndicatorHeight,
          decoration: BoxDecoration(
            color: isActive
                ? AppThemeTokens.textPrimary
                : AppThemeTokens.accentDarker,
            borderRadius: BorderRadius.circular(AppThemeTokens.radiusPill),
          ),
        );
      }),
    );
  }

  Widget _buildIncrementSelector() {
    return AppDropdownPill<IncrementPreset>(
      key: const ValueKey('update-stock-increment-dropdown'),
      triggerKey: const ValueKey('update-stock-increment-toggle'),
      menuKey: const ValueKey('update-stock-increment-options'),
      value: _preset,
      options: IncrementPreset.values,
      minMenuWidth: AppThemeTokens.unit * 60,
      maxMenuWidth: AppThemeTokens.unit * 100,
      labelBuilder: (preset) =>
          '${preset.label} ${preset.countStepLabel} and ${preset.costStepLabel}',
      menuXAlignment: AppDropdownXAlignment.center,
      menuYAlignment: AppDropdownYAlignment.top,
      onChanged: (preset) => setState(() => _preset = preset),
      menuBuilder:
          (
            context,
            width,
            options,
            selectedValue,
            onSelected,
            backgroundColor,
            foregroundColor,
          ) {
            final dividerColor = foregroundColor.withValues(alpha: 0.28);
            final activeRow = foregroundColor.withValues(alpha: 0.16);
            final cellTextStyle =
                Theme.of(context).textTheme.bodyLarge?.copyWith(
                  color: foregroundColor,
                  fontWeight: _fontWeight(AppThemeTokens.fontWeightSemibold),
                ) ??
                const TextStyle(
                  fontSize: AppThemeTokens.fontSizeBodyLarge,
                  fontWeight: FontWeight.w600,
                );
            final columnMinimums = _incrementColumnMinimums(
              context: context,
              options: options,
              textStyle: cellTextStyle,
            );
            final resolvedColumnWidths = _resolveIncrementColumnWidths(
              minimums: columnMinimums,
              availableWidth: width,
              growthWeights: const [1, 1, 0, 1],
            );
            final separatorColumnCenterX =
                resolvedColumnWidths[0] +
                resolvedColumnWidths[1] +
                (resolvedColumnWidths[2] / 2);
            return Container(
              width: width,
              decoration: BoxDecoration(
                color: backgroundColor,
                borderRadius: BorderRadius.circular(
                  AppThemeTokens.radiusMd * 2,
                ),
                border: Border.all(color: dividerColor),
              ),
              child: ClipRRect(
                borderRadius: BorderRadius.circular(
                  AppThemeTokens.radiusMd * 2,
                ),
                child: CustomPaint(
                  foregroundPainter: _IncrementSeparatorPainter(
                    color: foregroundColor,
                    xOffset: separatorColumnCenterX,
                  ),
                  child: Table(
                    defaultVerticalAlignment: TableCellVerticalAlignment.middle,
                    columnWidths: <int, TableColumnWidth>{
                      for (var i = 0; i < resolvedColumnWidths.length; i += 1)
                        i: FixedColumnWidth(resolvedColumnWidths[i]),
                    },
                    children: options
                        .map((preset) {
                          final isSelected = preset == selectedValue;
                          return TableRow(
                            decoration: BoxDecoration(
                              color: isSelected
                                  ? activeRow
                                  : Colors.transparent,
                            ),
                            children: [
                              _IncrementMenuCell(
                                key: ValueKey(
                                  'update-stock-increment-row-${preset.name}',
                                ),
                                text: '${preset.label}:',
                                textColor: foregroundColor,
                                onTap: () => onSelected(preset),
                              ),
                              _IncrementMenuCell(
                                text: preset.countStepLabel,
                                textAlign: TextAlign.center,
                                textColor: foregroundColor,
                                onTap: () => onSelected(preset),
                              ),
                              _IncrementMenuCell(
                                key: ValueKey(
                                  'update-stock-increment-separator-${preset.name}',
                                ),
                                text: '',
                                textAlign: TextAlign.center,
                                textColor: foregroundColor,
                                onTap: () => onSelected(preset),
                              ),
                              _IncrementMenuCell(
                                text: preset.costStepLabel,
                                textAlign: TextAlign.center,
                                textColor: foregroundColor,
                                showCheck: isSelected,
                                reserveCheckSpace: true,
                                onTap: () => onSelected(preset),
                              ),
                            ],
                          );
                        })
                        .toList(growable: false),
                  ),
                ),
              ),
            );
          },
      triggerBuilder: (context, isOpen, _) {
        return Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(
              Icons.swap_vert_rounded,
              size: AppThemeTokens.iconSizeMedium,
              color: AppThemeTokens.white,
            ),
            const SizedBox(width: AppThemeTokens.dropdownToggleIconGap),
            Text(
              'Increments \u00B7 ${_preset.label}',
              style: Theme.of(
                context,
              ).textTheme.bodyLarge?.copyWith(color: AppThemeTokens.white),
            ),
            const SizedBox(width: AppThemeTokens.dropdownToggleIconGap),
            AnimatedRotation(
              turns: isOpen ? 0.5 : 0,
              duration: const Duration(milliseconds: 180),
              curve: Curves.easeOutCubic,
              child: const Icon(
                Icons.keyboard_arrow_down_rounded,
                color: AppThemeTokens.white,
              ),
            ),
          ],
        );
      },
    );
  }

  List<double> _incrementColumnMinimums({
    required BuildContext context,
    required List<IncrementPreset> options,
    required TextStyle textStyle,
  }) {
    final textScaler = MediaQuery.textScalerOf(context);
    final textDirection = Directionality.of(context);

    double maxTextWidth(String Function(IncrementPreset option) labelFor) {
      var maxWidth = 0.0;
      for (final option in options) {
        maxWidth = math.max(
          maxWidth,
          _measureTextWidth(
            text: labelFor(option),
            textStyle: textStyle,
            textScaler: textScaler,
            textDirection: textDirection,
          ),
        );
      }
      return maxWidth;
    }

    const cellHorizontalPadding = AppThemeTokens.space2 * 2;
    const checkAreaWidth =
        AppThemeTokens.space1 + (AppThemeTokens.iconSizeMedium * 0.75);

    return <double>[
      maxTextWidth((preset) => '${preset.label}:') + cellHorizontalPadding,
      maxTextWidth((preset) => preset.countStepLabel) + cellHorizontalPadding,
      cellHorizontalPadding + AppThemeTokens.dividerThickness,
      maxTextWidth((preset) => preset.costStepLabel) +
          cellHorizontalPadding +
          checkAreaWidth,
    ];
  }

  List<double> _resolveIncrementColumnWidths({
    required List<double> minimums,
    required double availableWidth,
    required List<double> growthWeights,
  }) {
    if (minimums.isEmpty) return const <double>[];

    final safeAvailable = math.max(0, availableWidth);
    final totalMinimum = minimums.reduce((sum, width) => sum + width);

    if (totalMinimum <= safeAvailable) {
      final extra = safeAvailable - totalMinimum;
      final totalWeight = growthWeights.fold(0.0, (sum, w) => sum + w);
      if (extra <= 0 || totalWeight <= 0) {
        return List<double>.of(minimums, growable: false);
      }
      return List<double>.generate(
        minimums.length,
        (index) =>
            minimums[index] + (extra * (growthWeights[index] / totalWeight)),
        growable: false,
      );
    }

    final scale = safeAvailable / totalMinimum;
    return minimums.map((width) => width * scale).toList(growable: false);
  }

  double _measureTextWidth({
    required String text,
    required TextStyle textStyle,
    required TextScaler textScaler,
    required TextDirection textDirection,
  }) {
    final textPainter = TextPainter(
      text: TextSpan(text: text, style: textStyle),
      textDirection: textDirection,
      maxLines: 1,
      textScaler: textScaler,
    )..layout();
    return textPainter.width;
  }

  void _onVerticalDragEnd(DragEndDetails details) {
    final velocity = details.primaryVelocity ?? 0;
    if (velocity > _swipeVelocityThreshold) {
      _onSwipeDown();
    } else if (velocity < -_swipeVelocityThreshold) {
      _onSwipeUp();
    }
  }

  void _onSwipeDown() {
    setState(() {
      if (_showConfirmationCard) {
        return;
      }
      if (_selectedSkuIndex < _sourceSkus.length - 1) {
        _selectedSkuIndex += 1;
        return;
      }
      _showConfirmationCard = true;
    });
  }

  void _onSwipeUp() {
    setState(() {
      if (_showConfirmationCard) {
        _showConfirmationCard = false;
        return;
      }
      if (_selectedSkuIndex > 0) {
        _selectedSkuIndex -= 1;
      }
    });
  }

  void _resetCurrentDraft() {
    _updateCurrentDraft((draft) => draft.reset());
  }

  void _updateCurrentDraft(StockDraft Function(StockDraft) updater) {
    final nextDrafts = List<StockDraft>.of(_drafts);
    nextDrafts[_selectedSkuIndex] = updater(nextDrafts[_selectedSkuIndex]);
    setState(() => _drafts = nextDrafts);
  }

  void _saveAllAndOpenViewAll() {
    final updatedSkus = <SkuItem>[
      for (var i = 0; i < _sourceSkus.length; i += 1)
        _drafts[i].applyToSku(_sourceSkus[i]),
    ];
    _inventoryController.applySkuStockUpdates(updatedSkus);
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(const SnackBar(content: Text('Stock updates saved.')));
    Navigator.of(
      context,
    ).pushReplacement(MaterialPageRoute(builder: (_) => const ViewAllPage()));
  }
}

class _ChangesTotalToggle extends StatelessWidget {
  const _ChangesTotalToggle({required this.value, required this.onChanged});

  final StockInputMode value;
  final ValueChanged<StockInputMode> onChanged;

  @override
  Widget build(BuildContext context) {
    return _SlidingTogglePill(
      options: const ['Changes', 'Total'],
      selectedIndex: value == StockInputMode.total ? 1 : 0,
      onChanged: (index) =>
          onChanged(index == 1 ? StockInputMode.total : StockInputMode.changes),
      contentDrivenWidth: true,
    );
  }
}

class _IncrementMenuCell extends StatelessWidget {
  const _IncrementMenuCell({
    required this.text,
    required this.textColor,
    required this.onTap,
    this.textAlign = TextAlign.left,
    this.showCheck = false,
    this.reserveCheckSpace = false,
    super.key,
  });

  final String text;
  final Color textColor;
  final VoidCallback onTap;
  final TextAlign textAlign;
  final bool showCheck;
  final bool reserveCheckSpace;

  @override
  Widget build(BuildContext context) {
    const checkIconWidth = AppThemeTokens.iconSizeMedium * 0.75;
    const checkSpacing = AppThemeTokens.space1;
    final trailingReserve = reserveCheckSpace || showCheck
        ? (checkSpacing + checkIconWidth)
        : 0.0;
    final textAlignment = switch (textAlign) {
      TextAlign.center => Alignment.center,
      TextAlign.right || TextAlign.end => Alignment.centerRight,
      _ => Alignment.centerLeft,
    };

    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppThemeTokens.space2,
          vertical: AppThemeTokens.dropdownOptionPadY,
        ),
        child: Stack(
          fit: StackFit.passthrough,
          children: [
            Padding(
              padding: EdgeInsets.only(right: trailingReserve),
              child: Align(
                alignment: textAlignment,
                child: Text(
                  text,
                  maxLines: 1,
                  softWrap: false,
                  overflow: TextOverflow.ellipsis,
                  textAlign: textAlign,
                  style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                    color: textColor,
                    fontWeight: _fontWeight(AppThemeTokens.fontWeightSemibold),
                  ),
                ),
              ),
            ),
            if (showCheck)
              Align(
                alignment: Alignment.centerRight,
                child: Icon(
                  Icons.check_rounded,
                  size: checkIconWidth,
                  color: textColor,
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _IncrementSeparatorPainter extends CustomPainter {
  const _IncrementSeparatorPainter({
    required this.color,
    required this.xOffset,
  });

  final Color color;
  final double xOffset;

  @override
  void paint(Canvas canvas, Size size) {
    final strokePaint = Paint()
      ..color = color
      ..strokeWidth = AppThemeTokens.dividerThickness
      ..style = PaintingStyle.stroke;
    final lineX = xOffset.clamp(0, size.width).toDouble();
    const verticalInset = AppThemeTokens.dropdownPanelInsetY;
    const startY = verticalInset;
    final endY = size.height - verticalInset;
    if (endY <= startY) {
      return;
    }
    canvas.drawLine(Offset(lineX, startY), Offset(lineX, endY), strokePaint);
  }

  @override
  bool shouldRepaint(covariant _IncrementSeparatorPainter oldDelegate) {
    return oldDelegate.color != color || oldDelegate.xOffset != xOffset;
  }
}

class _StockStepper extends StatelessWidget {
  const _StockStepper({
    required this.label,
    required this.valueKey,
    required this.valueContainerKey,
    required this.decrementKey,
    required this.incrementKey,
    required this.value,
    required this.onDecrement,
    required this.onIncrement,
    this.actionsEnabled = true,
    this.disabledTooltip,
  });

  final String label;
  final Key valueKey;
  final Key valueContainerKey;
  final Key decrementKey;
  final Key incrementKey;
  final String value;
  final VoidCallback onDecrement;
  final VoidCallback onIncrement;
  final bool actionsEnabled;
  final String? disabledTooltip;

  @override
  Widget build(BuildContext context) {
    final track = DecoratedBox(
      decoration: BoxDecoration(
        color: AppThemeTokens.disabledBackground,
        borderRadius: BorderRadius.circular(AppThemeTokens.radiusPill),
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppThemeTokens.stockStepperTrackInset),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            _StepAction(
              key: decrementKey,
              icon: Icons.remove,
              horizontalNudge: AppThemeTokens.space1,
              isEnabled: actionsEnabled,
              onTap: onDecrement,
            ),
            const SizedBox(width: AppThemeTokens.fieldLabelToControlGap),
            Container(
              key: valueContainerKey,
              height: AppThemeTokens.stockStepActionHeight,
              constraints: const BoxConstraints(
                minWidth: AppThemeTokens.stockStepperValueMinWidth,
              ),
              padding: const EdgeInsets.symmetric(
                horizontal: AppThemeTokens.stockCounterPillPadX,
                vertical: AppThemeTokens.stockCounterPillPadY,
              ),
              decoration: BoxDecoration(
                color: actionsEnabled
                    ? AppThemeTokens.surface
                    : AppThemeTokens.disabledBackground,
                borderRadius: BorderRadius.circular(AppThemeTokens.radiusPill),
              ),
              child: Center(
                child: Text(
                  value,
                  key: valueKey,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                    color: actionsEnabled
                        ? AppThemeTokens.textPrimary
                        : AppThemeTokens.disabledForeground,
                    fontWeight: _fontWeight(AppThemeTokens.fontWeightSemibold),
                  ),
                ),
              ),
            ),
            const SizedBox(width: AppThemeTokens.fieldLabelToControlGap),
            _StepAction(
              key: incrementKey,
              icon: Icons.add,
              horizontalNudge: -AppThemeTokens.space1,
              isEnabled: actionsEnabled,
              onTap: onIncrement,
            ),
          ],
        ),
      ),
    );

    final showDisabledTooltip =
        !actionsEnabled && (disabledTooltip?.isNotEmpty ?? false);
    final trackWithTooltip = showDisabledTooltip
        ? Tooltip(
            message: disabledTooltip!,
            triggerMode: TooltipTriggerMode.tap,
            child: track,
          )
        : track;

    return Column(
      children: [
        Text(
          label,
          style: Theme.of(context).textTheme.titleMedium?.copyWith(
            fontWeight: _fontWeight(AppThemeTokens.fontWeightSemibold),
          ),
        ),
        const SizedBox(height: AppThemeTokens.fieldLabelToControlGap),
        Align(alignment: Alignment.center, child: trackWithTooltip),
      ],
    );
  }
}

class _StepAction extends StatelessWidget {
  const _StepAction({
    required this.icon,
    required this.onTap,
    this.horizontalNudge = 0,
    this.isEnabled = true,
    super.key,
  });

  final IconData icon;
  final VoidCallback onTap;
  final double horizontalNudge;
  final bool isEnabled;

  @override
  Widget build(BuildContext context) {
    final action = Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(AppThemeTokens.radiusPill),
        onTap: isEnabled ? onTap : null,
        child: SizedBox(
          height: AppThemeTokens.stockStepActionHeight,
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppThemeTokens.stockStepperActionPadX,
            ),
            child: Transform.translate(
              offset: Offset(horizontalNudge, 0),
              child: Icon(
                icon,
                size: AppThemeTokens.iconSizeMedium * 0.8,
                color: isEnabled
                    ? AppThemeTokens.textPrimary
                    : AppThemeTokens.disabledForeground,
              ),
            ),
          ),
        ),
      ),
    );

    return action;
  }
}

String _signedNumber(double value) {
  if (value > 0) {
    return '+${_formatNumber(value)}';
  }
  if (value < 0) {
    return '-${_formatNumber(value.abs())}';
  }
  return '0';
}

String _unsignedCostLabel(double value, {required String currencyCode}) {
  final magnitude = value.abs();
  final normalizedMagnitude = magnitude < 1e-9 ? 0.0 : magnitude;
  return '${_formatNumber(normalizedMagnitude)} $currencyCode';
}
