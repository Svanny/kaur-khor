part of '../inventory_views.dart';

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
                    showCheckmark: true,
                    checkmarkColor: AppThemeTokens.textPrimary,
                    backgroundColor: AppThemeTokens.disabledBackground,
                    selectedColor: AppThemeTokens.chipSelected,
                    padding: const EdgeInsets.symmetric(
                      horizontal:
                          AppThemeTokens.chipPaddingX + AppThemeTokens.space1,
                      vertical:
                          AppThemeTokens.chipPaddingY + AppThemeTokens.space1,
                    ),
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
                  ),
                  FilterChip(
                    selected: _showServices,
                    onSelected: (_) =>
                        setState(() => _showServices = !_showServices),
                    showCheckmark: true,
                    checkmarkColor: AppThemeTokens.textPrimary,
                    backgroundColor: AppThemeTokens.disabledBackground,
                    selectedColor: AppThemeTokens.chipSelected,
                    padding: const EdgeInsets.symmetric(
                      horizontal:
                          AppThemeTokens.chipPaddingX + AppThemeTokens.space1,
                      vertical:
                          AppThemeTokens.chipPaddingY + AppThemeTokens.space1,
                    ),
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
    final curve = visible ? Curves.easeOutCubic : Curves.easeInCubic;

    return ClipRect(
      child: AnimatedAlign(
        duration: _duration,
        curve: curve,
        alignment: Alignment.topCenter,
        heightFactor: visible ? 1 : 0,
        child: AnimatedOpacity(
          duration: _duration,
          curve: curve,
          opacity: visible ? 1 : 0,
          child: child,
        ),
      ),
    );
  }
}
