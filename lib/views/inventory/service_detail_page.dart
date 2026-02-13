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
  final GlobalKey _headerActionsKey = GlobalKey();
  final GlobalKey _stackKey = GlobalKey();
  bool _allowPop = false;
  bool _showUnsavedOverlay = false;
  Rect? _unsavedOverlayStartRect;
  Completer<_UnsavedServiceChangesAction?>? _unsavedOverlayCompleter;

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
    if (_unsavedOverlayCompleter?.isCompleted == false) {
      _unsavedOverlayCompleter?.complete(null);
    }
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
        body: Stack(
          key: _stackKey,
          children: [
            Padding(
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
                    showActions: _hasChanges && !_showUnsavedOverlay,
                    actionsKey: _headerActionsKey,
                  ),
                  const SizedBox(height: AppThemeTokens.space3),
                  Expanded(
                    child: ListView(
                      padding: EdgeInsets.only(
                        bottom: bottomInset + AppThemeTokens.space8,
                      ),
                      children: [
                        _MediaPlaceholderCard(
                          itemPictureIcon: _itemPictureIcon,
                        ),
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
                              padding: const EdgeInsets.all(
                                AppThemeTokens.space3,
                              ),
                              child: selectedSkus.isEmpty
                                  ? Text(
                                      'Tap to choose SKUs',
                                      style: Theme.of(
                                        context,
                                      ).textTheme.bodyMedium,
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
                                                  MaterialTapTargetSize
                                                      .shrinkWrap,
                                              visualDensity:
                                                  VisualDensity.compact,
                                              shape:
                                                  const RoundedRectangleBorder(
                                                    borderRadius:
                                                        BorderRadius.all(
                                                          Radius.circular(
                                                            AppThemeTokens
                                                                .radiusPill,
                                                          ),
                                                        ),
                                                    side: BorderSide.none,
                                                  ),
                                              padding:
                                                  const EdgeInsets.symmetric(
                                                    horizontal:
                                                        AppThemeTokens
                                                            .chipPaddingX -
                                                        AppThemeTokens.space1,
                                                    vertical:
                                                        AppThemeTokens
                                                            .chipPaddingY -
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
            if (_showUnsavedOverlay && _unsavedOverlayStartRect != null)
              Positioned.fill(
                child: _UnsavedChangesMorphOverlay(
                  startRect: _unsavedOverlayStartRect!,
                  onSelected: _onUnsavedOverlaySelected,
                ),
              ),
          ],
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
    final choice = await _showUnsavedChangesDialog();
    if (!mounted) {
      return false;
    }
    if (choice == _UnsavedServiceChangesAction.confirm) {
      if (!_isValid) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Fix required fields before confirming'),
          ),
        );
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
    final pending = _unsavedOverlayCompleter;
    if (pending != null) {
      return pending.future;
    }

    final completer = Completer<_UnsavedServiceChangesAction?>();
    setState(() {
      _unsavedOverlayStartRect = _resolveHeaderActionsRect();
      _showUnsavedOverlay = true;
      _unsavedOverlayCompleter = completer;
    });
    return completer.future;
  }

  Rect _resolveHeaderActionsRect() {
    final actionsContext = _headerActionsKey.currentContext;
    final stackContext = _stackKey.currentContext;
    if (actionsContext == null || stackContext == null) {
      return _fallbackHeaderActionsRect();
    }
    final actionsBox = actionsContext.findRenderObject() as RenderBox?;
    final stackBox = stackContext.findRenderObject() as RenderBox?;
    if (actionsBox == null || stackBox == null) {
      return _fallbackHeaderActionsRect();
    }
    final topLeft = stackBox.globalToLocal(
      actionsBox.localToGlobal(Offset.zero),
    );
    return topLeft & actionsBox.size;
  }

  Rect _fallbackHeaderActionsRect() {
    const width = 88.0;
    const height = 40.0;
    final size = MediaQuery.sizeOf(context);
    return Rect.fromLTWH(
      size.width - AppThemeTokens.space4 - width,
      AppThemeTokens.space4,
      width,
      height,
    );
  }

  void _onUnsavedOverlaySelected(_UnsavedServiceChangesAction? action) {
    final completer = _unsavedOverlayCompleter;
    if (completer == null || completer.isCompleted) {
      return;
    }
    setState(() {
      _showUnsavedOverlay = false;
      _unsavedOverlayStartRect = null;
      _unsavedOverlayCompleter = null;
    });
    completer.complete(action);
  }

  void _resetChanges() {
    FocusScope.of(context).unfocus();
    setState(() {
      _nameController.text = _initialName;
      _descriptionController.text = _initialDescription;
      _priceController.text = _initialPriceText;
      _itemPictureIcon = _initialItemPictureIcon;
      _selectedSkuIds = Set<String>.of(_initialSkuIds);
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

enum _UnsavedServiceChangesAction { confirm, discard }

class _UnsavedChangesMorphOverlay extends StatefulWidget {
  const _UnsavedChangesMorphOverlay({
    required this.startRect,
    required this.onSelected,
  });

  final Rect startRect;
  final ValueChanged<_UnsavedServiceChangesAction?> onSelected;

  @override
  State<_UnsavedChangesMorphOverlay> createState() =>
      _UnsavedChangesMorphOverlayState();
}

class _UnsavedChangesMorphOverlayState
    extends State<_UnsavedChangesMorphOverlay>
    with SingleTickerProviderStateMixin {
  static const Duration _duration = Duration(milliseconds: 200);
  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: _duration,
    reverseDuration: _duration,
  );
  bool _isClosing = false;

  @override
  void initState() {
    super.initState();
    _controller.forward();
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _select(_UnsavedServiceChangesAction action) async {
    if (_isClosing) {
      return;
    }
    _isClosing = true;
    await _controller.reverse();
    if (!mounted) {
      return;
    }
    widget.onSelected(action);
  }

  Future<void> _dismiss() async {
    if (_isClosing) {
      return;
    }
    _isClosing = true;
    await _controller.reverse();
    if (!mounted) {
      return;
    }
    widget.onSelected(null);
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        final width = constraints.maxWidth;
        final height = constraints.maxHeight;
        final targetRect = Rect.fromCenter(
          center: Offset(width / 2, height / 2),
          width: math.min(width - (AppThemeTokens.space6 * 2), 360),
          height: 260,
        );
        final titleStyle = Theme.of(context).textTheme.titleMedium?.copyWith(
          color: AppThemeTokens.textPrimary,
          fontWeight: _fontWeight(AppThemeTokens.fontWeightSemibold),
        );
        final bodyStyle = Theme.of(
          context,
        ).textTheme.bodyLarge?.copyWith(color: AppThemeTokens.textSecondary);

        return AnimatedBuilder(
          animation: _controller,
          builder: (_, __) {
            final frameT = Curves.easeInOutCubic.transform(_controller.value);
            final showContent = frameT > 0.6;
            final contentT = Curves.easeOutCubic.transform(
              ((frameT - 0.6) / 0.4).clamp(0.0, 1.0),
            );
            final actionLabelT = Curves.easeOutCubic.transform(
              ((frameT - 0.66) / 0.34).clamp(0.0, 1.0),
            );
            final scrimOpacity = 0.55 * frameT;
            final rect = Rect.lerp(widget.startRect, targetRect, frameT)!;
            final borderRadius = BorderRadius.circular(20 + (12 * frameT));
            final cardColor = Color.lerp(
              Colors.transparent,
              AppThemeTokens.surface,
              frameT,
            );

            return Stack(
              children: [
                Positioned.fill(
                  child: GestureDetector(
                    behavior: HitTestBehavior.opaque,
                    onTap: _dismiss,
                    child: ColoredBox(
                      color: Colors.black.withValues(alpha: scrimOpacity),
                      child: const SizedBox.expand(),
                    ),
                  ),
                ),
                Positioned.fromRect(
                  rect: rect,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      color: cardColor,
                      borderRadius: borderRadius,
                      border: Border.all(
                        color: AppThemeTokens.border,
                        width: 2,
                      ),
                    ),
                    child: ClipRRect(
                      borderRadius: borderRadius,
                      child: Padding(
                        padding: EdgeInsets.lerp(
                          EdgeInsets.zero,
                          const EdgeInsets.all(AppThemeTokens.space6),
                          contentT,
                        )!,
                        child: Stack(
                          children: [
                            if (showContent)
                              Positioned(
                                top: 0,
                                left: 0,
                                right: 0,
                                child: Transform.translate(
                                  offset: Offset(0, (1 - contentT) * 10),
                                  child: Opacity(
                                    opacity: contentT,
                                    child: Column(
                                      crossAxisAlignment:
                                          CrossAxisAlignment.start,
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        Text(
                                          'Unsaved changes',
                                          style: titleStyle,
                                        ),
                                        SizedBox(
                                          height:
                                              AppThemeTokens.space3 * contentT,
                                        ),
                                        Transform.translate(
                                          offset: Offset(0, (1 - contentT) * 8),
                                          child: Opacity(
                                            opacity: contentT,
                                            child: Text(
                                              'You have unsaved changes. '
                                              'Confirm to keep them or '
                                              'discard to exit.',
                                              style: bodyStyle,
                                            ),
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ),
                              ),
                            Align(
                              alignment: Alignment.bottomRight,
                              child: FittedBox(
                                fit: BoxFit.scaleDown,
                                alignment: Alignment.centerRight,
                                child: Row(
                                  mainAxisSize: MainAxisSize.min,
                                  children: [
                                    _MorphActionButton(
                                      icon: Icons.close,
                                      label: 'Discard',
                                      filled: false,
                                      progress: actionLabelT,
                                      onTap: () => _select(
                                        _UnsavedServiceChangesAction.discard,
                                      ),
                                    ),
                                    const SizedBox(
                                      width: AppThemeTokens.space2,
                                    ),
                                    _MorphActionButton(
                                      icon: Icons.check,
                                      label: 'Confirm',
                                      filled: true,
                                      progress: actionLabelT,
                                      onTap: () => _select(
                                        _UnsavedServiceChangesAction.confirm,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              ],
            );
          },
        );
      },
    );
  }
}

class _MorphActionButton extends StatelessWidget {
  const _MorphActionButton({
    required this.icon,
    required this.label,
    required this.filled,
    required this.progress,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final bool filled;
  final double progress;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final clamped = progress.clamp(0.0, 1.0).toDouble();
    final labelColor = filled ? AppThemeTokens.white : AppThemeTokens.primary;
    final iconColor = filled
        ? AppThemeTokens.white
        : AppThemeTokens.textPrimary;
    final width = 40 + ((filled ? 106 : 104) * clamped);
    final slide = (1 - clamped) * 12;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppThemeTokens.radiusPill),
        child: Container(
          width: width,
          height: 40,
          decoration: BoxDecoration(
            color: filled ? AppThemeTokens.primary : Colors.transparent,
            borderRadius: BorderRadius.circular(AppThemeTokens.radiusPill),
            border: Border.all(
              color: filled ? AppThemeTokens.primary : AppThemeTokens.border,
              width: 2,
            ),
          ),
          child: LayoutBuilder(
            builder: (context, constraints) {
              final iconWidth = math.min(40.0, constraints.maxWidth);
              final labelWidth = (constraints.maxWidth - iconWidth).clamp(
                0.0,
                200.0,
              );
              return Row(
                children: [
                  SizedBox(
                    width: iconWidth,
                    child: Center(
                      child: Icon(icon, size: 18, color: iconColor),
                    ),
                  ),
                  if (clamped > 0.06 && labelWidth > 0)
                    SizedBox(
                      width: labelWidth,
                      child: ClipRect(
                        child: Align(
                          alignment: Alignment.centerLeft,
                          widthFactor: clamped,
                          child: Transform.translate(
                            offset: Offset(slide, 0),
                            child: Opacity(
                              opacity: clamped,
                              child: Padding(
                                padding: const EdgeInsets.only(
                                  left: AppThemeTokens.space2,
                                ),
                                child: Text(
                                  label,
                                  style: Theme.of(context).textTheme.bodyMedium
                                      ?.copyWith(
                                        color: labelColor,
                                        fontWeight: _fontWeight(
                                          AppThemeTokens.fontWeightSemibold,
                                        ),
                                      ),
                                ),
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                ],
              );
            },
          ),
        ),
      ),
    );
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
