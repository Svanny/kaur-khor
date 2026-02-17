part of '../inventory_views.dart';

class ViewAllPage extends StatefulWidget {
  const ViewAllPage({super.key});

  @override
  State<ViewAllPage> createState() => _ViewAllPageState();
}

class _ViewAllPageState extends State<ViewAllPage> {
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
    final currencyCode = context.currencyController.value.code;

    return Scaffold(
      floatingActionButtonLocation: AppThemeTokens.primaryFabLocation,
      floatingActionButton: FloatingActionButton(
        onPressed: _onAddItemPressed,
        shape: const CircleBorder(),
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
            const SizedBox(height: AppThemeTokens.headerToContentGap),
            _SearchField(
              controller: _searchController,
              inputMode: _InputMode.text,
              hintText: 'Search items by name',
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: AppThemeTokens.headerToContentGap),
            Align(
              alignment: Alignment.centerLeft,
              child: Wrap(
                spacing: AppThemeTokens.wrapSpacing,
                runSpacing: AppThemeTokens.wrapSpacing,
                children: [
                  SizedBox(
                    height: AppThemeTokens.filterChipPillHeight,
                    child: FilterChip(
                      selected: _showSkus,
                      onSelected: (_) => setState(() => _showSkus = !_showSkus),
                      showCheckmark: true,
                      checkmarkColor: AppThemeTokens.textPrimary,
                      backgroundColor: AppThemeTokens.disabledBackground,
                      selectedColor: AppThemeTokens.chipSelected,
                      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      padding: const EdgeInsets.symmetric(
                        horizontal: AppThemeTokens.filterChipPadX,
                        vertical: AppThemeTokens.filterChipPadY,
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
                  ),
                  SizedBox(
                    height: AppThemeTokens.filterChipPillHeight,
                    child: FilterChip(
                      selected: _showServices,
                      onSelected: (_) =>
                          setState(() => _showServices = !_showServices),
                      showCheckmark: true,
                      checkmarkColor: AppThemeTokens.textPrimary,
                      backgroundColor: AppThemeTokens.disabledBackground,
                      selectedColor: AppThemeTokens.chipSelected,
                      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      padding: const EdgeInsets.symmetric(
                        horizontal: AppThemeTokens.filterChipPadX,
                        vertical: AppThemeTokens.filterChipPadY,
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
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppThemeTokens.headerToContentGap),
            Expanded(
              child: ValueListenableBuilder<InventoryState>(
                valueListenable: context.inventoryController,
                builder: (_, inventory, __) {
                  final query = _searchController.text.trim().toLowerCase();
                  final visibleSkus = inventory.skus
                      .where((sku) => sku.name.toLowerCase().contains(query))
                      .toList(growable: false);
                  final visibleServices = inventory.services
                      .where(
                        (service) => service.name.toLowerCase().contains(query),
                      )
                      .toList(growable: false);

                  return ListView(
                    padding: EdgeInsets.only(
                      bottom:
                          bottomInset +
                          AppThemeTokens.scrollBottomReservePrimary,
                    ),
                    children: [
                      _AnimatedFilterSection(
                        visible: _showServices,
                        child: Column(
                          children: [
                            const _SectionHeader(title: 'Services'),
                            const SizedBox(
                              height: AppThemeTokens.cardContentGap,
                            ),
                            for (final service in visibleServices) ...[
                              _InventoryItemCard(
                                title: service.name,
                                itemPictureIcon: service.itemPictureIcon,
                                unitsPillLabel: _unitsPillLabelForService(
                                  service,
                                  inventory.skus,
                                ),
                                valuePillAmount: service.price,
                                valuePillCurrencyCode: currencyCode,
                                summaryLabel: 'Estimated Total Value',
                                summaryValueLabel: _estimatedServiceTotalValue(
                                  service,
                                  inventory.skus,
                                  currencyCode: currencyCode,
                                ),
                                valueIconAssetPath: _pointOfSaleSvgAsset,
                                valueIconKey: const ValueKey(
                                  'inventory-item-sell-icon',
                                ),
                                onTap: () =>
                                    _editService(service, inventory.skus),
                              ),
                              const SizedBox(
                                height: AppThemeTokens.cardContentGap,
                              ),
                            ],
                          ],
                        ),
                      ),
                      _AnimatedFilterSection(
                        visible: _showSkus,
                        child: Column(
                          children: [
                            const _SectionHeader(title: 'SKUs'),
                            const SizedBox(
                              height: AppThemeTokens.cardContentGap,
                            ),
                            for (final sku in visibleSkus) ...[
                              _InventoryItemCard(
                                title: sku.name,
                                itemPictureIcon: sku.itemPictureIcon,
                                unitsPillLabel:
                                    '${_formatNumber(sku.unitsInStock)} units',
                                valuePillAmount: sku.costPerUnit,
                                valuePillCurrencyCode: currencyCode,
                                summaryLabel: 'Total Value',
                                summaryValueLabel: _currencyLabel(
                                  sku.totalValue,
                                  currencyCode: currencyCode,
                                ),
                                valueIconAssetPath: _paymentsSvgAsset,
                                valueIconKey: const ValueKey(
                                  'inventory-item-currency-icon',
                                ),
                                onTap: () => _editSku(sku),
                              ),
                              const SizedBox(
                                height: AppThemeTokens.cardContentGap,
                              ),
                            ],
                          ],
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
    );
  }

  String _unitsPillLabelForService(ServiceItem service, List<SkuItem> allSkus) {
    final selected = allSkus
        .where((sku) => service.skuIds.contains(sku.id))
        .toList(growable: false);
    if (selected.isEmpty) {
      return '??? units';
    }
    final minUnitsInStock = selected
        .map((sku) => sku.unitsInStock)
        .reduce(math.min);
    return '${_formatNumber(minUnitsInStock)} units';
  }

  String _estimatedServiceTotalValue(
    ServiceItem service,
    List<SkuItem> allSkus, {
    required String currencyCode,
  }) {
    final selected = allSkus
        .where((sku) => service.skuIds.contains(sku.id))
        .toList(growable: false);
    if (selected.isEmpty) {
      return '???';
    }

    final minUnitsInStock = selected
        .map((sku) => sku.unitsInStock)
        .reduce(math.min);
    final estimatedTotalValue = minUnitsInStock * service.price;
    return _currencyLabel(estimatedTotalValue, currencyCode: currencyCode);
  }

  Future<void> _editSku(SkuItem sku) async {
    FocusScope.of(context).unfocus();
    final inventoryController = context.inventoryController;
    final updated = await Navigator.of(context).push<SkuItem>(
      MaterialPageRoute(builder: (_) => SkuDetailPage(initialSku: sku)),
    );
    if (!mounted || updated == null) {
      return;
    }
    inventoryController.replaceSku(updated);
  }

  Future<void> _editService(ServiceItem service, List<SkuItem> allSkus) async {
    FocusScope.of(context).unfocus();
    final inventoryController = context.inventoryController;
    final updated = await Navigator.of(context).push<ServiceItem>(
      MaterialPageRoute(
        builder: (_) =>
            ServiceDetailPage(initialService: service, availableSkus: allSkus),
      ),
    );
    if (!mounted || updated == null) {
      return;
    }
    inventoryController.replaceService(updated);
  }

  Future<void> _onAddItemPressed() async {
    FocusScope.of(context).unfocus();
    final selectedType = await showModalBottomSheet<_NewItemType>(
      context: context,
      builder: (context) {
        return SafeArea(
          child: Padding(
            padding: const EdgeInsets.all(AppThemeTokens.cardInset),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                ListTile(
                  leading: _sheetActionIcon(
                    _defaultServicePictureAsset,
                    key: const ValueKey('add-item-service-icon'),
                  ),
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
                const SizedBox(height: AppThemeTokens.sectionGapCompact),
                ListTile(
                  leading: const Icon(
                    _defaultSkuPictureIcon,
                    key: ValueKey('add-item-sku-icon'),
                    color: AppThemeTokens.textPrimary,
                    size: AppThemeTokens.iconSizeMedium,
                  ),
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

  Widget _sheetActionIcon(String assetPath, {required Key key}) {
    return _inventorySvgIcon(
      assetPath: assetPath,
      key: key,
      size: AppThemeTokens.iconSizeMedium,
      color: AppThemeTokens.textPrimary,
    );
  }

  Future<void> _createSku() async {
    final inventoryController = context.inventoryController;
    final newSku = SkuItem(
      id: IdGenerator.newSkuId(),
      name: 'SKU #NEW',
      itemPictureIcon: _defaultSkuPictureIcon,
      description: '',
      unitsInStock: 0.0,
      costPerUnit: 0,
      soldAsProduct: false,
      productPrice: null,
    );
    final saved = await Navigator.of(context).push<SkuItem>(
      MaterialPageRoute(builder: (_) => SkuDetailPage(initialSku: newSku)),
    );
    if (!mounted || saved == null) {
      return;
    }
    inventoryController.addSku(saved);
  }

  Future<void> _createService() async {
    final inventoryController = context.inventoryController;
    final newService = ServiceItem(
      id: IdGenerator.newServiceId(),
      name: 'Service #NEW',
      itemPictureIcon: _defaultServicePictureIcon,
      description: '',
      price: 0,
      skuIds: <String>{},
    );
    final availableSkus = context.inventoryController.value.skus;
    final saved = await Navigator.of(context).push<ServiceItem>(
      MaterialPageRoute(
        builder: (_) => ServiceDetailPage(
          initialService: newService,
          availableSkus: availableSkus,
        ),
      ),
    );
    if (!mounted || saved == null) {
      return;
    }
    inventoryController.addService(saved);
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
