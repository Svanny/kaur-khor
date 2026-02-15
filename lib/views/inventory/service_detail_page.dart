part of '../inventory_views.dart';

class ServiceDetailPage extends StatefulWidget {
  const ServiceDetailPage({
    required this.initialService,
    required this.availableSkus,
    super.key,
  });

  final ServiceItem initialService;
  final List<SkuItem> availableSkus;

  @override
  State<ServiceDetailPage> createState() => _ServiceDetailPageState();
}

class _ServiceDetailPageState extends State<ServiceDetailPage> {
  late final TextEditingController _nameController;
  late final TextEditingController _descriptionController;
  late final TextEditingController _priceController;
  late IconData _itemPictureIcon;
  late Set<String> _selectedSkuIds;
  late final String _initialName;
  late final String _initialDescription;
  late final String _initialPriceText;
  late final IconData _initialItemPictureIcon;
  late final Set<String> _initialSkuIds;
  bool _allowPop = false;
  bool _showValidationHighlights = false;
  bool _nameBlurred = false;
  bool _descriptionBlurred = false;
  bool _priceBlurred = false;

  @override
  void initState() {
    super.initState();
    final service = widget.initialService;
    _initialName = service.name;
    _initialDescription = service.description;
    _initialPriceText = _trimNumber(service.price);
    _initialItemPictureIcon = service.itemPictureIcon;
    _initialSkuIds = Set<String>.of(service.skuIds);
    _nameController = TextEditingController(text: service.name);
    _descriptionController = TextEditingController(text: service.description);
    _priceController = TextEditingController(text: _initialPriceText);
    _itemPictureIcon = service.itemPictureIcon;
    _selectedSkuIds = Set<String>.of(_initialSkuIds);
  }

  @override
  void dispose() {
    _nameController.dispose();
    _descriptionController.dispose();
    _priceController.dispose();
    super.dispose();
  }

  List<String> get _validationErrors {
    final errors = <String>[];
    final name = _nameController.text.trim();
    final description = _descriptionController.text.trim();
    final priceRaw = _priceController.text.trim();
    final parsedPrice = _tryDouble(_priceController.text);

    if (name.isEmpty) {
      errors.add('Name field is required.');
    }
    if (description.isEmpty) {
      errors.add('Description field is required.');
    }
    if (priceRaw.isEmpty) {
      errors.add('Price field is required.');
    } else if (parsedPrice == null) {
      errors.add('Price field must be a valid number (no symbols or letters).');
    } else if (parsedPrice < 0) {
      errors.add('Price field cannot be negative.');
    }
    if (_selectedSkuIds.isEmpty) {
      errors.add('Select at least one SKU.');
    }

    return errors;
  }

  bool get _isValid => _validationErrors.isEmpty;
  bool get _nameHasError => _nameController.text.trim().isEmpty;
  bool get _descriptionHasError => _descriptionController.text.trim().isEmpty;
  bool get _priceHasError {
    final priceRaw = _priceController.text.trim();
    final parsedPrice = _tryDouble(_priceController.text);
    return priceRaw.isEmpty || parsedPrice == null || parsedPrice < 0;
  }

  bool get _skusHasError => _selectedSkuIds.isEmpty;

  bool get _hasChanges {
    final skuSelectionUnchanged =
        _selectedSkuIds.length == _initialSkuIds.length &&
        _selectedSkuIds.containsAll(_initialSkuIds);
    return _nameController.text != _initialName ||
        _descriptionController.text != _initialDescription ||
        _priceController.text != _initialPriceText ||
        _itemPictureIcon != _initialItemPictureIcon ||
        !skuSelectionUnchanged;
  }

  @override
  Widget build(BuildContext context) {
    final edge = AppThemeTokens.screenEdgePadding(context);
    final bottomInset = MediaQuery.viewPaddingOf(context).bottom;
    final selectedSkus = widget.availableSkus
        .where((sku) => _selectedSkuIds.contains(sku.id))
        .toList(growable: false);

    return PopScope<ServiceItem>(
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
                    ? 'Service'
                    : _nameController.text.trim(),
                onBack: _onBackPressed,
                onCancel: _resetChanges,
                onSave: _save,
                hasChanges: _hasChanges,
                isValid: _isValid,
              ),
              const SizedBox(height: AppThemeTokens.headerToContentGap),
              Expanded(
                child: ListView(
                  padding: EdgeInsets.only(
                    bottom:
                        bottomInset + AppThemeTokens.scrollBottomReservePrimary,
                  ),
                  children: [
                    _MediaPlaceholderCard(itemPictureIcon: _itemPictureIcon),
                    const SizedBox(height: AppThemeTokens.sectionGap),
                    _FieldEditor(
                      label: 'Name',
                      controller: _nameController,
                      maxLength: 80,
                      hintText: 'Enter service name',
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
                      maxLines: 4,
                      maxLength: 250,
                      hintText: 'Describe this service',
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
                        return _CurrencyFieldWithCode(
                          label: 'Price',
                          controller: _priceController,
                          currencyCode: currency.code,
                          hintText: 'e.g. 1200.00',
                          hasError:
                              (_showValidationHighlights || _priceBlurred) &&
                              _priceHasError,
                          onTapOutside: () =>
                              setState(() => _priceBlurred = true),
                          onChanged: (_) => setState(() {}),
                        );
                      },
                    ),
                    const SizedBox(height: AppThemeTokens.sectionGap),
                    Text(
                      'SKUs Used',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: AppThemeTokens.sectionCardOuterGap),
                    Card(
                      margin: EdgeInsets.zero,
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(
                          AppThemeTokens.radiusMd,
                        ),
                        side: BorderSide(
                          color: _showValidationHighlights && _skusHasError
                              ? AppThemeTokens.error
                              : AppThemeTokens.border,
                        ),
                      ),
                      child: InkWell(
                        borderRadius: BorderRadius.circular(
                          AppThemeTokens.radiusMd,
                        ),
                        onTap: _editSkuSelection,
                        child: Padding(
                          padding: const EdgeInsets.all(
                            AppThemeTokens.cardContentGap,
                          ),
                          child: selectedSkus.isEmpty
                              ? Text(
                                  'Tap to choose SKUs',
                                  style: Theme.of(context).textTheme.bodyMedium,
                                )
                              : Wrap(
                                  spacing: AppThemeTokens.wrapSpacing,
                                  runSpacing: AppThemeTokens.wrapRunSpacing,
                                  children: selectedSkus
                                      .map(
                                        (sku) => Chip(
                                          backgroundColor:
                                              AppThemeTokens.chipBackground,
                                          side: BorderSide.none,
                                          materialTapTargetSize:
                                              MaterialTapTargetSize.shrinkWrap,
                                          visualDensity: VisualDensity.compact,
                                          shape: const RoundedRectangleBorder(
                                            borderRadius: BorderRadius.all(
                                              Radius.circular(
                                                AppThemeTokens.radiusPill,
                                              ),
                                            ),
                                            side: BorderSide.none,
                                          ),
                                          padding: const EdgeInsets.symmetric(
                                            horizontal: AppThemeTokens
                                                .inventoryChipPadX,
                                            vertical: AppThemeTokens
                                                .inventoryChipPadY,
                                          ),
                                          label: Text(
                                            sku.name,
                                            style: Theme.of(context)
                                                .textTheme
                                                .bodyMedium
                                                ?.copyWith(
                                                  color: AppThemeTokens
                                                      .textPrimary,
                                                ),
                                          ),
                                        ),
                                      )
                                      .toList(growable: false),
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
      _priceController.text = _initialPriceText;
      _itemPictureIcon = _initialItemPictureIcon;
      _selectedSkuIds = Set<String>.of(_initialSkuIds);
      _showValidationHighlights = false;
      _nameBlurred = false;
      _descriptionBlurred = false;
      _priceBlurred = false;
    });
  }

  Future<void> _editSkuSelection() async {
    FocusScope.of(context).unfocus();
    final selected = await showModalBottomSheet<Set<String>>(
      context: context,
      isScrollControlled: true,
      useSafeArea: true,
      showDragHandle: true,
      backgroundColor: AppThemeTokens.modalSheetBackground,
      builder: (_) => SizedBox(
        height: MediaQuery.sizeOf(context).height * 0.82,
        child: SkuUsedSelectorPage(
          skus: widget.availableSkus,
          selectedSkuIds: _selectedSkuIds,
        ),
      ),
    );
    if (selected == null) {
      return;
    }
    setState(() => _selectedSkuIds = selected);
  }

  void _save() {
    if (!_isValid) {
      return;
    }
    final updated = widget.initialService.copyWith(
      name: _nameController.text.trim(),
      itemPictureIcon: _itemPictureIcon,
      description: _descriptionController.text.trim(),
      price: _tryDouble(_priceController.text) ?? 0,
      skuIds: _selectedSkuIds,
    );
    setState(() => _allowPop = true);
    Navigator.of(context).pop(updated);
  }
}

class SkuUsedSelectorPage extends StatefulWidget {
  const SkuUsedSelectorPage({
    required this.skus,
    required this.selectedSkuIds,
    super.key,
  });

  final List<SkuItem> skus;
  final Set<String> selectedSkuIds;

  @override
  State<SkuUsedSelectorPage> createState() => _SkuUsedSelectorPageState();
}

class _SkuUsedSelectorPageState extends State<SkuUsedSelectorPage> {
  final TextEditingController _searchController = TextEditingController();
  late final Set<String> _initialSelectedSkuIds;
  late Set<String> _selectedSkuIds;
  bool _allowPop = false;

  bool get _hasSelectionChanges =>
      _selectedSkuIds.length != _initialSelectedSkuIds.length ||
      !_selectedSkuIds.containsAll(_initialSelectedSkuIds);

  @override
  void initState() {
    super.initState();
    _initialSelectedSkuIds = Set<String>.of(widget.selectedSkuIds);
    _selectedSkuIds = Set<String>.of(_initialSelectedSkuIds);
  }

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final edge = AppThemeTokens.screenEdgePadding(context);
    final bottomInset = MediaQuery.viewPaddingOf(context).bottom;
    final query = _searchController.text.trim().toLowerCase();
    final visibleSkus = widget.skus
        .where((sku) => sku.name.toLowerCase().contains(query))
        .toList(growable: false);

    return PopScope<Set<String>>(
      canPop: _allowPop || !_hasSelectionChanges,
      onPopInvokedWithResult: (didPop, _) {
        if (didPop || !_hasSelectionChanges) {
          return;
        }
        unawaited(_onBackPressed());
      },
      child: Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: Material(
          color: AppThemeTokens.modalSheetBackground,
          child: Padding(
            padding: EdgeInsets.fromLTRB(edge.left, 0, edge.right, 0),
            child: Column(
              children: [
                buildSaveChangeHeader(
                  title: 'SKUs Used',
                  onBack: _onBackPressed,
                  onCancel: _resetSelection,
                  onSave: _saveSelection,
                  hasChanges: _hasSelectionChanges,
                  isValid: true,
                  backIcon: Icons.close,
                ),
                const SizedBox(height: AppThemeTokens.headerToContentGap),
                _SearchField(
                  controller: _searchController,
                  hintText: 'Search SKUs by name',
                  onChanged: (_) => setState(() {}),
                ),
                const SizedBox(height: AppThemeTokens.headerToContentGap),
                Expanded(
                  child: ListView.separated(
                    padding: EdgeInsets.only(
                      bottom:
                          bottomInset +
                          AppThemeTokens.scrollBottomReservePrimary,
                    ),
                    itemCount: visibleSkus.length,
                    separatorBuilder: (_, __) => const SizedBox(
                      height: AppThemeTokens.headerToContentGap,
                    ),
                    itemBuilder: (_, index) {
                      final sku = visibleSkus[index];
                      final selected = _selectedSkuIds.contains(sku.id);
                      return Card(
                        color: AppThemeTokens.surface,
                        margin: EdgeInsets.zero,
                        shape: const RoundedRectangleBorder(
                          borderRadius: BorderRadius.all(
                            Radius.circular(AppThemeTokens.radiusMd),
                          ),
                          side: BorderSide(color: AppThemeTokens.border),
                        ),
                        child: CheckboxListTile(
                          value: selected,
                          onChanged: (value) {
                            if (value == null) {
                              return;
                            }
                            setState(() {
                              if (value) {
                                _selectedSkuIds.add(sku.id);
                              } else {
                                _selectedSkuIds.remove(sku.id);
                              }
                            });
                          },
                          title: Text(sku.name),
                          subtitle: Text(
                            '${sku.pieces} pieces · ${sku.bulk} bulk',
                            style: Theme.of(context).textTheme.bodyMedium,
                          ),
                          checkboxScaleFactor: 1.0,
                          controlAffinity: ListTileControlAffinity.leading,
                        ),
                      );
                    },
                  ),
                ),
              ],
            ),
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
    if (!_hasSelectionChanges) {
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
      _saveSelection();
      return false;
    }
    return choice == UnsavedExitAction.discard;
  }

  void _popWithoutSaving() {
    setState(() => _allowPop = true);
    Navigator.of(context).pop();
  }

  void _saveSelection() {
    setState(() => _allowPop = true);
    Navigator.of(context).pop(_selectedSkuIds);
  }

  void _resetSelection() {
    setState(() => _selectedSkuIds = Set<String>.of(_initialSelectedSkuIds));
  }
}
