part of '../inventory_views.dart';

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
    required this.unitsInStock,
    required this.costPerUnit,
    required this.soldAsProduct,
    required this.productPrice,
  });

  final String id;
  final String name;
  final IconData itemPictureIcon;
  final String description;
  final double unitsInStock;
  final double costPerUnit;
  final bool soldAsProduct;
  final double? productPrice;

  double get totalValue => unitsInStock * costPerUnit;

  SkuItem copyWith({
    String? id,
    String? name,
    IconData? itemPictureIcon,
    String? description,
    double? unitsInStock,
    double? costPerUnit,
    bool? soldAsProduct,
    double? productPrice,
    bool clearProductPrice = false,
  }) {
    return SkuItem(
      id: id ?? this.id,
      name: name ?? this.name,
      itemPictureIcon: itemPictureIcon ?? this.itemPictureIcon,
      description: description ?? this.description,
      unitsInStock: unitsInStock ?? this.unitsInStock,
      costPerUnit: costPerUnit ?? this.costPerUnit,
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
