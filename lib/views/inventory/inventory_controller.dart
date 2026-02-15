part of '../inventory_views.dart';

class InventoryState {
  const InventoryState({required this.skus, required this.services});

  factory InventoryState.initial() {
    return const InventoryState(skus: _seedSkus, services: _seedServices);
  }

  static const List<SkuItem> _seedSkus = [
    SkuItem(
      id: 'sku-001',
      name: 'SKU #001',
      itemPictureIcon: _defaultSkuPictureIcon,
      description: 'Base ingredient for high volume items.',
      unitsInStock: 264.0,
      costPerUnit: 1296 / 264,
      soldAsProduct: true,
      productPrice: 10,
    ),
    SkuItem(
      id: 'sku-002',
      name: 'SKU #002',
      itemPictureIcon: _defaultSkuPictureIcon,
      description: 'Reusable material with stable demand.',
      unitsInStock: 146.0,
      costPerUnit: 601.2 / 146,
      soldAsProduct: false,
      productPrice: null,
    ),
    SkuItem(
      id: 'sku-003',
      name: 'SKU #003',
      itemPictureIcon: _defaultSkuPictureIcon,
      description: 'Low-rotation backup stock.',
      unitsInStock: 76.0,
      costPerUnit: 592 / 76,
      soldAsProduct: true,
      productPrice: 16,
    ),
  ];

  static const List<ServiceItem> _seedServices = [
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

  final List<SkuItem> skus;
  final List<ServiceItem> services;

  InventoryState copyWith({List<SkuItem>? skus, List<ServiceItem>? services}) {
    return InventoryState(
      skus: skus ?? this.skus,
      services: services ?? this.services,
    );
  }
}

class InventoryController extends ValueNotifier<InventoryState> {
  InventoryController({InventoryState? initialState})
    : super(initialState ?? InventoryState.initial());

  void replaceSku(SkuItem sku) {
    value = value.copyWith(
      skus: value.skus
          .map((item) => item.id == sku.id ? sku : item)
          .toList(growable: false),
    );
  }

  void replaceService(ServiceItem service) {
    value = value.copyWith(
      services: value.services
          .map((item) => item.id == service.id ? service : item)
          .toList(growable: false),
    );
  }

  void addSku(SkuItem sku) {
    value = value.copyWith(skus: [...value.skus, sku]);
  }

  void addService(ServiceItem service) {
    value = value.copyWith(services: [...value.services, service]);
  }

  void applySkuStockUpdates(List<SkuItem> updatedSkus) {
    final byId = {for (final sku in updatedSkus) sku.id: sku};
    value = value.copyWith(
      skus: value.skus
          .map((sku) => byId[sku.id] ?? sku)
          .toList(growable: false),
    );
  }
}

class AppInventoryScope extends InheritedNotifier<InventoryController> {
  const AppInventoryScope({
    super.key,
    required InventoryController controller,
    required super.child,
  }) : super(notifier: controller);

  static InventoryController controllerOf(BuildContext context) {
    final scope = context
        .dependOnInheritedWidgetOfExactType<AppInventoryScope>();
    assert(scope != null, 'AppInventoryScope not found in widget tree.');
    return scope!.notifier!;
  }
}

extension InventoryControllerContext on BuildContext {
  InventoryController get inventoryController =>
      AppInventoryScope.controllerOf(this);
}
