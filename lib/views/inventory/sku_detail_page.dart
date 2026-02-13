part of '../inventory_views.dart';

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
    final bottomInset = MediaQuery.viewPaddingOf(context).bottom;
    final total =
        ((_tryInt(_piecesController.text) ?? 0) *
                    (_tryDouble(_costPieceController.text) ?? 0) +
                (_tryInt(_bulkController.text) ?? 0) *
                    (_tryDouble(_costBulkController.text) ?? 0))
            .toDouble();

    return Scaffold(
      body: Padding(
        padding: EdgeInsets.fromLTRB(edge.left, edge.top, edge.right, 0),
        child: Column(
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
                    hintText: 'Enter SKU name',
                    onChanged: (_) => setState(() {}),
                  ),
                  const SizedBox(height: AppThemeTokens.space4),
                  _FieldEditor(
                    label: 'Description',
                    controller: _descriptionController,
                    maxLines: 4,
                    maxLength: 250,
                    hintText: 'Describe this SKU',
                    onChanged: (_) => setState(() {}),
                  ),
                  const SizedBox(height: AppThemeTokens.space4),
                  Row(
                    children: [
                      Expanded(
                        child: _FieldEditor(
                          label: 'Pieces',
                          controller: _piecesController,
                          hintText: 'Enter pieces count',
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
                          hintText: 'Enter bulk count',
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
                          hintText: 'Enter pieces per bulk',
                          keyboardType: const TextInputType.numberWithOptions(
                            signed: false,
                          ),
                          onChanged: (_) => setState(() {}),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: AppThemeTokens.space4),
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
                          hintText: 'e.g. 4.50',
                          keyboardType: const TextInputType.numberWithOptions(
                            decimal: true,
                          ),
                          onChanged: (_) => setState(() {}),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: AppThemeTokens.space4),
                  _FieldEditor(
                    label: 'Cost / Bulk',
                    controller: _costBulkController,
                    hintText: 'e.g. 40.00',
                    keyboardType: const TextInputType.numberWithOptions(
                      decimal: true,
                    ),
                    onChanged: (_) => setState(() {}),
                  ),
                  const SizedBox(height: AppThemeTokens.space4),
                  Card(
                    margin: EdgeInsets.zero,
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
                              style: Theme.of(context).textTheme.bodyLarge
                                  ?.copyWith(
                                    fontWeight: _fontWeight(
                                      AppThemeTokens.fontWeightSemibold,
                                    ),
                                  ),
                            ),
                          ),
                          _FieldEditor(
                            label: 'Product Price',
                            controller: _productPriceController,
                            hintText: 'e.g. 12.00',
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
