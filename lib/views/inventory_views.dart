import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';

import '../theme/app_theme.dart';

const IconData _defaultSkuPictureIcon = Icons.inventory_2_outlined;
const IconData _defaultServicePictureIcon = Icons.person_outline;
const String _defaultServicePictureAsset =
    'icons/person_apron_24dp_E3E3E3_FILL0_wght400_GRAD0_opsz24.svg';

class SkuItem {
  const SkuItem({
    required this.id,
    required this.name,
    required this.itemPictureIcon,
    required this.description,
    required this.pieces,
    required this.bulk,
    required this.piecesPerBulk,
    required this.costPerPiece,
    required this.costPerBulk,
    required this.soldAsProduct,
    required this.productPrice,
  });

  final String id;
  final String name;
  final IconData itemPictureIcon;
  final String description;
  final int pieces;
  final int bulk;
  final int piecesPerBulk;
  final double costPerPiece;
  final double costPerBulk;
  final bool soldAsProduct;
  final double? productPrice;

  double get totalValue => (pieces * costPerPiece) + (bulk * costPerBulk);

  SkuItem copyWith({
    String? id,
    String? name,
    IconData? itemPictureIcon,
    String? description,
    int? pieces,
    int? bulk,
    int? piecesPerBulk,
    double? costPerPiece,
    double? costPerBulk,
    bool? soldAsProduct,
    double? productPrice,
    bool clearProductPrice = false,
  }) {
    return SkuItem(
      id: id ?? this.id,
      name: name ?? this.name,
      itemPictureIcon: itemPictureIcon ?? this.itemPictureIcon,
      description: description ?? this.description,
      pieces: pieces ?? this.pieces,
      bulk: bulk ?? this.bulk,
      piecesPerBulk: piecesPerBulk ?? this.piecesPerBulk,
      costPerPiece: costPerPiece ?? this.costPerPiece,
      costPerBulk: costPerBulk ?? this.costPerBulk,
      soldAsProduct: soldAsProduct ?? this.soldAsProduct,
      productPrice: clearProductPrice
          ? null
          : (productPrice ?? this.productPrice),
    );
  }
}

class ServiceItem {
  const ServiceItem({
    required this.id,
    required this.name,
    required this.itemPictureIcon,
    required this.description,
    required this.price,
    required this.skuIds,
  });

  final String id;
  final String name;
  final IconData itemPictureIcon;
  final String description;
  final double price;
  final Set<String> skuIds;

  ServiceItem copyWith({
    String? id,
    String? name,
    IconData? itemPictureIcon,
    String? description,
    double? price,
    Set<String>? skuIds,
  }) {
    return ServiceItem(
      id: id ?? this.id,
      name: name ?? this.name,
      itemPictureIcon: itemPictureIcon ?? this.itemPictureIcon,
      description: description ?? this.description,
      price: price ?? this.price,
      skuIds: skuIds ?? this.skuIds,
    );
  }
}

class ViewAllPage extends StatefulWidget {
  const ViewAllPage({super.key});

  @override
  State<ViewAllPage> createState() => _ViewAllPageState();
}

class _ViewAllPageState extends State<ViewAllPage> {
  List<SkuItem> _skus = const [
    SkuItem(
      id: 'sku-001',
      name: 'SKU #001',
      itemPictureIcon: _defaultSkuPictureIcon,
      description: 'Base ingredient for high volume items.',
      pieces: 120,
      bulk: 12,
      piecesPerBulk: 12,
      costPerPiece: 5,
      costPerBulk: 58,
      soldAsProduct: true,
      productPrice: 10,
    ),
    SkuItem(
      id: 'sku-002',
      name: 'SKU #002',
      itemPictureIcon: _defaultSkuPictureIcon,
      description: 'Reusable material with stable demand.',
      pieces: 86,
      bulk: 6,
      piecesPerBulk: 10,
      costPerPiece: 4.2,
      costPerBulk: 40,
      soldAsProduct: false,
      productPrice: null,
    ),
    SkuItem(
      id: 'sku-003',
      name: 'SKU #003',
      itemPictureIcon: _defaultSkuPictureIcon,
      description: 'Low-rotation backup stock.',
      pieces: 44,
      bulk: 4,
      piecesPerBulk: 8,
      costPerPiece: 8,
      costPerBulk: 60,
      soldAsProduct: true,
      productPrice: 16,
    ),
  ];

  List<ServiceItem> _services = const [
    ServiceItem(
      id: 'service-001',
      name: 'Service #001',
      itemPictureIcon: _defaultServicePictureIcon,
      description: 'Basic package for recurring customers.',
      price: 1200,
      skuIds: {'sku-001', 'sku-002'},
    ),
    ServiceItem(
      id: 'service-002',
      name: 'Service #002',
      itemPictureIcon: _defaultServicePictureIcon,
      description: 'Premium package with deeper SKU usage.',
      price: 2200,
      skuIds: {'sku-002', 'sku-003'},
    ),
  ];

  final TextEditingController _searchController = TextEditingController();
  bool _showSkus = true;
  bool _showServices = true;

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
    final visibleSkus = _skus
        .where((sku) => sku.name.toLowerCase().contains(query))
        .toList(growable: false);
    final visibleServices = _services
        .where((service) => service.name.toLowerCase().contains(query))
        .toList(growable: false);

    return Scaffold(
      floatingActionButton: FloatingActionButton(
        onPressed: _onAddItemPressed,
        child: const Icon(Icons.add),
      ),
      body: Padding(
        padding: EdgeInsets.fromLTRB(edge.left, edge.top, edge.right, 0),
        child: Column(
          children: [
            _PageHeader(
              title: 'All Items',
              onBack: () => Navigator.of(context).pop(),
            ),
            const SizedBox(height: AppThemeTokens.space3),
            _SearchField(
              controller: _searchController,
              hintText: 'Item',
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: AppThemeTokens.space3),
            Align(
              alignment: Alignment.centerLeft,
              child: Wrap(
                spacing: AppThemeTokens.space2,
                runSpacing: AppThemeTokens.space2,
                children: [
                  FilterChip(
                    selected: _showSkus,
                    onSelected: (_) => setState(() => _showSkus = !_showSkus),
                    backgroundColor: AppThemeTokens.chipBackground,
                    selectedColor: AppThemeTokens.chipSelected,
                    side: BorderSide.none,
                    shape: const RoundedRectangleBorder(
                      borderRadius: BorderRadius.all(
                        Radius.circular(AppThemeTokens.radiusPill),
                      ),
                      side: BorderSide.none,
                    ),
                    elevation: AppThemeTokens.elevation1,
                    pressElevation: AppThemeTokens.elevation1,
                    shadowColor: AppThemeTokens.shadow,
                    selectedShadowColor: AppThemeTokens.shadow,
                    label: Text(
                      'SKUs',
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                    avatar: Icon(
                      _showSkus ? Icons.check : Icons.circle_outlined,
                      size: 16,
                      color: _showSkus ? null : AppThemeTokens.textPrimary,
                    ),
                  ),
                  FilterChip(
                    selected: _showServices,
                    onSelected: (_) =>
                        setState(() => _showServices = !_showServices),
                    backgroundColor: AppThemeTokens.chipBackground,
                    selectedColor: AppThemeTokens.chipSelected,
                    side: BorderSide.none,
                    shape: const RoundedRectangleBorder(
                      borderRadius: BorderRadius.all(
                        Radius.circular(AppThemeTokens.radiusPill),
                      ),
                      side: BorderSide.none,
                    ),
                    elevation: AppThemeTokens.elevation1,
                    pressElevation: AppThemeTokens.elevation1,
                    shadowColor: AppThemeTokens.shadow,
                    selectedShadowColor: AppThemeTokens.shadow,
                    label: Text(
                      'Services',
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                    avatar: Icon(
                      _showServices ? Icons.check : Icons.circle_outlined,
                      size: 16,
                      color: _showServices ? null : AppThemeTokens.textPrimary,
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppThemeTokens.space3),
            Expanded(
              child: ListView(
                padding: EdgeInsets.only(
                  bottom: bottomInset + AppThemeTokens.space8,
                ),
                children: [
                  _AnimatedFilterSection(
                    visible: _showServices,
                    child: Column(
                      children: [
                        const _SectionHeader(title: 'Services'),
                        const SizedBox(height: AppThemeTokens.space3),
                        for (final service in visibleServices) ...[
                          _InventoryItemCard(
                            title: service.name,
                            itemPictureIcon: service.itemPictureIcon,
                            pieces: _piecesForService(service),
                            bulk: _bulkForService(service),
                            totalValueLabel: _currencyLabel(service.price),
                            onTap: () => _editService(service),
                          ),
                          const SizedBox(height: AppThemeTokens.space3),
                        ],
                      ],
                    ),
                  ),
                  _AnimatedFilterSection(
                    visible: _showSkus,
                    child: Column(
                      children: [
                        const _SectionHeader(title: 'SKUs'),
                        const SizedBox(height: AppThemeTokens.space3),
                        for (final sku in visibleSkus) ...[
                          _InventoryItemCard(
                            title: sku.name,
                            itemPictureIcon: sku.itemPictureIcon,
                            pieces: sku.pieces,
                            bulk: sku.bulk,
                            totalValueLabel: _currencyLabel(sku.totalValue),
                            onTap: () => _editSku(sku),
                          ),
                          const SizedBox(height: AppThemeTokens.space3),
                        ],
                      ],
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

  int _piecesForService(ServiceItem service) {
    final selected = _skus.where((sku) => service.skuIds.contains(sku.id));
    return selected.fold(0, (sum, sku) => sum + sku.pieces);
  }

  int _bulkForService(ServiceItem service) {
    final selected = _skus.where((sku) => service.skuIds.contains(sku.id));
    return selected.fold(0, (sum, sku) => sum + sku.bulk);
  }

  Future<void> _editSku(SkuItem sku) async {
    final updated = await Navigator.of(context).push<SkuItem>(
      MaterialPageRoute(builder: (_) => SkuDetailPage(initialSku: sku)),
    );
    if (updated == null) {
      return;
    }
    setState(() {
      _skus = _skus
          .map((item) => item.id == updated.id ? updated : item)
          .toList(growable: false);
    });
  }

  Future<void> _editService(ServiceItem service) async {
    final updated = await Navigator.of(context).push<ServiceItem>(
      MaterialPageRoute(
        builder: (_) =>
            ServiceDetailPage(initialService: service, availableSkus: _skus),
      ),
    );
    if (updated == null) {
      return;
    }
    setState(() {
      _services = _services
          .map((item) => item.id == updated.id ? updated : item)
          .toList(growable: false);
    });
  }

  Future<void> _onAddItemPressed() async {
    final selectedType = await showModalBottomSheet<_NewItemType>(
      context: context,
      builder: (context) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(AppThemeTokens.space4),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                ListTile(
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(
                      AppThemeTokens.radiusMd,
                    ),
                  ),
                  tileColor: AppThemeTokens.surface,
                  title: const Text('Add SKU'),
                  trailing: const Icon(Icons.arrow_forward_ios, size: 16),
                  onTap: () => Navigator.of(context).pop(_NewItemType.sku),
                ),
                const SizedBox(height: AppThemeTokens.space2),
                ListTile(
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(
                      AppThemeTokens.radiusMd,
                    ),
                  ),
                  tileColor: AppThemeTokens.surface,
                  title: const Text('Add Service'),
                  trailing: const Icon(Icons.arrow_forward_ios, size: 16),
                  onTap: () => Navigator.of(context).pop(_NewItemType.service),
                ),
              ],
            ),
          ),
        );
      },
    );

    if (!mounted || selectedType == null) {
      return;
    }

    switch (selectedType) {
      case _NewItemType.sku:
        await _createSku();
      case _NewItemType.service:
        await _createService();
    }
  }

  Future<void> _createSku() async {
    final newSku = SkuItem(
      id: 'sku-${DateTime.now().microsecondsSinceEpoch}',
      name: 'SKU #NEW',
      itemPictureIcon: _defaultSkuPictureIcon,
      description: '',
      pieces: 0,
      bulk: 0,
      piecesPerBulk: 1,
      costPerPiece: 0,
      costPerBulk: 0,
      soldAsProduct: false,
      productPrice: null,
    );
    final saved = await Navigator.of(context).push<SkuItem>(
      MaterialPageRoute(builder: (_) => SkuDetailPage(initialSku: newSku)),
    );
    if (saved == null) {
      return;
    }
    setState(() {
      _skus = [..._skus, saved];
    });
  }

  Future<void> _createService() async {
    final newService = ServiceItem(
      id: 'service-${DateTime.now().microsecondsSinceEpoch}',
      name: 'Service #NEW',
      itemPictureIcon: _defaultServicePictureIcon,
      description: '',
      price: 0,
      skuIds: <String>{},
    );
    final saved = await Navigator.of(context).push<ServiceItem>(
      MaterialPageRoute(
        builder: (_) =>
            ServiceDetailPage(initialService: newService, availableSkus: _skus),
      ),
    );
    if (saved == null) {
      return;
    }
    setState(() {
      _services = [..._services, saved];
    });
  }
}

enum _NewItemType { sku, service }

class _AnimatedFilterSection extends StatelessWidget {
  const _AnimatedFilterSection({required this.visible, required this.child});

  final bool visible;
  final Widget child;

  static const Duration _duration = Duration(milliseconds: 200);

  @override
  Widget build(BuildContext context) {
    return ClipRect(
      child: AnimatedAlign(
        duration: _duration,
        curve: Curves.easeOutCubic,
        alignment: Alignment.topCenter,
        heightFactor: visible ? 1 : 0,
        child: AnimatedOpacity(
          duration: _duration,
          curve: Curves.easeOutCubic,
          opacity: visible ? 1 : 0,
          child: child,
        ),
      ),
    );
  }
}

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

  late IconData _itemPictureIcon;
  late bool _soldAsProduct;

  @override
  void initState() {
    super.initState();
    final sku = widget.initialSku;
    _nameController = TextEditingController(text: sku.name);
    _descriptionController = TextEditingController(text: sku.description);
    _piecesController = TextEditingController(text: sku.pieces.toString());
    _bulkController = TextEditingController(text: sku.bulk.toString());
    _ratioController = TextEditingController(
      text: sku.piecesPerBulk.toString(),
    );
    _costPieceController = TextEditingController(
      text: _trimNumber(sku.costPerPiece),
    );
    _costBulkController = TextEditingController(
      text: _trimNumber(sku.costPerBulk),
    );
    _productPriceController = TextEditingController(
      text: sku.productPrice == null ? '' : _trimNumber(sku.productPrice!),
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

  bool get _isValid {
    final name = _nameController.text.trim().isNotEmpty;
    final description = _descriptionController.text.trim().isNotEmpty;
    final pieces = _tryInt(_piecesController.text) != null;
    final bulk = _tryInt(_bulkController.text) != null;
    final ratio = (_tryInt(_ratioController.text) ?? 0) > 0;
    final pieceCost = _tryDouble(_costPieceController.text) != null;
    final bulkCost = _tryDouble(_costBulkController.text) != null;
    final productPriceOk =
        !_soldAsProduct ||
        (_tryDouble(_productPriceController.text) ?? -1) >= 0;
    return name &&
        description &&
        pieces &&
        bulk &&
        ratio &&
        pieceCost &&
        bulkCost &&
        productPriceOk;
  }

  @override
  Widget build(BuildContext context) {
    final edge = AppThemeTokens.screenEdgePadding(context);
    final total =
        ((_tryInt(_piecesController.text) ?? 0) *
                    (_tryDouble(_costPieceController.text) ?? 0) +
                (_tryInt(_bulkController.text) ?? 0) *
                    (_tryDouble(_costBulkController.text) ?? 0))
            .toDouble();

    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: EdgeInsets.fromLTRB(
            edge.left,
            AppThemeTokens.space4,
            edge.right,
            edge.bottom,
          ),
          children: [
            _DetailHeader(
              title: _nameController.text.trim().isEmpty
                  ? 'SKU'
                  : _nameController.text.trim(),
              onBack: () => Navigator.of(context).pop(),
              onCancel: () => Navigator.of(context).pop(),
              onSave: _isValid ? _save : null,
            ),
            const SizedBox(height: AppThemeTokens.space3),
            const _MediaPlaceholderCard(),
            const SizedBox(height: AppThemeTokens.space4),
            _FieldEditor(
              label: 'Name',
              controller: _nameController,
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: AppThemeTokens.space3),
            _FieldEditor(
              label: 'Description',
              controller: _descriptionController,
              maxLines: 4,
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: AppThemeTokens.space3),
            _ItemPictureField(
              icon: _itemPictureIcon,
              onUseDefault: () {
                setState(() => _itemPictureIcon = _defaultSkuPictureIcon);
              },
              defaultLabel: 'Default: box icon',
            ),
            const SizedBox(height: AppThemeTokens.space3),
            Row(
              children: [
                Expanded(
                  child: _FieldEditor(
                    label: 'Pieces',
                    controller: _piecesController,
                    keyboardType: const TextInputType.numberWithOptions(
                      signed: false,
                    ),
                    onChanged: (_) => setState(() {}),
                  ),
                ),
                const SizedBox(width: AppThemeTokens.space2),
                Expanded(
                  child: _FieldEditor(
                    label: 'Bulk',
                    controller: _bulkController,
                    keyboardType: const TextInputType.numberWithOptions(
                      signed: false,
                    ),
                    onChanged: (_) => setState(() {}),
                  ),
                ),
                const SizedBox(width: AppThemeTokens.space2),
                Expanded(
                  child: _FieldEditor(
                    label: 'Pieces / Bulk',
                    controller: _ratioController,
                    keyboardType: const TextInputType.numberWithOptions(
                      signed: false,
                    ),
                    onChanged: (_) => setState(() {}),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppThemeTokens.space3),
            Row(
              children: [
                Expanded(
                  child: _ReadOnlyField(
                    label: 'Total Value',
                    value: _currencyLabel(total),
                  ),
                ),
                const SizedBox(width: AppThemeTokens.space2),
                Expanded(
                  child: _FieldEditor(
                    label: 'Cost / Piece',
                    controller: _costPieceController,
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                    onChanged: (_) => setState(() {}),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppThemeTokens.space3),
            _FieldEditor(
              label: 'Cost / Bulk',
              controller: _costBulkController,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: AppThemeTokens.space3),
            Card(
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
                        setState(() => _soldAsProduct = value);
                      },
                      controlAffinity: ListTileControlAffinity.leading,
                      contentPadding: EdgeInsets.zero,
                      title: Text(
                        'Sold as a Product?',
                        style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                          fontWeight: _fontWeight(
                            AppThemeTokens.fontWeightSemibold,
                          ),
                        ),
                      ),
                    ),
                    _FieldEditor(
                      label: 'Product Price',
                      controller: _productPriceController,
                      enabled: _soldAsProduct,
                      keyboardType: const TextInputType.numberWithOptions(
                        decimal: true,
                      ),
                      onChanged: (_) => setState(() {}),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  void _save() {
    if (!_isValid) {
      return;
    }
    final updated = widget.initialSku.copyWith(
      name: _nameController.text.trim(),
      itemPictureIcon: _itemPictureIcon,
      description: _descriptionController.text.trim(),
      pieces: _tryInt(_piecesController.text) ?? 0,
      bulk: _tryInt(_bulkController.text) ?? 0,
      piecesPerBulk: (_tryInt(_ratioController.text) ?? 1).clamp(1, 100000),
      costPerPiece: _tryDouble(_costPieceController.text) ?? 0,
      costPerBulk: _tryDouble(_costBulkController.text) ?? 0,
      soldAsProduct: _soldAsProduct,
      productPrice: _soldAsProduct
          ? _tryDouble(_productPriceController.text)
          : null,
      clearProductPrice: !_soldAsProduct,
    );
    Navigator.of(context).pop(updated);
  }
}

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
    final selectedSkus = widget.availableSkus
        .where((sku) => _selectedSkuIds.contains(sku.id))
        .toList(growable: false);

    return Scaffold(
      body: SafeArea(
        child: ListView(
          padding: EdgeInsets.fromLTRB(
            edge.left,
            AppThemeTokens.space4,
            edge.right,
            edge.bottom,
          ),
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
            const _MediaPlaceholderCard(),
            const SizedBox(height: AppThemeTokens.space4),
            _FieldEditor(
              label: 'Name',
              controller: _nameController,
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: AppThemeTokens.space3),
            _FieldEditor(
              label: 'Description',
              controller: _descriptionController,
              maxLines: 4,
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: AppThemeTokens.space3),
            _ItemPictureField(
              icon: _itemPictureIcon,
              onUseDefault: () {
                setState(() => _itemPictureIcon = _defaultServicePictureIcon);
              },
              defaultLabel: 'Default: person_apron',
            ),
            const SizedBox(height: AppThemeTokens.space3),
            _FieldEditor(
              label: 'Price',
              controller: _priceController,
              keyboardType: const TextInputType.numberWithOptions(
                decimal: true,
              ),
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: AppThemeTokens.space3),
            Text('SKUs Used', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: AppThemeTokens.space2),
            Card(
              child: InkWell(
                borderRadius: BorderRadius.circular(AppThemeTokens.radiusMd),
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
                                  label: Text(
                                    sku.name,
                                    style: Theme.of(
                                      context,
                                    ).textTheme.bodyMedium,
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
    final query = _searchController.text.trim().toLowerCase();
    final visibleSkus = widget.skus
        .where((sku) => sku.name.toLowerCase().contains(query))
        .toList(growable: false);

    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: EdgeInsets.fromLTRB(
            edge.left,
            AppThemeTokens.space4,
            edge.right,
            edge.bottom,
          ),
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
                hintText: 'Item',
                onChanged: (_) => setState(() {}),
              ),
              const SizedBox(height: AppThemeTokens.space3),
              Expanded(
                child: ListView.separated(
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
      ),
    );
  }
}

class _DetailHeader extends StatelessWidget {
  const _DetailHeader({
    required this.title,
    required this.onBack,
    required this.onCancel,
    required this.onSave,
  });

  final String title;
  final VoidCallback onBack;
  final VoidCallback onCancel;
  final VoidCallback? onSave;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        IconButton(onPressed: onBack, icon: const Icon(Icons.arrow_back)),
        const SizedBox(width: AppThemeTokens.space2),
        Expanded(
          child: Text(
            title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
              fontSize: AppThemeTokens.fontSizeTitleMedium,
            ),
          ),
        ),
        _CircleOutlineAction(
          icon: Icons.close,
          onPressed: onCancel,
          tooltip: 'Cancel',
        ),
        const SizedBox(width: AppThemeTokens.space2),
        _CircleFilledAction(
          icon: Icons.check,
          onPressed: onSave,
          tooltip: onSave == null ? 'Fix required fields' : 'Save',
        ),
      ],
    );
  }
}

class _CircleFilledAction extends StatelessWidget {
  const _CircleFilledAction({
    required this.icon,
    required this.onPressed,
    required this.tooltip,
  });

  final IconData icon;
  final VoidCallback? onPressed;
  final String tooltip;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 40,
      height: 40,
      child: Tooltip(
        message: tooltip,
        child: FilledButton(
          onPressed: onPressed,
          style: FilledButton.styleFrom(
            shape: const CircleBorder(),
            padding: EdgeInsets.zero,
          ),
          child: Icon(icon, size: 18),
        ),
      ),
    );
  }
}

class _CircleOutlineAction extends StatelessWidget {
  const _CircleOutlineAction({
    required this.icon,
    required this.onPressed,
    required this.tooltip,
  });

  final IconData icon;
  final VoidCallback onPressed;
  final String tooltip;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: 40,
      height: 40,
      child: Tooltip(
        message: tooltip,
        child: OutlinedButton(
          onPressed: onPressed,
          style: OutlinedButton.styleFrom(
            shape: const CircleBorder(),
            padding: EdgeInsets.zero,
          ),
          child: Icon(icon, size: 18),
        ),
      ),
    );
  }
}

class _PageHeader extends StatelessWidget {
  const _PageHeader({required this.title, required this.onBack});

  final String title;
  final VoidCallback onBack;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        IconButton(onPressed: onBack, icon: const Icon(Icons.arrow_back)),
        const SizedBox(width: AppThemeTokens.space2),
        Expanded(
          child: Text(
            title,
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
              fontSize: AppThemeTokens.fontSizeTitleMedium,
            ),
          ),
        ),
      ],
    );
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: [
        const Expanded(child: Divider()),
        Padding(
          padding: const EdgeInsets.symmetric(
            horizontal: AppThemeTokens.space2,
          ),
          child: Text(
            title,
            style: Theme.of(context).textTheme.bodyLarge?.copyWith(
              fontWeight: _fontWeight(AppThemeTokens.fontWeightSemibold),
            ),
          ),
        ),
        const Expanded(child: Divider()),
      ],
    );
  }
}

class _SearchField extends StatelessWidget {
  const _SearchField({
    required this.controller,
    required this.hintText,
    required this.onChanged,
  });

  final TextEditingController controller;
  final String hintText;
  final ValueChanged<String> onChanged;

  @override
  Widget build(BuildContext context) {
    return TextField(
      controller: controller,
      onChanged: onChanged,
      decoration: InputDecoration(
        hintText: hintText,
        hintStyle: Theme.of(
          context,
        ).textTheme.bodyLarge?.copyWith(color: AppThemeTokens.textSecondary),
        prefixIcon: const Icon(Icons.search),
        prefixIconColor: AppThemeTokens.textSecondary,
        contentPadding: const EdgeInsets.symmetric(
          horizontal: AppThemeTokens.inputPaddingX,
          vertical: AppThemeTokens.inputPaddingY,
        ),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppThemeTokens.radiusPill),
          borderSide: const BorderSide(color: AppThemeTokens.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppThemeTokens.radiusPill),
          borderSide: const BorderSide(color: AppThemeTokens.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(AppThemeTokens.radiusPill),
          borderSide: const BorderSide(color: AppThemeTokens.primary),
        ),
      ),
    );
  }
}

class _InventoryItemCard extends StatelessWidget {
  const _InventoryItemCard({
    required this.title,
    required this.itemPictureIcon,
    required this.pieces,
    required this.bulk,
    required this.totalValueLabel,
    required this.onTap,
  });

  final String title;
  final IconData itemPictureIcon;
  final int pieces;
  final int bulk;
  final String totalValueLabel;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(AppThemeTokens.radiusMd),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(AppThemeTokens.space4),
          child: IntrinsicHeight(
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                AspectRatio(
                  aspectRatio: 1,
                  child: Container(
                    decoration: BoxDecoration(
                      color: AppThemeTokens.accentDarker,
                      borderRadius: BorderRadius.circular(
                        AppThemeTokens.radiusMd,
                      ),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(AppThemeTokens.space2),
                      child: Center(
                        child: _ItemPictureGlyph(
                          itemPictureIcon,
                          fill: true,
                          color: AppThemeTokens.white,
                        ),
                      ),
                    ),
                  ),
                ),
                const SizedBox(width: AppThemeTokens.space3),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(title, style: Theme.of(context).textTheme.bodyLarge),
                      //const SizedBox(height: AppThemeTokens.space2),
                      Wrap(
                        spacing: AppThemeTokens.space2,
                        runSpacing: AppThemeTokens.space2,
                        children: [
                          Chip(
                            backgroundColor: AppThemeTokens.chipBackground,
                            side: BorderSide.none,
                            shape: const RoundedRectangleBorder(
                              borderRadius: BorderRadius.all(
                                Radius.circular(AppThemeTokens.radiusPill),
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
                              'Pieces: $pieces',
                              style: Theme.of(context).textTheme.bodyMedium
                                  ?.copyWith(color: AppThemeTokens.textPrimary),
                            ),
                          ),
                          Chip(
                            backgroundColor: AppThemeTokens.chipBackground,
                            side: BorderSide.none,
                            shape: const RoundedRectangleBorder(
                              borderRadius: BorderRadius.all(
                                Radius.circular(AppThemeTokens.radiusPill),
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
                              'Bulk: $bulk',
                              style: Theme.of(context).textTheme.bodyMedium
                                  ?.copyWith(color: AppThemeTokens.textPrimary),
                            ),
                          ),
                        ],
                      ),
                      //const SizedBox(height: AppThemeTokens.space2),
                      Text(
                        'Total Value',
                        style: Theme.of(context).textTheme.bodyMedium,
                      ),
                      Text(
                        totalValueLabel,
                        style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                          fontWeight: _fontWeight(
                            AppThemeTokens.fontWeightBold,
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
}

class _MediaPlaceholderCard extends StatelessWidget {
  const _MediaPlaceholderCard();

  @override
  Widget build(BuildContext context) {
    return Card(
      child: SizedBox(
        height: 260,
        child: Stack(
          children: [
            const Positioned(
              top: AppThemeTokens.space3,
              right: AppThemeTokens.space3,
              child: Icon(Icons.filter_alt_outlined),
            ),
            Center(
              child: Text(
                'Chart graphing updates +\nest. (banded) values\n\nand picture for the other',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                  color: AppThemeTokens.textSecondary,
                ),
              ),
            ),
            const Positioned(
              left: 0,
              right: 0,
              bottom: AppThemeTokens.space3,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  _CarouselDot(active: false),
                  SizedBox(width: AppThemeTokens.space2),
                  _CarouselDot(active: true),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CarouselDot extends StatelessWidget {
  const _CarouselDot({required this.active});

  final bool active;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 10,
      height: 10,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: active ? AppThemeTokens.primary : AppThemeTokens.border,
      ),
    );
  }
}

class _ItemPictureField extends StatelessWidget {
  const _ItemPictureField({
    required this.icon,
    required this.onUseDefault,
    required this.defaultLabel,
  });

  final IconData icon;
  final VoidCallback onUseDefault;
  final String defaultLabel;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text('Item Picture *', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: AppThemeTokens.space1),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(AppThemeTokens.space3),
            child: Row(
              children: [
                Container(
                  width: AppThemeTokens.unit * 14,
                  height: AppThemeTokens.unit * 14,
                  decoration: BoxDecoration(
                    color: AppThemeTokens.accentDarker,
                    borderRadius: BorderRadius.circular(
                      AppThemeTokens.radiusMd,
                    ),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(AppThemeTokens.space1),
                    child: _ItemPictureGlyph(
                      icon,
                      fill: true,
                      color: AppThemeTokens.white,
                    ),
                  ),
                ),
                const SizedBox(width: AppThemeTokens.space3),
                Expanded(
                  child: Text(
                    'Required field. $defaultLabel.',
                    style: Theme.of(context).textTheme.bodyMedium,
                  ),
                ),
                OutlinedButton(
                  onPressed: onUseDefault,
                  child: const Text('Default'),
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }
}

class _ItemPictureGlyph extends StatelessWidget {
  const _ItemPictureGlyph(this.icon, {required this.fill, required this.color});

  final IconData icon;
  final bool fill;
  final Color color;

  @override
  Widget build(BuildContext context) {
    if (!fill) {
      return _baseGlyph(AppThemeTokens.iconSizeMedium);
    }

    // Keep fill-mode intrinsic-safe inside IntrinsicHeight-based parents.
    return Align(
      alignment: Alignment.center,
      child: FittedBox(
        fit: BoxFit.contain,
        child: _baseGlyph(AppThemeTokens.unit * 16),
      ),
    );
  }

  Widget _baseGlyph(double size) {
    if (icon == _defaultServicePictureIcon) {
      return SvgPicture.asset(
        _defaultServicePictureAsset,
        width: size,
        height: size,
        colorFilter: ColorFilter.mode(color, BlendMode.srcIn),
      );
    }

    return Icon(icon, size: size, color: color);
  }
}

class _FieldEditor extends StatelessWidget {
  const _FieldEditor({
    required this.label,
    required this.controller,
    this.maxLines = 1,
    this.enabled = true,
    this.keyboardType,
    this.onChanged,
  });

  final String label;
  final TextEditingController controller;
  final int maxLines;
  final bool enabled;
  final TextInputType? keyboardType;
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
          maxLines: maxLines,
          enabled: enabled,
          keyboardType: keyboardType,
          onChanged: onChanged,
          decoration: InputDecoration(hintText: label),
        ),
      ],
    );
  }
}

class _ReadOnlyField extends StatelessWidget {
  const _ReadOnlyField({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: AppThemeTokens.space1),
        InputDecorator(
          decoration: const InputDecoration(enabled: false),
          child: Text(
            value,
            style: Theme.of(context).textTheme.bodyLarge?.copyWith(
              fontWeight: _fontWeight(AppThemeTokens.fontWeightSemibold),
            ),
          ),
        ),
      ],
    );
  }
}

int? _tryInt(String raw) => int.tryParse(raw.trim());

double? _tryDouble(String raw) => double.tryParse(raw.trim());

String _trimNumber(double value) {
  if (value == value.roundToDouble()) {
    return value.toStringAsFixed(0);
  }
  return value.toStringAsFixed(2);
}

String _currencyLabel(double value) {
  if (value >= 1000) {
    return '${(value / 1000).toStringAsFixed(1)}k USD';
  }
  return '${value.toStringAsFixed(0)} USD';
}

FontWeight _fontWeight(double tokenWeight) {
  return switch (tokenWeight.round()) {
    100 => FontWeight.w100,
    200 => FontWeight.w200,
    300 => FontWeight.w300,
    400 => FontWeight.w400,
    500 => FontWeight.w500,
    600 => FontWeight.w600,
    700 => FontWeight.w700,
    800 => FontWeight.w800,
    900 => FontWeight.w900,
    _ => FontWeight.w400,
  };
}
