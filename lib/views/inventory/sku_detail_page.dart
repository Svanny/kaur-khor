part of '../inventory_views.dart';

class SkuDetailPage extends StatefulWidget {
  const SkuDetailPage({required this.initialSku, super.key});

  final SkuItem initialSku;

  @override
  State<SkuDetailPage> createState() => _SkuDetailPageState();
}

class _SkuDetailPageState extends State<SkuDetailPage> {
  static const ValueKey<String> _soldAsProductToggleKey = ValueKey(
    'sold-as-product-toggle',
  );
  static const ValueKey<String> _soldAsProductRowKey = ValueKey(
    'sold-as-product-row',
  );
  static const Duration _productPriceToggleDuration = Duration(
    milliseconds: 220,
  );
  static const double _productPriceExpansionEstimate = 140;
  final ScrollController _scrollController = ScrollController();
  final GlobalKey _productPriceSectionKey = GlobalKey();
  final GlobalKey _soldAsProductCardKey = GlobalKey();
  late final TextEditingController _nameController;
  late final TextEditingController _descriptionController;
  late final TextEditingController _unitsInStockController;
  late final TextEditingController _costPerUnitController;
  late final TextEditingController _productPriceController;

  late final String _initialName;
  late final String _initialDescription;
  late final String _initialUnitsInStockText;
  late final String _initialCostPerUnitText;
  late final String _initialProductPriceText;
  late final IconData _initialItemPictureIcon;
  late final bool _initialSoldAsProduct;

  late IconData _itemPictureIcon;
  late bool _soldAsProduct;
  bool _allowPop = false;
  bool _showValidationHighlights = false;
  bool _nameBlurred = false;
  bool _descriptionBlurred = false;
  bool _unitsInStockBlurred = false;
  bool _costPerUnitBlurred = false;
  bool _productPriceBlurred = false;

  @override
  void initState() {
    super.initState();
    final sku = widget.initialSku;
    _initialName = sku.name;
    _initialDescription = sku.description;
    _initialUnitsInStockText = _formatNumber(sku.unitsInStock);
    _initialCostPerUnitText = _trimNumber(sku.costPerUnit);
    _initialProductPriceText = sku.productPrice == null
        ? ''
        : _trimNumber(sku.productPrice!);
    _initialItemPictureIcon = sku.itemPictureIcon;
    _initialSoldAsProduct = sku.soldAsProduct;
    _nameController = TextEditingController(text: _initialName);
    _descriptionController = TextEditingController(text: _initialDescription);
    _unitsInStockController = TextEditingController(
      text: _initialUnitsInStockText,
    );
    _costPerUnitController = TextEditingController(
      text: _initialCostPerUnitText,
    );
    _productPriceController = TextEditingController(
      text: _initialProductPriceText,
    );
    _itemPictureIcon = sku.itemPictureIcon;
    _soldAsProduct = sku.soldAsProduct;
  }

  @override
  void dispose() {
    _scrollController.dispose();
    _nameController.dispose();
    _descriptionController.dispose();
    _unitsInStockController.dispose();
    _costPerUnitController.dispose();
    _productPriceController.dispose();
    super.dispose();
  }

  List<String> get _validationErrors {
    final errors = <String>[];

    final nameError = SecurityValidators.validateRequiredText(
      _nameController.text,
      fieldName: 'Name',
      maxLength: SecurityLimits.skuNameMaxLength,
    );
    if (nameError != null) {
      errors.add(nameError);
    }

    final descriptionError = SecurityValidators.validateRequiredText(
      _descriptionController.text,
      fieldName: 'Description',
      maxLength: SecurityLimits.skuDescriptionMaxLength,
    );
    if (descriptionError != null) {
      errors.add(descriptionError);
    }

    final unitsInStockError = SecurityValidators.validateNonNegativeDecimal(
      _unitsInStockController.text,
      fieldName: 'Units',
      maxValue: SecurityLimits.inventoryUnitsInStockMax,
    );
    if (unitsInStockError != null) {
      errors.add(unitsInStockError);
    }

    final costPerUnitError = SecurityValidators.validateNonNegativeDecimal(
      _costPerUnitController.text,
      fieldName: 'Cost / Unit',
      maxValue: SecurityLimits.monetaryAmountMax,
    );
    if (costPerUnitError != null) {
      errors.add(costPerUnitError);
    }

    if (_soldAsProduct) {
      final productPriceError = SecurityValidators.validateNonNegativeDecimal(
        _productPriceController.text,
        fieldName: 'Product Price',
        maxValue: SecurityLimits.monetaryAmountMax,
      );
      if (productPriceError != null) {
        errors.add(productPriceError);
      }
    }
    return errors;
  }

  bool get _isValid => _validationErrors.isEmpty;
  bool get _nameHasError =>
      SecurityValidators.validateRequiredText(
        _nameController.text,
        fieldName: 'Name',
        maxLength: SecurityLimits.skuNameMaxLength,
      ) !=
      null;
  bool get _descriptionHasError =>
      SecurityValidators.validateRequiredText(
        _descriptionController.text,
        fieldName: 'Description',
        maxLength: SecurityLimits.skuDescriptionMaxLength,
      ) !=
      null;
  double? get _unitsInStockValue => _tryDouble(_unitsInStockController.text);
  double? get _costPerUnitValue => _tryDouble(_costPerUnitController.text);
  double? get _productPriceValue => _tryDouble(_productPriceController.text);

  bool get _unitsInStockHasError {
    return SecurityValidators.validateNonNegativeDecimal(
          _unitsInStockController.text,
          fieldName: 'Units',
          maxValue: SecurityLimits.inventoryUnitsInStockMax,
        ) !=
        null;
  }

  bool get _costPerUnitHasError {
    return SecurityValidators.validateNonNegativeDecimal(
          _costPerUnitController.text,
          fieldName: 'Cost / Unit',
          maxValue: SecurityLimits.monetaryAmountMax,
        ) !=
        null;
  }

  bool get _productPriceHasError =>
      _soldAsProduct &&
      SecurityValidators.validateNonNegativeDecimal(
            _productPriceController.text,
            fieldName: 'Product Price',
            maxValue: SecurityLimits.monetaryAmountMax,
          ) !=
          null;

  bool get _hasChanges =>
      _nameController.text != _initialName ||
      _descriptionController.text != _initialDescription ||
      _unitsInStockController.text != _initialUnitsInStockText ||
      _costPerUnitController.text != _initialCostPerUnitText ||
      _productPriceController.text != _initialProductPriceText ||
      _itemPictureIcon != _initialItemPictureIcon ||
      _soldAsProduct != _initialSoldAsProduct;

  @override
  Widget build(BuildContext context) {
    final edge = AppThemeTokens.screenEdgePadding(context);
    final unitsInStock = _unitsInStockValue;
    final costPerUnit = _costPerUnitValue;
    final total =
        (((unitsInStock != null && unitsInStock > 0) ? unitsInStock : 0) *
                ((costPerUnit != null && costPerUnit > 0) ? costPerUnit : 0))
            .toDouble();

    return PopScope<SkuItem>(
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
                title: _nameController.text.trim().isEmpty
                    ? 'SKU'
                    : _nameController.text.trim(),
                titleIcon: _defaultSkuPictureIcon,
                onBack: _onBackPressed,
                onCancel: _resetChanges,
                onSave: _save,
                hasChanges: _hasChanges,
                isValid: _isValid,
              ),
              const SizedBox(height: AppThemeTokens.headerToContentGap),
              Expanded(
                child: ListView(
                  controller: _scrollController,
                  padding: EdgeInsets.only(
                    bottom:
                        edge.bottom +
                        AppThemeTokens.scrollBottomReservePrimary +
                        AppThemeTokens.scrollBottomReserveSecondary,
                  ),
                  children: [
                    _MediaPlaceholderCard(itemPictureIcon: _itemPictureIcon),
                    const SizedBox(height: AppThemeTokens.sectionGap),
                    _FieldEditor(
                      label: 'Name',
                      controller: _nameController,
                      inputMode: _InputMode.text,
                      maxLength: SecurityLimits.skuNameMaxLength,
                      hintText: 'Enter SKU name',
                      hasError:
                          (_showValidationHighlights || _nameBlurred) &&
                          _nameHasError,
                      onTapOutside: () => setState(() => _nameBlurred = true),
                      onChanged: (_) => setState(() {}),
                    ),
                    const SizedBox(height: AppThemeTokens.sectionGap),
                    _FieldEditor(
                      label: 'Description',
                      controller: _descriptionController,
                      inputMode: _InputMode.text,
                      maxLines: 4,
                      maxLength: SecurityLimits.skuDescriptionMaxLength,
                      hintText: 'Describe this SKU',
                      hasError:
                          (_showValidationHighlights || _descriptionBlurred) &&
                          _descriptionHasError,
                      onTapOutside: () =>
                          setState(() => _descriptionBlurred = true),
                      onChanged: (_) => setState(() {}),
                    ),
                    const SizedBox(height: AppThemeTokens.sectionGap),
                    ValueListenableBuilder<AppCurrency>(
                      valueListenable: context.currencyController,
                      builder: (_, currency, __) {
                        return _GroupedInputCard(
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: _FieldEditor(
                                    label: 'Units',
                                    labelIconAsset: _package2SvgAsset,
                                    labelIconKey: const ValueKey(
                                      'sku-units-in-stock-label-icon',
                                    ),
                                    controller: _unitsInStockController,
                                    inputMode: _InputMode.decimal,
                                    hintText: 'Enter units',
                                    hasError:
                                        (_showValidationHighlights ||
                                            _unitsInStockBlurred) &&
                                        _unitsInStockHasError,
                                    onTapOutside: () => setState(
                                      () => _unitsInStockBlurred = true,
                                    ),
                                    onChanged: (_) => setState(() {}),
                                  ),
                                ),
                                const SizedBox(
                                  width:
                                      AppThemeTokens.groupedCardsHorizontalGap,
                                ),
                                Expanded(
                                  child: _CurrencyFieldWithCode(
                                    label: 'Cost / Unit',
                                    labelIconAsset: _paymentsSvgAsset,
                                    labelIconKey: const ValueKey(
                                      'sku-cost-unit-label-icon',
                                    ),
                                    controller: _costPerUnitController,
                                    inputMode: _InputMode.decimal,
                                    hintText: 'e.g. 4.50',
                                    currencyCode: currency.code,
                                    hasError:
                                        (_showValidationHighlights ||
                                            _costPerUnitBlurred) &&
                                        _costPerUnitHasError,
                                    onTapOutside: () => setState(
                                      () => _costPerUnitBlurred = true,
                                    ),
                                    onChanged: (_) => setState(() {}),
                                  ),
                                ),
                              ],
                            ),
                          ],
                        );
                      },
                    ),
                    const SizedBox(height: AppThemeTokens.sectionGap),
                    ValueListenableBuilder<AppCurrency>(
                      valueListenable: context.currencyController,
                      builder: (_, currency, __) {
                        return _AdaptiveCurrencyReadOnlyField(
                          label: 'Total Value',
                          value: total,
                          currencyCode: currency.code,
                        );
                      },
                    ),
                    const SizedBox(height: AppThemeTokens.sectionGap),
                    KeyedSubtree(
                      key: _soldAsProductCardKey,
                      child: Row(
                        key: _soldAsProductRowKey,
                        children: [
                          Expanded(
                            child: Text(
                              'Sold as a Product',
                              style: Theme.of(context).textTheme.titleMedium,
                            ),
                          ),
                          const SizedBox(
                            width: AppThemeTokens.sectionCardInlineGap,
                          ),
                          _SlidingYesNoToggle(
                            key: _soldAsProductToggleKey,
                            value: _soldAsProduct,
                            onChanged: _setSoldAsProduct,
                          ),
                        ],
                      ),
                    ),
                    AnimatedSize(
                      duration: _productPriceToggleDuration,
                      reverseDuration: _productPriceToggleDuration,
                      curve: Curves.easeInOutCubic,
                      alignment: Alignment.topCenter,
                      child: _soldAsProduct
                          ? Padding(
                              padding: const EdgeInsets.only(
                                top: AppThemeTokens.sectionCardOuterGap,
                              ),
                              child: Card(
                                margin: EdgeInsets.zero,
                                child: Padding(
                                  padding: const EdgeInsets.all(
                                    AppThemeTokens.groupedCardInset,
                                  ),
                                  child: KeyedSubtree(
                                    key: _productPriceSectionKey,
                                    child: ValueListenableBuilder<AppCurrency>(
                                      valueListenable:
                                          context.currencyController,
                                      builder: (_, currency, __) {
                                        return _CurrencyFieldWithCode(
                                          label: 'Product Price',
                                          labelIconAsset: _pointOfSaleSvgAsset,
                                          labelIconKey: const ValueKey(
                                            'sku-product-price-label-icon',
                                          ),
                                          controller: _productPriceController,
                                          inputMode: _InputMode.decimal,
                                          hintText: 'e.g. 12.00',
                                          currencyCode: currency.code,
                                          hasError:
                                              (_showValidationHighlights ||
                                                  _productPriceBlurred) &&
                                              _productPriceHasError,
                                          onTapOutside: () => setState(
                                            () => _productPriceBlurred = true,
                                          ),
                                          onChanged: (_) => setState(() {}),
                                        );
                                      },
                                    ),
                                  ),
                                ),
                              ),
                            )
                          : const SizedBox.shrink(),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
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
    if (!_isValid && !_showValidationHighlights) {
      setState(() => _showValidationHighlights = true);
    }
    final choice = await _showUnsavedChangesDialog();
    if (!mounted) {
      return false;
    }
    if (choice == UnsavedExitAction.confirm) {
      if (!_isValid) {
        setState(() => _showValidationHighlights = true);
        return false;
      }
      _save();
      return false;
    }
    return choice == UnsavedExitAction.discard;
  }

  void _popWithoutSaving() {
    setState(() => _allowPop = true);
    Navigator.of(context).pop();
  }

  Future<UnsavedExitAction?> _showUnsavedChangesDialog() {
    return showUnsavedChangesDialog(
      context: context,
      isValid: _isValid,
      validationErrors: _validationErrors,
    );
  }

  void _resetChanges() {
    FocusScope.of(context).unfocus();
    setState(() {
      _nameController.text = _initialName;
      _descriptionController.text = _initialDescription;
      _unitsInStockController.text = _initialUnitsInStockText;
      _costPerUnitController.text = _initialCostPerUnitText;
      _productPriceController.text = _initialProductPriceText;
      _itemPictureIcon = _initialItemPictureIcon;
      _soldAsProduct = _initialSoldAsProduct;
      _showValidationHighlights = false;
      _nameBlurred = false;
      _descriptionBlurred = false;
      _unitsInStockBlurred = false;
      _costPerUnitBlurred = false;
      _productPriceBlurred = false;
    });
  }

  void _save() {
    if (!_isValid) {
      return;
    }
    final updated = widget.initialSku.copyWith(
      name: SecurityValidators.normalizeText(
        _nameController.text,
        maxLength: SecurityLimits.skuNameMaxLength,
      ),
      itemPictureIcon: _itemPictureIcon,
      description: SecurityValidators.normalizeText(
        _descriptionController.text,
        maxLength: SecurityLimits.skuDescriptionMaxLength,
      ),
      unitsInStock: (_unitsInStockValue ?? 0)
          .clamp(0, SecurityLimits.inventoryUnitsInStockMax)
          .toDouble(),
      costPerUnit: (_costPerUnitValue ?? 0)
          .clamp(0, SecurityLimits.monetaryAmountMax)
          .toDouble(),
      soldAsProduct: _soldAsProduct,
      productPrice: _soldAsProduct
          ? (_productPriceValue ?? 0)
                .clamp(0, SecurityLimits.monetaryAmountMax)
                .toDouble()
          : null,
      clearProductPrice: !_soldAsProduct,
    );
    setState(() => _allowPop = true);
    Navigator.of(context).pop(updated);
  }

  void _setSoldAsProduct(bool value) {
    final wasSoldAsProduct = _soldAsProduct;
    if (!wasSoldAsProduct && value) {
      unawaited(_preScrollForProductPriceExpansion());
    }
    setState(() {
      _soldAsProduct = value;
      if (!_soldAsProduct) {
        _productPriceBlurred = false;
      }
    });
    if (!wasSoldAsProduct && value) {
      _scheduleProductPriceAutoScroll();
    }
  }

  void _scheduleProductPriceAutoScroll() {
    Future<void>.delayed(_productPriceToggleDuration, () {
      if (!mounted) {
        return;
      }
      _ensureProductPriceVisible();
    });
  }

  Future<void> _preScrollForProductPriceExpansion() async {
    if (!_scrollController.hasClients) {
      return;
    }
    final cardContext = _soldAsProductCardKey.currentContext;
    if (cardContext == null) {
      return;
    }
    final cardObject = cardContext.findRenderObject();
    if (cardObject is! RenderBox) {
      return;
    }
    final scrollableState = Scrollable.maybeOf(cardContext);
    final viewportObject = scrollableState?.context.findRenderObject();
    if (viewportObject is! RenderBox) {
      return;
    }

    final position = _scrollController.position;
    final edge = AppThemeTokens.screenEdgePadding(context);
    final bottomClearance =
        edge.bottom + AppThemeTokens.scrollVisibilityBottomClearance;
    final cardBottom = cardObject.localToGlobal(
      cardObject.size.bottomLeft(Offset.zero),
      ancestor: viewportObject,
    );
    final viewportBottom = viewportObject.size.height - bottomClearance;
    final overflowAfterExpand =
        (cardBottom.dy + _productPriceExpansionEstimate) -
        viewportBottom +
        AppThemeTokens.scrollNudge;
    if (overflowAfterExpand <= 0) {
      return;
    }

    final targetOffset = math.max(
      position.minScrollExtent,
      math.min(position.maxScrollExtent, position.pixels + overflowAfterExpand),
    );
    if ((targetOffset - position.pixels).abs() < 0.5) {
      return;
    }

    await _scrollController.animateTo(
      targetOffset,
      duration: _productPriceToggleDuration,
      curve: Curves.easeInOutCubic,
    );
  }

  Future<void> _ensureProductPriceVisible() async {
    final sectionContext = _productPriceSectionKey.currentContext;
    if (sectionContext == null || !_scrollController.hasClients) {
      return;
    }
    final renderObject = sectionContext.findRenderObject();
    if (renderObject is! RenderBox) {
      return;
    }
    final scrollableState = Scrollable.maybeOf(sectionContext);
    final viewportObject = scrollableState?.context.findRenderObject();
    if (viewportObject is! RenderBox) {
      return;
    }
    final position = _scrollController.position;
    final edge = AppThemeTokens.screenEdgePadding(context);
    const topClearance = AppThemeTokens.scrollVisibilityTopClearance;
    final bottomClearance =
        edge.bottom + AppThemeTokens.scrollVisibilityBottomClearance;
    final topLeft = renderObject.localToGlobal(
      Offset.zero,
      ancestor: viewportObject,
    );
    final bottomRight = renderObject.localToGlobal(
      renderObject.size.bottomRight(Offset.zero),
      ancestor: viewportObject,
    );
    const viewportTop = topClearance;
    final viewportBottom = viewportObject.size.height - bottomClearance;
    var targetOffset = position.pixels;

    if (bottomRight.dy > viewportBottom) {
      targetOffset +=
          (bottomRight.dy - viewportBottom) + AppThemeTokens.scrollNudge;
    } else if (topLeft.dy < viewportTop) {
      targetOffset -= viewportTop - topLeft.dy;
    }

    targetOffset = math.max(
      position.minScrollExtent,
      math.min(position.maxScrollExtent, targetOffset),
    );
    if ((targetOffset - position.pixels).abs() < 0.5) {
      return;
    }

    await _scrollController.animateTo(
      targetOffset,
      duration: _productPriceToggleDuration,
      curve: Curves.easeInOutCubic,
    );
  }
}

class _GroupedInputCard extends StatelessWidget {
  const _GroupedInputCard({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Card(
      margin: EdgeInsets.zero,
      child: Padding(
        padding: const EdgeInsets.all(AppThemeTokens.groupedCardInset),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: children,
        ),
      ),
    );
  }
}
