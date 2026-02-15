class SecurityLimits {
  const SecurityLimits._();

  static const int skuNameMaxLength = 80;
  static const int skuDescriptionMaxLength = 250;
  static const int serviceNameMaxLength = 80;
  static const int serviceDescriptionMaxLength = 250;

  static const double inventoryQuantityMax = 1000000;
  static const int inventoryBulkMax = 1000000;
  static const double monetaryAmountMax = 1000000000;
  static const double piecesPerBulkMax = 100000;

  static const int idRandomLength = 20;
}
