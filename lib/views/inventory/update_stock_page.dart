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

  static double _normalizeZero(double value) {
    return value.abs() < 1e-9 ? 0.0 : value;
  }

  static double _clampCount(double value) {
    return value.clamp(0.0, SecurityLimits.inventoryUnitsInStockMax).toDouble();
  }

  static double _clampCost(double value) {
    return value.clamp(0.0, SecurityLimits.monetaryAmountMax).toDouble();
  }

  double get effectiveCount => _clampCount(baseCount + countDelta);
  double get effectiveUnitCost => _clampCost(baseUnitCost + costDelta);
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
      final nextTotal = _clampCount(
        baseCount + countDelta + (direction * step),
      );
      return copyWith(countDelta: _normalizeZero(nextTotal - baseCount));
    }
    final nextTotal = _clampCount(effectiveCount + (direction * step));
    return copyWith(countDelta: _normalizeZero(nextTotal - baseCount));
  }

  StockDraft adjustUnitCost({
    required StockInputMode mode,
    required bool increment,
    required double step,
  }) {
    final direction = increment ? 1 : -1;
    if (mode == StockInputMode.changes) {
      final nextTotal = _clampCost(
        baseUnitCost + costDelta + (direction * step),
      );
      return copyWith(costDelta: _normalizeZero(nextTotal - baseUnitCost));
    }
    final nextTotal = _clampCost(effectiveUnitCost + (direction * step));
    return copyWith(costDelta: _normalizeZero(nextTotal - baseUnitCost));
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
  static const Duration _switcherDuration = Duration(milliseconds: 220);
  static const Duration _trendAnimationDuration = Duration(milliseconds: 180);
  static const String _costInputDisabledTooltip =
      'Cannot enter cost if change is negative.';
  static const String _costClampTooltip = 'Cost cannot go below zero';
  static const double _headerOverlayHeight = kMinInteractiveDimension;
  static const double _titleOverlayFallbackHeight = 0;
  static const bool _debugBoundaryMeasurementLogs = false;

  bool _initialized = false;
  late InventoryController _inventoryController;
  late List<SkuItem> _sourceSkus;
  late List<StockDraft> _drafts;

  StockInputMode _mode = StockInputMode.changes;
  IncrementPreset _preset = IncrementPreset.small;
  IncrementPreset _displayedPreset = IncrementPreset.small;
  Timer? _incrementLabelSwapTimer;
  int _incrementLabelSwapGeneration = 0;
  int _selectedSkuIndex = 0;
  final GlobalKey _stockUpdateTitleKey = GlobalKey();
  final GlobalKey _stockDeckKey = GlobalKey();
  bool _fogRangeMeasurementScheduled = false;
  double _fogStartOffsetFromDeckTop = 0;
  double _fogEndOffsetFromDeckTop = -AppThemeTokens.sectionGap;
  double _stockTitleOverlayHeight = _titleOverlayFallbackHeight;
  String? _lastBoundaryMeasurementDebugSignature;

  int get _confirmationCardIndex => _sourceSkus.length;
  bool get _isShowingConfirmationCard =>
      _selectedSkuIndex == _confirmationCardIndex;

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
  void dispose() {
    _incrementLabelSwapTimer?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    _scheduleFogRangeMeasurement();

    final edge = AppThemeTokens.screenEdgePadding(context);
    final currencyCode = context.currencyController.value.code;

    return Scaffold(
      body: GestureDetector(
        behavior: HitTestBehavior.translucent,
        onTap: () => FocusManager.instance.primaryFocus?.unfocus(),
        child: Padding(
          padding: EdgeInsets.fromLTRB(
            edge.left,
            edge.top,
            edge.right,
            edge.bottom,
          ),
          child: _sourceSkus.isEmpty
              ? _buildEmptyState()
              : _buildStockUpdateLayout(edge: edge, currencyCode: currencyCode),
        ),
      ),
    );
  }

  Widget _buildStockUpdateLayout({
    required EdgeInsets edge,
    required String currencyCode,
  }) {
    return Stack(
      children: [
        Column(
          children: [
            const SizedBox(height: _headerOverlayHeight),
            const SizedBox(height: AppThemeTokens.headerToContentGap),
            Expanded(
              child: Stack(
                clipBehavior: Clip.none,
                children: [
                  Padding(
                    padding: EdgeInsets.only(top: _stockTitleOverlayHeight),
                    child: Align(
                      alignment: Alignment.topCenter,
                      child: FractionallySizedBox(
                        widthFactor:
                            AppThemeTokens.stockCardViewportWidthFactor,
                        child: _buildCardDeck(currencyCode: currencyCode),
                      ),
                    ),
                  ),
                  Positioned(
                    right: -(edge.right / 2),
                    top: 0,
                    bottom: 0,
                    child: IgnorePointer(
                      child: SkuIndicatorRail(
                        trackKey: const ValueKey(
                          'update-stock-indicator-track',
                        ),
                        count: _sourceSkus.length,
                        selectedIndex: _selectedSkuIndex,
                        allActive: _isShowingConfirmationCard,
                        animationDuration: _switcherDuration,
                        densityRule: SkuIndicatorDensityRule.balanced,
                        gapScale: 0.25,
                        selectedColor: AppThemeTokens.stockIndicatorSelected,
                        unselectedColor:
                            AppThemeTokens.stockIndicatorUnselected,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
        Positioned(
          left: 0,
          right: 0,
          bottom: 0,
          child: Align(
            alignment: Alignment.center,
            child: _buildIncrementSelector(),
          ),
        ),
        Positioned(
          top: 0,
          left: 0,
          right: 0,
          child: SizedBox(height: _headerOverlayHeight, child: _buildHeader()),
        ),
        Positioned(
          top: _headerOverlayHeight + AppThemeTokens.headerToContentGap,
          left: 0,
          right: 0,
          child: Text(
            "SKUs' Stock Update",
            key: _stockUpdateTitleKey,
            style: Theme.of(context).textTheme.titleLarge?.copyWith(
              fontWeight: _fontWeight(AppThemeTokens.fontWeightBold),
            ),
            textAlign: TextAlign.center,
          ),
        ),
      ],
    );
  }

  Widget _buildCardDeck({required String currencyCode}) {
    return UpdateStockCardDeck(
      key: _stockDeckKey,
      cardsCount: _sourceSkus.length + 1,
      currentIndex: _selectedSkuIndex,
      swiperKey: const ValueKey('update-stock-card-swiper'),
      animationDuration: _switcherDuration,
      maxStackCards: 3,
      onCurrentIndexChanged: (index) =>
          setState(() => _selectedSkuIndex = index),
      onReachedEndForward: () {
        if (_selectedSkuIndex == _confirmationCardIndex) {
          return;
        }
        setState(() => _selectedSkuIndex = _confirmationCardIndex);
      },
      cardBuilder: (context, index) {
        if (index == _confirmationCardIndex) {
          return Align(
            alignment: Alignment.topCenter,
            child: Padding(
              padding: const EdgeInsets.only(top: AppThemeTokens.space4),
              child: FractionallySizedBox(
                heightFactor: AppThemeTokens.stockCardViewportHeightFactor,
                child: _buildConfirmationCard(
                  key: const ValueKey('update-stock-confirmation-card'),
                ),
              ),
            ),
          );
        }
        final keyNamespace = index == _selectedSkuIndex ? null : 'stack-$index';
        return Align(
          alignment: Alignment.topCenter,
          child: Padding(
            padding: const EdgeInsets.only(top: AppThemeTokens.space4),
            child: FractionallySizedBox(
              heightFactor: AppThemeTokens.stockCardViewportHeightFactor,
              child: _buildSkuCard(
                key: ValueKey('update-stock-sku-card-$index'),
                keyNamespace: keyNamespace,
                sku: _sourceSkus[index],
                draft: _drafts[index],
                currencyCode: currencyCode,
              ),
            ),
          ),
        );
      },
      preloadKeyPrefix: 'update-stock-preload-sku-card-',
      stackCardKeyPrefix: 'update-stock-sku-card-stack-',
      downOverlayKeyPrefix: 'update-stock-down-restore-overlay-',
      boundaryFogOffsetFromDeckTop: _fogStartOffsetFromDeckTop,
      boundaryFogEndOffsetFromDeckTop: _fogEndOffsetFromDeckTop,
    );
  }

  void _scheduleFogRangeMeasurement() {
    if (_sourceSkus.isEmpty ||
        _isShowingConfirmationCard ||
        _fogRangeMeasurementScheduled) {
      return;
    }
    _fogRangeMeasurementScheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _fogRangeMeasurementScheduled = false;
      if (!mounted || _isShowingConfirmationCard) {
        return;
      }

      final titleContext = _stockUpdateTitleKey.currentContext;
      final deckContext = _stockDeckKey.currentContext;
      if (titleContext == null || deckContext == null) {
        return;
      }

      final titleObject = titleContext.findRenderObject();
      final deckObject = deckContext.findRenderObject();
      if (titleObject is! RenderBox || deckObject is! RenderBox) {
        return;
      }

      final titleTopGlobalY = titleObject.localToGlobal(Offset.zero).dy;
      final titleBottomGlobalY = titleObject
          .localToGlobal(titleObject.size.bottomLeft(Offset.zero))
          .dy;
      final nextTitleHeight = titleObject.size.height;
      final deckTopGlobalY = deckObject.localToGlobal(Offset.zero).dy;
      final nextStart = -deckTopGlobalY;
      final nextEnd = titleBottomGlobalY - deckTopGlobalY;
      if (_debugBoundaryMeasurementLogs) {
        final signature = [
          'titleTopGlobalY=${titleTopGlobalY.toStringAsFixed(2)}',
          'titleH=${nextTitleHeight.toStringAsFixed(2)}',
          'deckTopGlobalY=${deckTopGlobalY.toStringAsFixed(2)}',
          'nextStart=${nextStart.toStringAsFixed(2)}',
          'nextEnd=${nextEnd.toStringAsFixed(2)}',
          'currStart=${_fogStartOffsetFromDeckTop.toStringAsFixed(2)}',
          'currEnd=${_fogEndOffsetFromDeckTop.toStringAsFixed(2)}',
        ].join(' | ');
        if (signature != _lastBoundaryMeasurementDebugSignature) {
          _lastBoundaryMeasurementDebugSignature = signature;
          debugPrint('[UpdateStockPage][boundary-measure] $signature');
        }
      }

      if ((nextStart - _fogStartOffsetFromDeckTop).abs() < 0.5 &&
          (nextEnd - _fogEndOffsetFromDeckTop).abs() < 0.5 &&
          (nextTitleHeight - _stockTitleOverlayHeight).abs() < 0.5) {
        return;
      }

      setState(() {
        _fogStartOffsetFromDeckTop = nextStart;
        _fogEndOffsetFromDeckTop = nextEnd;
        _stockTitleOverlayHeight = nextTitleHeight;
      });
    });
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
    required String? keyNamespace,
    required SkuItem sku,
    required StockDraft draft,
    required String currencyCode,
  }) {
    final isCostInputDisabled = _isCostInputDisabled(draft);
    final isCostDecrementClamped = _isCostDecrementClamped(draft);
    final countTrendDirection = _trendDirection(
      current: draft.effectiveCount,
      baseline: draft.baseCount,
    );
    final costTrendDirection = _trendDirection(
      current: draft.effectiveUnitCost,
      baseline: draft.baseUnitCost,
    );
    final totalTrendDirection = _trendDirection(
      current: draft.effectiveTotalValue,
      baseline: draft.baseCount * draft.baseUnitCost,
    );
    final totalValueStyle = Theme.of(context).textTheme.titleLarge;

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
            const SizedBox(height: AppThemeTokens.sectionGapCompact),
            _buildSkuTitleRow(sku.name, keyNamespace: keyNamespace),
            _CenteredTrendText(
              text: _currencyLabel(
                draft.effectiveTotalValue,
                currencyCode: currencyCode,
              ),
              textKey: _deckElementKey(
                'update-stock-total-value',
                keyNamespace: keyNamespace,
              ),
              style: totalValueStyle,
              trendDirection: totalTrendDirection,
              trendAnimationDuration: _trendAnimationDuration,
              trendKeyPrefix: _deckElementKeyPrefix(
                'update-stock-total-value-trend',
                keyNamespace: keyNamespace,
              ),
            ),
            const SizedBox(
              height: AppThemeTokens.sectionGap + AppThemeTokens.unit,
            ),
            _StockStepper(
              label: 'Count',
              labelIconAsset: _package2SvgAsset,
              keyNamespace: keyNamespace,
              labelIconKey: _deckElementKey(
                'update-stock-count-label-icon',
                keyNamespace: keyNamespace,
              ),
              valueKey: _deckElementKey(
                'update-stock-count-value',
                keyNamespace: keyNamespace,
              ),
              valueContainerKey: _deckElementKey(
                'update-stock-count-value-pill',
                keyNamespace: keyNamespace,
              ),
              decrementKey: _deckElementKey(
                'update-stock-count-decrement',
                keyNamespace: keyNamespace,
              ),
              incrementKey: _deckElementKey(
                'update-stock-count-increment',
                keyNamespace: keyNamespace,
              ),
              trendDirection: countTrendDirection,
              trendAnimationDuration: _trendAnimationDuration,
              valueEditable: true,
              value: _mode == StockInputMode.changes
                  ? _signedNumber(draft.countDelta)
                  : _formatNumber(draft.effectiveCount),
              onValueCommitted: _applyCountInput,
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
            const SizedBox(
              height:
                  AppThemeTokens.sectionGapCompact + (AppThemeTokens.unit * 2),
            ),
            _StockStepper(
              label: 'Cost',
              labelIconAsset: _paymentsSvgAsset,
              keyNamespace: keyNamespace,
              labelIconKey: _deckElementKey(
                'update-stock-cost-label-icon',
                keyNamespace: keyNamespace,
              ),
              valueKey: _deckElementKey(
                'update-stock-cost-value',
                keyNamespace: keyNamespace,
              ),
              valueContainerKey: _deckElementKey(
                'update-stock-cost-value-pill',
                keyNamespace: keyNamespace,
              ),
              decrementKey: _deckElementKey(
                'update-stock-cost-decrement',
                keyNamespace: keyNamespace,
              ),
              incrementKey: _deckElementKey(
                'update-stock-cost-increment',
                keyNamespace: keyNamespace,
              ),
              trendDirection: costTrendDirection,
              trendAnimationDuration: _trendAnimationDuration,
              valueEditable: !isCostInputDisabled,
              actionsEnabled: !isCostInputDisabled,
              decrementEnabled: !isCostDecrementClamped,
              decrementDisabledTooltip:
                  !isCostInputDisabled && isCostDecrementClamped
                  ? _costClampTooltip
                  : null,
              disabledTooltip: isCostInputDisabled
                  ? _costInputDisabledTooltip
                  : null,
              value: _mode == StockInputMode.changes
                  ? _costDeltaLabel(draft.costDelta, currencyCode: currencyCode)
                  : _currencyLabel(
                      draft.effectiveUnitCost,
                      currencyCode: currencyCode,
                    ),
              onValueCommitted: _applyCostInput,
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

  Widget _buildSkuTitleRow(String title, {required String? keyNamespace}) {
    const actionSlotWidth = kMinInteractiveDimension;
    final titleStyle = Theme.of(context).textTheme.titleMedium?.copyWith(
      fontWeight: _fontWeight(AppThemeTokens.fontWeightBold),
    );

    return LayoutBuilder(
      builder: (context, constraints) {
        final textPainter = TextPainter(
          text: TextSpan(text: title, style: titleStyle),
          textDirection: Directionality.of(context),
          maxLines: 1,
        )..layout(maxWidth: constraints.maxWidth);

        final textWidth = textPainter.size.width;
        final desiredIconLeft =
            (constraints.maxWidth / 2) +
            (textWidth / 2) +
            AppThemeTokens.fieldLabelToControlGap;
        final clampedIconLeft = desiredIconLeft
            .clamp(0.0, math.max(0.0, constraints.maxWidth - actionSlotWidth))
            .toDouble();

        return SizedBox(
          height: kMinInteractiveDimension,
          child: Stack(
            fit: StackFit.expand,
            children: [
              Center(
                child: Text(
                  title,
                  style: titleStyle,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              Positioned(
                left: clampedIconLeft,
                top: 0,
                bottom: 0,
                child: SizedBox(
                  width: actionSlotWidth,
                  child: IconButton(
                    key: _deckElementKey(
                      'update-stock-reset-current',
                      keyNamespace: keyNamespace,
                    ),
                    tooltip: 'Reset changes',
                    padding: EdgeInsets.zero,
                    alignment: Alignment.center,
                    onPressed: _resetCurrentDraft,
                    icon: Transform(
                      alignment: Alignment.center,
                      transform: Matrix4.identity()
                        ..scaleByDouble(-1.0, 1.0, 1.0, 1.0),
                      child: const Icon(
                        Icons.refresh,
                        size:
                            AppThemeTokens.iconSizeMedium +
                            AppThemeTokens.fieldLabelToControlGap,
                        color: AppThemeTokens.primary,
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
  }

  bool _isCostInputDisabled(StockDraft draft) {
    final isNegativeChangeInChangesMode =
        _mode == StockInputMode.changes && draft.countDelta < 0;
    final isCurrentTotalBelowPreviousTotal =
        draft.effectiveCount < draft.baseCount;
    return isNegativeChangeInChangesMode || isCurrentTotalBelowPreviousTotal;
  }

  bool _isCostDecrementClamped(StockDraft draft) {
    const epsilon = 1e-9;
    if (_mode == StockInputMode.changes) {
      return draft.costDelta <= (-draft.baseUnitCost + epsilon);
    }
    return draft.effectiveUnitCost <= epsilon;
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
            _buildConfirmationTitleRow(),
            const SizedBox(height: AppThemeTokens.sectionGapCompact),
            Text(
              '$changedCount SKU(s) changed',
              style: Theme.of(context).textTheme.bodyLarge,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: AppThemeTokens.sectionGapLarge),
            FittedBox(
              fit: BoxFit.scaleDown,
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  _buildConfirmationPillButton(
                    key: const ValueKey('update-stock-back-to-edit'),
                    label: 'Back to Edit',
                    isPrimary: false,
                    onTap: () => setState(
                      () => _selectedSkuIndex = _confirmationCardIndex - 1,
                    ),
                  ),
                  const SizedBox(width: AppThemeTokens.space8),
                  _buildConfirmationPillButton(
                    key: const ValueKey('update-stock-save-all'),
                    label: 'Save All',
                    isPrimary: true,
                    onTap: _saveAllAndOpenViewAll,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildConfirmationTitleRow() {
    final title = 'Confirm Changes';
    final titleStyle = Theme.of(context).textTheme.titleMedium?.copyWith(
      fontWeight: _fontWeight(AppThemeTokens.fontWeightBold),
    );
    return SizedBox(
      height: kMinInteractiveDimension,
      child: Center(
        child: FittedBox(
          fit: BoxFit.scaleDown,
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.checklist_rounded,
                size:
                    AppThemeTokens.iconSizeMedium +
                    AppThemeTokens.fieldLabelToControlGap,
                color: titleStyle?.color ?? AppThemeTokens.textPrimary,
              ),
              const SizedBox(width: AppThemeTokens.cardInlineGap),
              Text(title, style: titleStyle, maxLines: 1, softWrap: false),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildConfirmationPillButton({
    required Key key,
    required String label,
    required bool isPrimary,
    required VoidCallback onTap,
  }) {
    final textStyle = Theme.of(context).textTheme.bodyLarge?.copyWith(
      color: isPrimary ? AppThemeTokens.white : AppThemeTokens.textSecondary,
    );
    final width = _confirmationPillWidth(label, textStyle);
    const horizontalInnerPadding =
        AppThemeTokens.iconSizeMedium + AppThemeTokens.dropdownToggleIconGap;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        key: key,
        borderRadius: BorderRadius.circular(AppThemeTokens.radiusPill),
        onTap: onTap,
        child: Container(
          height: AppThemeTokens.segmentedToggleTrackHeight,
          width: width,
          padding: const EdgeInsets.symmetric(
            horizontal: horizontalInnerPadding,
          ),
          decoration: BoxDecoration(
            color: isPrimary ? AppThemeTokens.primary : AppThemeTokens.surface,
            borderRadius: BorderRadius.circular(AppThemeTokens.radiusPill),
            border: isPrimary ? null : Border.all(color: AppThemeTokens.border),
          ),
          alignment: Alignment.center,
          child: Text(
            label,
            style: textStyle,
            textAlign: TextAlign.center,
            maxLines: 1,
            softWrap: false,
          ),
        ),
      ),
    );
  }

  double _confirmationPillWidth(String label, TextStyle? style) {
    final textPainter = TextPainter(
      text: TextSpan(text: label, style: style),
      maxLines: 1,
      textDirection: Directionality.of(context),
      textScaler: MediaQuery.textScalerOf(context),
    )..layout();
    const horizontalInnerPadding =
        AppThemeTokens.iconSizeMedium + AppThemeTokens.dropdownToggleIconGap;
    return textPainter.width + (horizontalInnerPadding * 2);
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
      onChanged: (preset) => _onIncrementPresetChanged(context, preset),
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
        final textStyle = Theme.of(
          context,
        ).textTheme.bodyLarge?.copyWith(color: AppThemeTokens.white);
        return LayoutBuilder(
          builder: (context, constraints) {
            final targetWidth = _incrementTriggerContentWidth(
              context: context,
              preset: _preset,
              textStyle: textStyle,
            );
            final maxWidth = constraints.hasBoundedWidth
                ? constraints.maxWidth
                : targetWidth;
            final clampedWidth = math.min(targetWidth, maxWidth);
            return AnimatedContainer(
              duration: const Duration(milliseconds: 180),
              curve: Curves.easeOutCubic,
              width: clampedWidth,
              alignment: Alignment.center,
              child: Row(
                mainAxisSize: MainAxisSize.max,
                children: [
                  const Icon(
                    Icons.swap_vert_rounded,
                    size: AppThemeTokens.iconSizeMedium,
                    color: AppThemeTokens.white,
                  ),
                  const SizedBox(width: AppThemeTokens.dropdownToggleIconGap),
                  Expanded(
                    child: AnimatedSwitcher(
                      duration: const Duration(milliseconds: 140),
                      switchInCurve: Curves.easeOutCubic,
                      switchOutCurve: Curves.easeInCubic,
                      layoutBuilder: (currentChild, previousChildren) {
                        return Stack(
                          alignment: Alignment.center,
                          children: [
                            ...previousChildren,
                            if (currentChild != null) currentChild,
                          ],
                        );
                      },
                      transitionBuilder: (child, animation) {
                        final offsetAnimation = Tween<Offset>(
                          begin: const Offset(0, 0.12),
                          end: Offset.zero,
                        ).animate(animation);
                        return FadeTransition(
                          opacity: animation,
                          child: SlideTransition(
                            position: offsetAnimation,
                            child: child,
                          ),
                        );
                      },
                      child: Text(
                        'Increments \u00B7 ${_displayedPreset.label}',
                        key: ValueKey(_displayedPreset),
                        style: textStyle,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        textAlign: TextAlign.center,
                      ),
                    ),
                  ),
                  const SizedBox(width: AppThemeTokens.dropdownToggleIconGap),
                  AnimatedRotation(
                    turns: isOpen ? 0.5 : 0,
                    duration: const Duration(milliseconds: 180),
                    curve: Curves.easeOutCubic,
                    child: const Icon(
                      Icons.keyboard_arrow_down_rounded,
                      size: AppThemeTokens.iconSizeMedium,
                      color: AppThemeTokens.white,
                    ),
                  ),
                ],
              ),
            );
          },
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

    const cellHorizontalPadding = AppThemeTokens.groupedCardsHorizontalGap * 2;
    const checkAreaWidth =
        AppThemeTokens.fieldLabelToControlGap +
        (AppThemeTokens.iconSizeMedium * 0.75);

    return <double>[
      maxTextWidth((preset) => '${preset.label}:') + cellHorizontalPadding,
      maxTextWidth((preset) => preset.countStepLabel) + cellHorizontalPadding,
      cellHorizontalPadding + AppThemeTokens.dividerThickness,
      maxTextWidth((preset) => preset.costStepLabel) +
          cellHorizontalPadding +
          checkAreaWidth,
    ];
  }

  double _incrementTriggerContentWidth({
    required BuildContext context,
    required IncrementPreset preset,
    TextStyle? textStyle,
  }) {
    final resolvedTextStyle =
        textStyle ??
        Theme.of(
          context,
        ).textTheme.bodyLarge?.copyWith(color: AppThemeTokens.white) ??
        const TextStyle(fontSize: AppThemeTokens.fontSizeBodyLarge);
    final textScaler = MediaQuery.textScalerOf(context);
    final textDirection = Directionality.of(context);
    final labelWidth = _measureTextWidth(
      text: 'Increments \u00B7 ${preset.label}',
      textStyle: resolvedTextStyle,
      textScaler: textScaler,
      textDirection: textDirection,
    );
    return labelWidth +
        (AppThemeTokens.iconSizeMedium * 2) +
        (AppThemeTokens.dropdownToggleIconGap * 2);
  }

  void _onIncrementPresetChanged(BuildContext context, IncrementPreset preset) {
    if (preset == _preset) {
      return;
    }

    _incrementLabelSwapTimer?.cancel();
    final generation = ++_incrementLabelSwapGeneration;
    final currentWidth = _incrementTriggerContentWidth(
      context: context,
      preset: _preset,
    );
    final nextWidth = _incrementTriggerContentWidth(
      context: context,
      preset: preset,
    );
    final shouldDelayLabelSwap = nextWidth > currentWidth;

    setState(() {
      _preset = preset;
      if (!shouldDelayLabelSwap) {
        _displayedPreset = preset;
      }
    });

    if (shouldDelayLabelSwap) {
      _incrementLabelSwapTimer = Timer(const Duration(milliseconds: 180), () {
        if (!mounted || generation != _incrementLabelSwapGeneration) {
          return;
        }
        setState(() => _displayedPreset = preset);
      });
    }
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

  Key _deckElementKey(String base, {required String? keyNamespace}) {
    return ValueKey(_deckElementKeyPrefix(base, keyNamespace: keyNamespace));
  }

  String _deckElementKeyPrefix(String base, {required String? keyNamespace}) {
    return keyNamespace == null ? base : '$base-$keyNamespace';
  }

  void _resetCurrentDraft() {
    _updateCurrentDraft((draft) => draft.reset());
  }

  String? _applyCountInput(String rawValue) {
    final parsed = _parseEditableNumber(rawValue);
    if (parsed == null) {
      return 'Only numbers!';
    }
    String? warning;
    const epsilon = 1e-9;
    _updateCurrentDraft((draft) {
      if (_mode == StockInputMode.changes) {
        final rawTotal = draft.baseCount + parsed;
        if (rawTotal > SecurityLimits.inventoryUnitsInStockMax + epsilon) {
          warning = 'Change is too high!';
        } else if (rawTotal < -epsilon) {
          warning = 'Change is too low!';
        }
        final clampedTotal = _clampInventoryCount(rawTotal);
        return draft.copyWith(
          countDelta: _normalizeZero(clampedTotal - draft.baseCount),
        );
      }
      if (parsed > SecurityLimits.inventoryUnitsInStockMax + epsilon) {
        warning = 'Change is too high!';
      } else if (parsed < -epsilon) {
        warning = 'Change is too low!';
      }
      final totalCount = _clampInventoryCount(parsed);
      return draft.copyWith(
        countDelta: _normalizeZero(totalCount - draft.baseCount),
      );
    });
    return warning;
  }

  String? _applyCostInput(String rawValue) {
    final parsed = _parseEditableNumber(rawValue);
    if (parsed == null) {
      return 'Only numbers!';
    }
    String? warning;
    const epsilon = 1e-9;
    _updateCurrentDraft((draft) {
      if (_mode == StockInputMode.changes) {
        final rawTotal = draft.baseUnitCost + parsed;
        if (rawTotal > SecurityLimits.monetaryAmountMax + epsilon) {
          warning = 'Change is too high!';
        } else if (rawTotal < -epsilon) {
          warning = 'Cost cannot go below zero';
        }
        final clampedTotal = _clampMonetaryAmount(rawTotal);
        return draft.copyWith(
          costDelta: _normalizeZero(clampedTotal - draft.baseUnitCost),
        );
      }
      if (parsed > SecurityLimits.monetaryAmountMax + epsilon) {
        warning = 'Change is too high!';
      } else if (parsed < -epsilon) {
        warning = 'Cost cannot go below zero';
      }
      final totalUnitCost = _clampMonetaryAmount(parsed);
      return draft.copyWith(
        costDelta: _normalizeZero(totalUnitCost - draft.baseUnitCost),
      );
    });
    return warning;
  }

  double _clampInventoryCount(double value) {
    return value.clamp(0.0, SecurityLimits.inventoryUnitsInStockMax).toDouble();
  }

  double _clampMonetaryAmount(double value) {
    return value.clamp(0.0, SecurityLimits.monetaryAmountMax).toDouble();
  }

  double? _parseEditableNumber(String rawValue) {
    final normalized = rawValue.replaceAll(',', '').trim();
    if (normalized.isEmpty) {
      return null;
    }
    final withoutCurrency = normalized.replaceFirst(
      RegExp(r'\s+[A-Za-z]{3}$'),
      '',
    );
    final numericCandidate = withoutCurrency.trim();
    const numericPattern = r'^[+-]?(?:\d+\.?\d*|\.\d+)$';
    if (!RegExp(numericPattern).hasMatch(numericCandidate)) {
      return null;
    }
    final parsed = double.tryParse(numericCandidate);
    if (parsed == null || parsed.isNaN || !parsed.isFinite) {
      return null;
    }
    return parsed;
  }

  double _normalizeZero(double value) {
    return value.abs() < 1e-9 ? 0.0 : value;
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
    const checkSpacing = AppThemeTokens.fieldLabelToControlGap;
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
          horizontal: AppThemeTokens.groupedCardsHorizontalGap,
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
    required this.keyNamespace,
    this.labelIconAsset,
    this.labelIconKey,
    required this.valueKey,
    required this.valueContainerKey,
    required this.decrementKey,
    required this.incrementKey,
    required this.trendDirection,
    required this.trendAnimationDuration,
    required this.valueEditable,
    required this.value,
    required this.onValueCommitted,
    required this.onDecrement,
    required this.onIncrement,
    this.actionsEnabled = true,
    this.decrementEnabled = true,
    this.decrementDisabledTooltip,
    this.disabledTooltip,
  });

  final String label;
  final String? keyNamespace;
  final String? labelIconAsset;
  final Key? labelIconKey;
  final Key valueKey;
  final Key valueContainerKey;
  final Key decrementKey;
  final Key incrementKey;
  final _TrendDirection trendDirection;
  final Duration trendAnimationDuration;
  final bool valueEditable;
  final String value;
  final String? Function(String) onValueCommitted;
  final VoidCallback onDecrement;
  final VoidCallback onIncrement;
  final bool actionsEnabled;
  final bool decrementEnabled;
  final String? decrementDisabledTooltip;
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
              horizontalNudge: AppThemeTokens.fieldLabelToControlGap,
              isEnabled: actionsEnabled && decrementEnabled,
              disabledTooltip: decrementDisabledTooltip,
              onTap: onDecrement,
            ),
            const SizedBox(width: AppThemeTokens.fieldLabelToControlGap),
            Container(
              key: valueContainerKey,
              height: AppThemeTokens.stockStepActionHeight,
              constraints: const BoxConstraints(
                minWidth: AppThemeTokens.stockStepperValueMinWidth,
                maxWidth:
                    AppThemeTokens.stockStepperValueMinWidth +
                    (AppThemeTokens.unit * 22),
              ),
              padding: const EdgeInsets.symmetric(
                horizontal: AppThemeTokens.togglePillLabelPadX,
              ),
              decoration: BoxDecoration(
                color: actionsEnabled
                    ? AppThemeTokens.surface
                    : AppThemeTokens.disabledBackground,
                borderRadius: BorderRadius.circular(AppThemeTokens.radiusPill),
              ),
              child: Center(
                child: _EditableStepperValue(
                  value,
                  textFieldKey: valueKey,
                  enabled: valueEditable && actionsEnabled,
                  onValueCommitted: onValueCommitted,
                  style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                    fontSize:
                        AppThemeTokens.fontSizeBodyLarge + AppThemeTokens.unit,
                    height: 1.0,
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
              horizontalNudge: -AppThemeTokens.fieldLabelToControlGap,
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
            decoration: BoxDecoration(
              color: AppThemeTokens.warning,
              borderRadius: BorderRadius.circular(AppThemeTokens.radiusMd),
            ),
            textStyle: Theme.of(
              context,
            ).textTheme.bodyMedium?.copyWith(color: AppThemeTokens.textPrimary),
            child: track,
          )
        : track;

    final labelStyle = Theme.of(context).textTheme.titleMedium?.copyWith(
      fontWeight: _fontWeight(AppThemeTokens.fontWeightSemibold),
    );
    final labelTrendKeyPrefix = switch (label) {
      'Count' => 'update-stock-count-label-trend',
      'Cost' => 'update-stock-cost-label-trend',
      _ => 'update-stock-stepper-label-trend',
    };
    final namespacedLabelTrendKeyPrefix = keyNamespace == null
        ? labelTrendKeyPrefix
        : '$labelTrendKeyPrefix-$keyNamespace';
    final invertTrendColors = label == 'Cost';
    final labelTextKey = keyNamespace == null
        ? ValueKey('update-stock-${label.toLowerCase()}-label')
        : ValueKey('update-stock-${label.toLowerCase()}-label-$keyNamespace');

    return Column(
      children: [
        _CenteredTrendText(
          text: label,
          textKey: labelTextKey,
          style: labelStyle,
          trendDirection: trendDirection,
          trendAnimationDuration: trendAnimationDuration,
          trendKeyPrefix: namespacedLabelTrendKeyPrefix,
          invertTrendColors: invertTrendColors,
          labelIconAsset: labelIconAsset,
          labelIconKey: labelIconKey,
          centerText: true,
        ),
        const SizedBox(
          height: AppThemeTokens.fieldLabelToControlGap + AppThemeTokens.unit,
        ),
        Align(alignment: Alignment.center, child: trackWithTooltip),
      ],
    );
  }
}

enum _TrendDirection { down, flat, up }

class _CenteredTrendText extends StatelessWidget {
  const _CenteredTrendText({
    required this.text,
    required this.textKey,
    required this.style,
    required this.trendDirection,
    required this.trendAnimationDuration,
    required this.trendKeyPrefix,
    this.invertTrendColors = false,
    this.labelIconAsset,
    this.labelIconKey,
    this.centerText = false,
  });

  final String text;
  final Key textKey;
  final TextStyle? style;
  final _TrendDirection trendDirection;
  final Duration trendAnimationDuration;
  final String trendKeyPrefix;
  final bool invertTrendColors;
  final String? labelIconAsset;
  final Key? labelIconKey;
  final bool centerText;

  @override
  Widget build(BuildContext context) {
    final resolvedStyle = style ?? Theme.of(context).textTheme.bodyLarge;
    final fontSize =
        resolvedStyle?.fontSize ?? AppThemeTokens.fontSizeBodyLarge;
    final trendIconSize =
        fontSize + AppThemeTokens.fieldLabelToControlGap + AppThemeTokens.unit;
    const trendGap = AppThemeTokens.fieldLabelToControlGap;
    final upTrendColor = invertTrendColors
        ? AppThemeTokens.error
        : AppThemeTokens.success;
    final downTrendColor = invertTrendColors
        ? AppThemeTokens.success
        : AppThemeTokens.error;
    final textWidget = Text(
      text,
      key: textKey,
      textAlign: TextAlign.center,
      style: resolvedStyle,
      maxLines: 1,
      overflow: TextOverflow.ellipsis,
    );

    if (labelIconAsset != null) {
      return KeyedSubtree(
        key: textKey,
        child: _FieldLabel(
          label: text,
          iconAsset: labelIconAsset,
          iconKey: labelIconKey,
          centerText: centerText,
          textStyle: resolvedStyle,
          trailing: _AnimatedTrendIndicator(
            direction: trendDirection,
            size: trendIconSize,
            animationDuration: trendAnimationDuration,
            keyPrefix: trendKeyPrefix,
            upColor: upTrendColor,
            downColor: downTrendColor,
          ),
        ),
      );
    }

    return LayoutBuilder(
      builder: (context, constraints) {
        if (!constraints.maxWidth.isFinite) {
          if (trendDirection == _TrendDirection.flat) {
            return textWidget;
          }

          return Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              textWidget,
              const SizedBox(width: trendGap),
              _AnimatedTrendIndicator(
                direction: trendDirection,
                size: trendIconSize,
                animationDuration: trendAnimationDuration,
                keyPrefix: trendKeyPrefix,
                upColor: upTrendColor,
                downColor: downTrendColor,
              ),
            ],
          );
        }

        final textPainter = TextPainter(
          text: TextSpan(text: text, style: resolvedStyle),
          textDirection: Directionality.of(context),
          maxLines: 1,
          textScaler: MediaQuery.textScalerOf(context),
        )..layout(maxWidth: constraints.maxWidth);
        final textWidth = textPainter.width;
        final desiredTrendLeft =
            (constraints.maxWidth / 2) + (textWidth / 2) + trendGap;
        final clampedTrendLeft = desiredTrendLeft
            .clamp(0.0, math.max(0.0, constraints.maxWidth - trendIconSize))
            .toDouble();
        final contentHeight = math.max(textPainter.height, trendIconSize);

        return SizedBox(
          width: constraints.maxWidth,
          height: contentHeight,
          child: Stack(
            fit: StackFit.expand,
            children: [
              Center(child: textWidget),
              Positioned(
                left: clampedTrendLeft,
                top: 0,
                bottom: 0,
                child: Center(
                  child: _AnimatedTrendIndicator(
                    direction: trendDirection,
                    size: trendIconSize,
                    animationDuration: trendAnimationDuration,
                    keyPrefix: trendKeyPrefix,
                    upColor: upTrendColor,
                    downColor: downTrendColor,
                  ),
                ),
              ),
            ],
          ),
        );
      },
    );
  }
}

class _AnimatedTrendIndicator extends StatelessWidget {
  const _AnimatedTrendIndicator({
    required this.direction,
    required this.size,
    required this.animationDuration,
    required this.keyPrefix,
    required this.upColor,
    required this.downColor,
  });

  final _TrendDirection direction;
  final double size;
  final Duration animationDuration;
  final String keyPrefix;
  final Color upColor;
  final Color downColor;

  @override
  Widget build(BuildContext context) {
    final icon = switch (direction) {
      _TrendDirection.up => Icon(
        Icons.arrow_drop_up_rounded,
        key: ValueKey('$keyPrefix-up'),
        color: upColor,
        size: size,
      ),
      _TrendDirection.down => Icon(
        Icons.arrow_drop_down_rounded,
        key: ValueKey('$keyPrefix-down'),
        color: downColor,
        size: size,
      ),
      _TrendDirection.flat => SizedBox(
        key: ValueKey('$keyPrefix-flat'),
        width: size,
        height: size,
      ),
    };

    return AnimatedSwitcher(
      duration: animationDuration,
      switchInCurve: Curves.easeOutCubic,
      switchOutCurve: Curves.easeInCubic,
      transitionBuilder: (child, animation) {
        final fade = CurvedAnimation(
          parent: animation,
          curve: Curves.easeInOut,
        );
        final scale = Tween<double>(begin: 0.8, end: 1.0).animate(fade);
        return FadeTransition(
          opacity: fade,
          child: ScaleTransition(scale: scale, child: child),
        );
      },
      child: icon,
    );
  }
}

_TrendDirection _trendDirection({
  required double current,
  required double baseline,
  double epsilon = 1e-9,
}) {
  if (current > baseline + epsilon) {
    return _TrendDirection.up;
  }
  if (current < baseline - epsilon) {
    return _TrendDirection.down;
  }
  return _TrendDirection.flat;
}

class _EditableStepperValue extends StatefulWidget {
  const _EditableStepperValue(
    this.value, {
    required this.textFieldKey,
    required this.enabled,
    required this.onValueCommitted,
    required this.style,
  });

  final String value;
  final Key textFieldKey;
  final bool enabled;
  final String? Function(String) onValueCommitted;
  final TextStyle? style;

  @override
  State<_EditableStepperValue> createState() => _EditableStepperValueState();
}

class _EditableStepperValueState extends State<_EditableStepperValue> {
  late final TextEditingController _controller;
  late final FocusNode _focusNode;
  final GlobalKey<TooltipState> _warningTooltipKey = GlobalKey<TooltipState>();
  String? _warningMessage;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: widget.value);
    _focusNode = FocusNode()..addListener(_onFocusChange);
  }

  @override
  void didUpdateWidget(covariant _EditableStepperValue oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (!widget.enabled && _focusNode.hasFocus) {
      _focusNode.unfocus();
    }
    if (!_focusNode.hasFocus && _controller.text != widget.value) {
      _controller.text = widget.value;
    }
  }

  @override
  void dispose() {
    _focusNode
      ..removeListener(_onFocusChange)
      ..dispose();
    _controller.dispose();
    super.dispose();
  }

  void _onFocusChange() {
    if (_focusNode.hasFocus) {
      if (_warningMessage != null) {
        setState(() => _warningMessage = null);
      }
      _controller.selection = TextSelection(
        baseOffset: 0,
        extentOffset: _controller.text.length,
      );
      return;
    }

    final warning = widget.onValueCommitted(_controller.text);
    if (warning != null && warning.isNotEmpty) {
      _showWarning(warning);
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || _focusNode.hasFocus) {
        return;
      }
      if (_controller.text != widget.value) {
        _controller.text = widget.value;
      }
    });
  }

  void _showWarning(String message) {
    if (_warningMessage != message) {
      setState(() => _warningMessage = message);
    }
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) {
        return;
      }
      _warningTooltipKey.currentState?.ensureTooltipVisible();
    });
  }

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      key: _warningTooltipKey,
      message: _warningMessage ?? '',
      triggerMode: TooltipTriggerMode.manual,
      showDuration: const Duration(seconds: 2),
      decoration: BoxDecoration(
        color: AppThemeTokens.warning,
        borderRadius: BorderRadius.circular(AppThemeTokens.radiusMd),
      ),
      textStyle: Theme.of(
        context,
      ).textTheme.bodyMedium?.copyWith(color: AppThemeTokens.textPrimary),
      child: TextField(
        key: widget.textFieldKey,
        controller: _controller,
        focusNode: _focusNode,
        enabled: widget.enabled,
        keyboardType: const TextInputType.numberWithOptions(
          decimal: true,
          signed: true,
        ),
        textInputAction: TextInputAction.done,
        onSubmitted: (_) => _focusNode.unfocus(),
        onTapOutside: (_) => _focusNode.unfocus(),
        textAlign: TextAlign.center,
        style: widget.style,
        decoration: const InputDecoration(
          filled: false,
          fillColor: Colors.transparent,
          hoverColor: Colors.transparent,
          border: InputBorder.none,
          enabledBorder: InputBorder.none,
          focusedBorder: InputBorder.none,
          disabledBorder: InputBorder.none,
          errorBorder: InputBorder.none,
          focusedErrorBorder: InputBorder.none,
          isDense: true,
          isCollapsed: true,
          contentPadding: EdgeInsets.zero,
        ),
      ),
    );
  }
}

class _StepAction extends StatelessWidget {
  const _StepAction({
    required this.icon,
    required this.onTap,
    this.horizontalNudge = 0,
    this.isEnabled = true,
    this.disabledTooltip,
    super.key,
  });

  final IconData icon;
  final VoidCallback onTap;
  final double horizontalNudge;
  final bool isEnabled;
  final String? disabledTooltip;

  @override
  Widget build(BuildContext context) {
    final action = Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(AppThemeTokens.radiusPill),
        onTap: isEnabled ? onTap : null,
        child: SizedBox(
          width: AppThemeTokens.stockStepActionHeight,
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
                weight: AppThemeTokens.fontWeightBold,
                color: isEnabled
                    ? AppThemeTokens.textPrimary
                    : AppThemeTokens.disabledForeground,
              ),
            ),
          ),
        ),
      ),
    );

    final showDisabledTooltip =
        !isEnabled && (disabledTooltip?.isNotEmpty ?? false);
    if (!showDisabledTooltip) {
      return action;
    }

    return Tooltip(
      message: disabledTooltip!,
      triggerMode: TooltipTriggerMode.tap,
      decoration: BoxDecoration(
        color: AppThemeTokens.warning,
        borderRadius: BorderRadius.circular(AppThemeTokens.radiusMd),
      ),
      textStyle: Theme.of(
        context,
      ).textTheme.bodyMedium?.copyWith(color: AppThemeTokens.textPrimary),
      child: action,
    );
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

String _costDeltaLabel(double value, {required String currencyCode}) {
  final normalizedValue = value.abs() < 1e-9 ? 0.0 : value;
  final magnitude = _formatNumber(normalizedValue.abs());
  if (normalizedValue < 0) {
    return '-$magnitude $currencyCode';
  }
  return '$magnitude $currencyCode';
}
