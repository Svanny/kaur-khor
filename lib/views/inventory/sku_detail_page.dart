part of '../inventory_views.dart';

class SkuDetailPage extends StatefulWidget {
  const SkuDetailPage({required this.initialSku, super.key});

  final SkuItem initialSku;

  @override
  State<SkuDetailPage> createState() => _SkuDetailPageState();
}

class _SkuDetailPageState extends State<SkuDetailPage> {
  late final TextEditingController _nameController;
  late final TextEditingController _descriptionController;
  late final TextEditingController _piecesController;
  late final TextEditingController _bulkController;
  late final TextEditingController _ratioController;
  late final TextEditingController _costPieceController;
  late final TextEditingController _costBulkController;
  late final TextEditingController _productPriceController;

  late final String _initialName;
  late final String _initialDescription;
  late final String _initialPiecesText;
  late final String _initialBulkText;
  late final String _initialRatioText;
  late final String _initialCostPieceText;
  late final String _initialCostBulkText;
  late final String _initialProductPriceText;
  late final IconData _initialItemPictureIcon;
  late final bool _initialSoldAsProduct;

  late IconData _itemPictureIcon;
  late bool _soldAsProduct;
  bool _allowPop = false;
  bool _showValidationHighlights = false;
  bool _nameBlurred = false;
  bool _descriptionBlurred = false;
  bool _piecesBlurred = false;
  bool _bulkBlurred = false;
  bool _ratioBlurred = false;
  bool _costPieceBlurred = false;
  bool _costBulkBlurred = false;
  bool _productPriceBlurred = false;

  @override
  void initState() {
    super.initState();
    final sku = widget.initialSku;
    _initialName = sku.name;
    _initialDescription = sku.description;
    _initialPiecesText = sku.pieces.toString();
    _initialBulkText = sku.bulk.toString();
    _initialRatioText = sku.piecesPerBulk.toString();
    _initialCostPieceText = _trimNumber(sku.costPerPiece);
    _initialCostBulkText = _trimNumber(sku.costPerBulk);
    _initialProductPriceText = sku.productPrice == null
        ? ''
        : _trimNumber(sku.productPrice!);
    _initialItemPictureIcon = sku.itemPictureIcon;
    _initialSoldAsProduct = sku.soldAsProduct;
    _nameController = TextEditingController(text: _initialName);
    _descriptionController = TextEditingController(text: _initialDescription);
    _piecesController = TextEditingController(text: _initialPiecesText);
    _bulkController = TextEditingController(text: _initialBulkText);
    _ratioController = TextEditingController(text: _initialRatioText);
    _costPieceController = TextEditingController(text: _initialCostPieceText);
    _costBulkController = TextEditingController(text: _initialCostBulkText);
    _productPriceController = TextEditingController(
      text: _initialProductPriceText,
    );
    _itemPictureIcon = sku.itemPictureIcon;
    _soldAsProduct = sku.soldAsProduct;
  }

  @override
  void dispose() {
    _nameController.dispose();
    _descriptionController.dispose();
    _piecesController.dispose();
    _bulkController.dispose();
    _ratioController.dispose();
    _costPieceController.dispose();
    _costBulkController.dispose();
    _productPriceController.dispose();
    super.dispose();
  }

  List<String> get _validationErrors {
    final errors = <String>[];
    final piecesRaw = _piecesController.text.trim();
    final bulkRaw = _bulkController.text.trim();
    final ratioRaw = _ratioController.text.trim();
    final costPieceRaw = _costPieceController.text.trim();
    final costBulkRaw = _costBulkController.text.trim();
    final productPriceRaw = _productPriceController.text.trim();
    final pieces = _piecesValue;
    final bulk = _bulkValue;
    final ratio = _ratioValue;
    final costPiece = _costPieceValue;
    final costBulk = _costBulkValue;
    final productPrice = _productPriceValue;

    if (_nameController.text.trim().isEmpty) {
      errors.add('Name field is required.');
    }
    if (_descriptionController.text.trim().isEmpty) {
      errors.add('Description field is required.');
    }
    if (piecesRaw.isEmpty) {
      errors.add('Pieces field is required.');
    } else if (pieces == null) {
      errors.add(
        'Pieces field must be a valid whole number (no symbols or letters).',
      );
    } else if (pieces < 0) {
      errors.add('Pieces field cannot be negative.');
    }
    if (bulkRaw.isEmpty) {
      errors.add('Bulk field is required.');
    } else if (bulk == null) {
      errors.add(
        'Bulk field must be a valid whole number (no symbols or letters).',
      );
    } else if (bulk < 0) {
      errors.add('Bulk field cannot be negative.');
    }
    if (ratioRaw.isEmpty) {
      errors.add('Pieces / Bulk field is required.');
    } else if (ratio == null) {
      errors.add(
        'Pieces / Bulk field must be a valid whole number (no symbols or letters).',
      );
    } else if (ratio <= 0) {
      errors.add('Pieces / Bulk field must be greater than 0.');
    }
    if (costPieceRaw.isEmpty) {
      errors.add('Cost / Piece field is required.');
    } else if (costPiece == null) {
      errors.add(
        'Cost / Piece field must be a valid number (no symbols or letters).',
      );
    } else if (costPiece < 0) {
      errors.add('Cost / Piece field cannot be negative.');
    }
    if (costBulkRaw.isEmpty) {
      errors.add('Cost / Bulk field is required.');
    } else if (costBulk == null) {
      errors.add(
        'Cost / Bulk field must be a valid number (no symbols or letters).',
      );
    } else if (costBulk < 0) {
      errors.add('Cost / Bulk field cannot be negative.');
    }
    if (_soldAsProduct) {
      if (productPriceRaw.isEmpty) {
        errors.add('Product Price field is required.');
      } else if (productPrice == null) {
        errors.add(
          'Product Price field must be a valid number (no symbols or letters).',
        );
      } else if (productPrice < 0) {
        errors.add('Product Price field cannot be negative.');
      }
    }
    return errors;
  }

  bool get _isValid => _validationErrors.isEmpty;
  bool get _nameHasError => _nameController.text.trim().isEmpty;
  bool get _descriptionHasError => _descriptionController.text.trim().isEmpty;
  int? get _piecesValue => _tryInt(_piecesController.text);
  int? get _bulkValue => _tryInt(_bulkController.text);
  int? get _ratioValue => _tryInt(_ratioController.text);
  double? get _costPieceValue => _tryDouble(_costPieceController.text);
  double? get _costBulkValue => _tryDouble(_costBulkController.text);
  double? get _productPriceValue => _tryDouble(_productPriceController.text);

  bool get _piecesHasError {
    final raw = _piecesController.text.trim();
    final parsed = _piecesValue;
    return raw.isEmpty || parsed == null || parsed < 0;
  }

  bool get _bulkHasError {
    final raw = _bulkController.text.trim();
    final parsed = _bulkValue;
    return raw.isEmpty || parsed == null || parsed < 0;
  }

  bool get _ratioHasError {
    final raw = _ratioController.text.trim();
    final parsed = _ratioValue;
    return raw.isEmpty || parsed == null || parsed <= 0;
  }

  bool get _costPieceHasError {
    final raw = _costPieceController.text.trim();
    final parsed = _costPieceValue;
    return raw.isEmpty || parsed == null || parsed < 0;
  }

  bool get _costBulkHasError {
    final raw = _costBulkController.text.trim();
    final parsed = _costBulkValue;
    return raw.isEmpty || parsed == null || parsed < 0;
  }

  bool get _productPriceHasError =>
      _soldAsProduct &&
      (_productPriceController.text.trim().isEmpty ||
          _productPriceValue == null ||
          _productPriceValue! < 0);

  bool get _hasChanges =>
      _nameController.text != _initialName ||
      _descriptionController.text != _initialDescription ||
      _piecesController.text != _initialPiecesText ||
      _bulkController.text != _initialBulkText ||
      _ratioController.text != _initialRatioText ||
      _costPieceController.text != _initialCostPieceText ||
      _costBulkController.text != _initialCostBulkText ||
      _productPriceController.text != _initialProductPriceText ||
      _itemPictureIcon != _initialItemPictureIcon ||
      _soldAsProduct != _initialSoldAsProduct;

  @override
  Widget build(BuildContext context) {
    final edge = AppThemeTokens.screenEdgePadding(context);
    final bottomInset = MediaQuery.viewPaddingOf(context).bottom;
    final pieceCount = _piecesValue;
    final bulkCount = _bulkValue;
    final costPerPiece = _costPieceValue;
    final costPerBulk = _costBulkValue;
    final total =
        (((pieceCount != null && pieceCount > 0) ? pieceCount : 0) *
                    ((costPerPiece != null && costPerPiece > 0)
                        ? costPerPiece
                        : 0) +
                ((bulkCount != null && bulkCount > 0) ? bulkCount : 0) *
                    ((costPerBulk != null && costPerBulk > 0)
                        ? costPerBulk
                        : 0))
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
                onBack: _onBackPressed,
                onCancel: _resetChanges,
                onSave: _save,
                hasChanges: _hasChanges,
                isValid: _isValid,
              ),
              const SizedBox(height: AppThemeTokens.space3),
              Expanded(
                child: ListView(
                  padding: EdgeInsets.only(
                    bottom: bottomInset + AppThemeTokens.space8,
                  ),
                  children: [
                    _MediaPlaceholderCard(itemPictureIcon: _itemPictureIcon),
                    const SizedBox(height: AppThemeTokens.space4),
                    _FieldEditor(
                      label: 'Name',
                      controller: _nameController,
                      maxLength: 80,
                      hintText: 'Enter SKU name',
                      hasError:
                          (_showValidationHighlights || _nameBlurred) &&
                          _nameHasError,
                      onTapOutside: () => setState(() => _nameBlurred = true),
                      onChanged: (_) => setState(() {}),
                    ),
                    const SizedBox(height: AppThemeTokens.space4),
                    _FieldEditor(
                      label: 'Description',
                      controller: _descriptionController,
                      maxLines: 4,
                      maxLength: 250,
                      hintText: 'Describe this SKU',
                      hasError:
                          (_showValidationHighlights || _descriptionBlurred) &&
                          _descriptionHasError,
                      onTapOutside: () =>
                          setState(() => _descriptionBlurred = true),
                      onChanged: (_) => setState(() {}),
                    ),
                    const SizedBox(height: AppThemeTokens.space4),
                    Row(
                      children: [
                        Expanded(
                          child: _FieldEditor(
                            label: 'Pieces',
                            controller: _piecesController,
                            hintText: 'Enter pieces count',
                            keyboardType: const TextInputType.numberWithOptions(
                              signed: false,
                            ),
                            hasError:
                                (_showValidationHighlights || _piecesBlurred) &&
                                _piecesHasError,
                            onTapOutside: () =>
                                setState(() => _piecesBlurred = true),
                            onChanged: (_) => setState(() {}),
                          ),
                        ),
                        const SizedBox(width: AppThemeTokens.space2),
                        Expanded(
                          child: _FieldEditor(
                            label: 'Bulk',
                            controller: _bulkController,
                            hintText: 'Enter bulk count',
                            keyboardType: const TextInputType.numberWithOptions(
                              signed: false,
                            ),
                            hasError:
                                (_showValidationHighlights || _bulkBlurred) &&
                                _bulkHasError,
                            onTapOutside: () =>
                                setState(() => _bulkBlurred = true),
                            onChanged: (_) => setState(() {}),
                          ),
                        ),
                        const SizedBox(width: AppThemeTokens.space2),
                        Expanded(
                          child: _FieldEditor(
                            label: 'Pieces / Bulk',
                            controller: _ratioController,
                            hintText: 'Enter pieces per bulk',
                            keyboardType: const TextInputType.numberWithOptions(
                              signed: false,
                            ),
                            hasError:
                                (_showValidationHighlights || _ratioBlurred) &&
                                _ratioHasError,
                            onTapOutside: () =>
                                setState(() => _ratioBlurred = true),
                            onChanged: (_) => setState(() {}),
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: AppThemeTokens.space4),
                    ValueListenableBuilder<AppCurrency>(
                      valueListenable: context.currencyController,
                      builder: (_, currency, __) {
                        return Row(
                          children: [
                            Expanded(
                              child: _ReadOnlyField(
                                label: 'Total Value',
                                value: _currencyLabel(
                                  total,
                                  currencyCode: currency.code,
                                ),
                              ),
                            ),
                            const SizedBox(width: AppThemeTokens.space2),
                            Expanded(
                              child: _CurrencyFieldEditor(
                                label: 'Cost / Piece',
                                controller: _costPieceController,
                                hintText: 'e.g. 4.50',
                                currencyCode: currency.code,
                                hasError:
                                    (_showValidationHighlights ||
                                        _costPieceBlurred) &&
                                    _costPieceHasError,
                                onTapOutside: () =>
                                    setState(() => _costPieceBlurred = true),
                                onChanged: (_) => setState(() {}),
                              ),
                            ),
                          ],
                        );
                      },
                    ),
                    const SizedBox(height: AppThemeTokens.space4),
                    ValueListenableBuilder<AppCurrency>(
                      valueListenable: context.currencyController,
                      builder: (_, currency, __) {
                        return _CurrencyFieldEditor(
                          label: 'Cost / Bulk',
                          controller: _costBulkController,
                          hintText: 'e.g. 40.00',
                          currencyCode: currency.code,
                          hasError:
                              (_showValidationHighlights || _costBulkBlurred) &&
                              _costBulkHasError,
                          onTapOutside: () =>
                              setState(() => _costBulkBlurred = true),
                          onChanged: (_) => setState(() {}),
                        );
                      },
                    ),
                    const SizedBox(height: AppThemeTokens.space4),
                    Card(
                      margin: EdgeInsets.zero,
                      child: Padding(
                        padding: const EdgeInsets.all(AppThemeTokens.space3),
                        child: Column(
                          children: [
                            CheckboxListTile(
                              value: _soldAsProduct,
                              onChanged: (value) {
                                if (value == null) {
                                  return;
                                }
                                setState(() {
                                  _soldAsProduct = value;
                                  if (!_soldAsProduct) {
                                    _productPriceBlurred = false;
                                  }
                                });
                              },
                              controlAffinity: ListTileControlAffinity.leading,
                              contentPadding: EdgeInsets.zero,
                              title: Text(
                                'Sold as a Product?',
                                style: Theme.of(context).textTheme.bodyLarge
                                    ?.copyWith(
                                      fontWeight: _fontWeight(
                                        AppThemeTokens.fontWeightSemibold,
                                      ),
                                    ),
                              ),
                            ),
                            ValueListenableBuilder<AppCurrency>(
                              valueListenable: context.currencyController,
                              builder: (_, currency, __) {
                                return _CurrencyFieldEditor(
                                  label: 'Product Price',
                                  controller: _productPriceController,
                                  hintText: 'e.g. 12.00',
                                  currencyCode: currency.code,
                                  enabled: _soldAsProduct,
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
                          ],
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
      _piecesController.text = _initialPiecesText;
      _bulkController.text = _initialBulkText;
      _ratioController.text = _initialRatioText;
      _costPieceController.text = _initialCostPieceText;
      _costBulkController.text = _initialCostBulkText;
      _productPriceController.text = _initialProductPriceText;
      _itemPictureIcon = _initialItemPictureIcon;
      _soldAsProduct = _initialSoldAsProduct;
      _showValidationHighlights = false;
      _nameBlurred = false;
      _descriptionBlurred = false;
      _piecesBlurred = false;
      _bulkBlurred = false;
      _ratioBlurred = false;
      _costPieceBlurred = false;
      _costBulkBlurred = false;
      _productPriceBlurred = false;
    });
  }

  void _save() {
    if (!_isValid) {
      return;
    }
    final updated = widget.initialSku.copyWith(
      name: _nameController.text.trim(),
      itemPictureIcon: _itemPictureIcon,
      description: _descriptionController.text.trim(),
      pieces: _piecesValue ?? 0,
      bulk: _bulkValue ?? 0,
      piecesPerBulk: (_ratioValue ?? 1).clamp(1, 100000),
      costPerPiece: _costPieceValue ?? 0,
      costPerBulk: _costBulkValue ?? 0,
      soldAsProduct: _soldAsProduct,
      productPrice: _soldAsProduct ? _productPriceValue : null,
      clearProductPrice: !_soldAsProduct,
    );
    setState(() => _allowPop = true);
    Navigator.of(context).pop(updated);
  }
}

class _CurrencyFieldEditor extends StatelessWidget {
  const _CurrencyFieldEditor({
    required this.label,
    required this.controller,
    required this.currencyCode,
    this.hintText,
    this.enabled = true,
    this.hasError = false,
    this.onTapOutside,
    this.onChanged,
  });

  final String label;
  final TextEditingController controller;
  final String currencyCode;
  final String? hintText;
  final bool enabled;
  final bool hasError;
  final VoidCallback? onTapOutside;
  final ValueChanged<String>? onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: AppThemeTokens.space1),
        TextField(
          controller: controller,
          enabled: enabled,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          onChanged: onChanged,
          onTapOutside: (_) {
            FocusManager.instance.primaryFocus?.unfocus();
            onChanged?.call(controller.text);
            onTapOutside?.call();
          },
          decoration: _buildDecoration(
            InputDecoration(
              hintText: hintText ?? label,
              suffix: Padding(
                padding: const EdgeInsets.only(left: AppThemeTokens.space3),
                child: Text(
                  currencyCode,
                  style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                    color: AppThemeTokens.textSecondary,
                    fontWeight: _fontWeight(AppThemeTokens.fontWeightSemibold),
                  ),
                ),
              ),
            ),
          ),
        ),
      ],
    );
  }

  InputDecoration _buildDecoration(InputDecoration decoration) {
    if (!hasError) {
      return decoration;
    }

    final errorBorder = OutlineInputBorder(
      borderRadius: BorderRadius.circular(AppThemeTokens.radiusMd),
      borderSide: const BorderSide(color: AppThemeTokens.error),
    );
    return decoration.copyWith(
      border: errorBorder,
      enabledBorder: errorBorder,
      focusedBorder: errorBorder,
    );
  }
}
