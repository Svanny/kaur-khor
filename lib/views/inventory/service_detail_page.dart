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
              _DetailHeader(
                title: _nameController.text.trim().isEmpty
                    ? 'Service'
                    : _nameController.text.trim(),
                onBack: _onBackPressed,
                onCancel: _resetChanges,
                onSave: _hasChanges && _isValid ? _save : null,
                showActions: _hasChanges,
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
                      hintText: 'Enter service name',
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
                      hintText: 'Describe this service',
                      hasError:
                          (_showValidationHighlights || _descriptionBlurred) &&
                          _descriptionHasError,
                      onTapOutside: () =>
                          setState(() => _descriptionBlurred = true),
                      onChanged: (_) => setState(() {}),
                    ),
                    const SizedBox(height: AppThemeTokens.space4),
                    ValueListenableBuilder<AppCurrency>(
                      valueListenable: context.currencyController,
                      builder: (_, currency, __) {
                        return _PriceFieldWithCurrency(
                          controller: _priceController,
                          currencyCode: currency.code,
                          hasError:
                              (_showValidationHighlights || _priceBlurred) &&
                              _priceHasError,
                          onTapOutside: () =>
                              setState(() => _priceBlurred = true),
                          onChanged: (_) => setState(() {}),
                        );
                      },
                    ),
                    const SizedBox(height: AppThemeTokens.space4),
                    Text(
                      'SKUs Used',
                      style: Theme.of(context).textTheme.titleMedium,
                    ),
                    const SizedBox(height: AppThemeTokens.space2),
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
                          padding: const EdgeInsets.all(AppThemeTokens.space3),
                          child: selectedSkus.isEmpty
                              ? Text(
                                  'Tap to choose SKUs',
                                  style: Theme.of(context).textTheme.bodyMedium,
                                )
                              : Wrap(
                                  spacing: AppThemeTokens.space2,
                                  runSpacing: AppThemeTokens.space2,
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
                                            horizontal:
                                                AppThemeTokens.chipPaddingX -
                                                AppThemeTokens.space1,
                                            vertical:
                                                AppThemeTokens.chipPaddingY -
                                                AppThemeTokens.space1,
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
    if (choice == _UnsavedServiceChangesAction.confirm) {
      if (!_isValid) {
        setState(() => _showValidationHighlights = true);
        return false;
      }
      _save();
      return false;
    }
    return choice == _UnsavedServiceChangesAction.discard;
  }

  void _popWithoutSaving() {
    setState(() => _allowPop = true);
    Navigator.of(context).pop();
  }

  Future<_UnsavedServiceChangesAction?> _showUnsavedChangesDialog() {
    return showGeneralDialog<_UnsavedServiceChangesAction>(
      context: context,
      barrierDismissible: false,
      barrierLabel: 'Dismiss unsaved changes',
      barrierColor: Colors.transparent,
      transitionDuration: Duration.zero,
      pageBuilder: (_, __, ___) => _UnsavedChangesPopup(
        isValid: _isValid,
        validationErrors: _validationErrors,
      ),
      transitionBuilder: (_, __, ___, child) => child,
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
    final selected = await Navigator.of(context).push<Set<String>>(
      MaterialPageRoute(
        builder: (_) => SkuUsedSelectorPage(
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

enum _UnsavedServiceChangesAction { confirm, discard, goBack }

class _UnsavedChangesPopup extends StatelessWidget {
  const _UnsavedChangesPopup({
    required this.isValid,
    required this.validationErrors,
  });

  final bool isValid;
  final List<String> validationErrors;

  @override
  Widget build(BuildContext context) {
    final width = math
        .min(
          MediaQuery.sizeOf(context).width - (AppThemeTokens.space6 * 2),
          360,
        )
        .toDouble();
    final titleStyle = Theme.of(context).textTheme.titleMedium?.copyWith(
      color: AppThemeTokens.textPrimary,
      fontWeight: _fontWeight(AppThemeTokens.fontWeightSemibold),
    );
    final bodyStyle = Theme.of(
      context,
    ).textTheme.bodyLarge?.copyWith(color: AppThemeTokens.textSecondary);
    final actionStyle = Theme.of(context).textTheme.bodyLarge?.copyWith(
      fontWeight: _fontWeight(AppThemeTokens.fontWeightSemibold),
    );
    final isInvalidVariant = !isValid;
    final title = isInvalidVariant ? 'Invalid fields' : 'Unsaved changes';
    final message = isInvalidVariant
        ? validationErrors.join('\n')
        : 'You have unsaved changes. Confirm to keep them or discard to exit.';

    return Material(
      color: Colors.transparent,
      child: Stack(
        children: [
          Positioned.fill(
            child: GestureDetector(
              behavior: HitTestBehavior.opaque,
              onTap: () => Navigator.of(context).pop(),
              child: ColoredBox(
                color: Colors.black.withValues(alpha: 0.55),
                child: const SizedBox.expand(),
              ),
            ),
          ),
          Center(
            child: GestureDetector(
              onTap: () {},
              child: Container(
                width: width,
                decoration: BoxDecoration(
                  color: AppThemeTokens.surface,
                  borderRadius: BorderRadius.circular(32),
                ),
                child: Padding(
                  padding: const EdgeInsets.all(AppThemeTokens.space6),
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: titleStyle),
                      const SizedBox(height: AppThemeTokens.space3),
                      Text(message, style: bodyStyle),
                      const SizedBox(height: AppThemeTokens.space6),
                      Row(
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          TextButton(
                            onPressed: () => Navigator.of(
                              context,
                            ).pop(_UnsavedServiceChangesAction.discard),
                            style: TextButton.styleFrom(
                              foregroundColor: AppThemeTokens.primary,
                              padding: const EdgeInsets.symmetric(
                                horizontal: AppThemeTokens.buttonPaddingX,
                                vertical: AppThemeTokens.buttonPaddingY,
                              ),
                            ),
                            child: Text(
                              'Discard',
                              style: actionStyle?.copyWith(
                                color: AppThemeTokens.primary,
                              ),
                            ),
                          ),
                          const SizedBox(width: AppThemeTokens.space2),
                          FilledButton(
                            onPressed: () => Navigator.of(context).pop(
                              isInvalidVariant
                                  ? _UnsavedServiceChangesAction.goBack
                                  : _UnsavedServiceChangesAction.confirm,
                            ),
                            style: FilledButton.styleFrom(
                              foregroundColor: AppThemeTokens.white,
                              shape: const StadiumBorder(),
                              padding: const EdgeInsets.symmetric(
                                horizontal: AppThemeTokens.buttonPaddingX,
                                vertical: AppThemeTokens.buttonPaddingY,
                              ),
                            ),
                            child: Text(
                              isInvalidVariant ? 'Go Back' : 'Confirm',
                              style: actionStyle?.copyWith(
                                color: AppThemeTokens.white,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _PriceFieldWithCurrency extends StatelessWidget {
  const _PriceFieldWithCurrency({
    required this.controller,
    required this.currencyCode,
    this.hasError = false,
    this.onTapOutside,
    this.onChanged,
  });

  final TextEditingController controller;
  final String currencyCode;
  final bool hasError;
  final VoidCallback? onTapOutside;
  final ValueChanged<String>? onChanged;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Price', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: AppThemeTokens.space1),
        TextField(
          controller: controller,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          onChanged: onChanged,
          onTapOutside: (_) {
            FocusManager.instance.primaryFocus?.unfocus();
            onChanged?.call(controller.text);
            onTapOutside?.call();
          },
          decoration: _buildDecoration(
            context,
            InputDecoration(
              hintText: 'e.g. 1200.00',
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

  InputDecoration _buildDecoration(
    BuildContext context,
    InputDecoration decoration,
  ) {
    if (!hasError) {
      return decoration;
    }
    final errorBorder = OutlineInputBorder(
      borderRadius: BorderRadius.circular(AppThemeTokens.radiusMd),
      borderSide: const BorderSide(color: AppThemeTokens.error),
    );
    return decoration.copyWith(
      enabledBorder: errorBorder,
      focusedBorder: errorBorder,
      border: errorBorder,
    );
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
  late Set<String> _selectedSkuIds;

  @override
  void initState() {
    super.initState();
    _selectedSkuIds = Set<String>.of(widget.selectedSkuIds);
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

    return Scaffold(
      body: Padding(
        padding: EdgeInsets.fromLTRB(edge.left, edge.top, edge.right, 0),
        child: Column(
          children: [
            _DetailHeader(
              title: 'SKUs Used',
              onBack: () => Navigator.of(context).pop(),
              onCancel: () => Navigator.of(context).pop(),
              onSave: () => Navigator.of(context).pop(_selectedSkuIds),
            ),
            const SizedBox(height: AppThemeTokens.space3),
            _SearchField(
              controller: _searchController,
              hintText: 'Search SKUs by name',
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: AppThemeTokens.space3),
            Expanded(
              child: ListView.separated(
                padding: EdgeInsets.only(
                  bottom: bottomInset + AppThemeTokens.space8,
                ),
                itemCount: visibleSkus.length,
                separatorBuilder: (_, __) =>
                    const SizedBox(height: AppThemeTokens.space2),
                itemBuilder: (_, index) {
                  final sku = visibleSkus[index];
                  final selected = _selectedSkuIds.contains(sku.id);
                  return Card(
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
                      controlAffinity: ListTileControlAffinity.leading,
                      contentPadding: const EdgeInsets.symmetric(
                        horizontal: AppThemeTokens.space3,
                        vertical: AppThemeTokens.space1,
                      ),
                    ),
                  );
                },
              ),
            ),
          ],
        ),
      ),
    );
  }
}
