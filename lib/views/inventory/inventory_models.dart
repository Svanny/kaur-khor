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
  final double pieces;
  final int bulk;
  final double piecesPerBulk;
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
    double? pieces,
    int? bulk,
    double? piecesPerBulk,
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
