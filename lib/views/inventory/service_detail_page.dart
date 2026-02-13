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

  @override
  void initState() {
    super.initState();
    final service = widget.initialService;
    _nameController = TextEditingController(text: service.name);
    _descriptionController = TextEditingController(text: service.description);
    _priceController = TextEditingController(text: _trimNumber(service.price));
    _itemPictureIcon = service.itemPictureIcon;
    _selectedSkuIds = Set<String>.of(service.skuIds);
  }

  @override
  void dispose() {
    _nameController.dispose();
    _descriptionController.dispose();
    _priceController.dispose();
    super.dispose();
  }

  bool get _isValid {
    return _nameController.text.trim().isNotEmpty &&
        _descriptionController.text.trim().isNotEmpty &&
        (_tryDouble(_priceController.text) ?? -1) >= 0 &&
        _selectedSkuIds.isNotEmpty;
  }

  @override
  Widget build(BuildContext context) {
    final edge = AppThemeTokens.screenEdgePadding(context);
    final bottomInset = MediaQuery.viewPaddingOf(context).bottom;
    final selectedSkus = widget.availableSkus
        .where((sku) => _selectedSkuIds.contains(sku.id))
        .toList(growable: false);

    return Scaffold(
      body: Padding(
        padding: EdgeInsets.fromLTRB(edge.left, edge.top, edge.right, 0),
        child: Column(
          children: [
            _DetailHeader(
              title: _nameController.text.trim().isEmpty
                  ? 'Service'
                  : _nameController.text.trim(),
              onBack: () => Navigator.of(context).pop(),
              onCancel: () => Navigator.of(context).pop(),
              onSave: _isValid ? _save : null,
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
                    onChanged: (_) => setState(() {}),
                  ),
                  const SizedBox(height: AppThemeTokens.space4),
                  _FieldEditor(
                    label: 'Description',
                    controller: _descriptionController,
                    maxLines: 4,
                    maxLength: 250,
                    hintText: 'Describe this service',
                    onChanged: (_) => setState(() {}),
                  ),
                  const SizedBox(height: AppThemeTokens.space4),
                  ValueListenableBuilder<AppCurrency>(
                    valueListenable: context.currencyController,
                    builder: (_, currency, __) {
                      return _PriceFieldWithCurrency(
                        controller: _priceController,
                        currencyCode: currency.code,
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
                                                color:
                                                    AppThemeTokens.textPrimary,
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
    );
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
    Navigator.of(context).pop(updated);
  }
}

class _PriceFieldWithCurrency extends StatelessWidget {
  const _PriceFieldWithCurrency({
    required this.controller,
    required this.currencyCode,
    this.onChanged,
  });

  final TextEditingController controller;
  final String currencyCode;
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
          decoration: InputDecoration(
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
      ],
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
