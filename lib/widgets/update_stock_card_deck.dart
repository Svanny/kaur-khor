import 'package:flutter/material.dart';

class UpdateStockCardDeck extends StatefulWidget {
  const UpdateStockCardDeck({
    required this.cardsCount,
    required this.currentIndex,
    required this.cardBuilder,
    required this.onCurrentIndexChanged,
    required this.onReachedEndForward,
    required this.animationDuration,
    required this.swiperKey,
    this.maxStackCards = 3,
    this.preloadKeyPrefix = 'update-stock-preload-sku-card-',
    this.stackCardKeyPrefix = 'update-stock-sku-card-stack-',
    this.downOverlayKeyPrefix = 'update-stock-down-restore-overlay-',
    this.downBackEjectKeyPrefix = 'update-stock-down-back-eject-overlay-',
    this.backfillKeyPrefix = 'update-stock-backfill-preview-',
    this.boundaryFogOffsetFromDeckTop = 0,
    this.boundaryFogEndOffsetFromDeckTop,
    super.key,
  });

  final int cardsCount;
  final int currentIndex;
  final IndexedWidgetBuilder cardBuilder;
  final ValueChanged<int> onCurrentIndexChanged;
  final VoidCallback onReachedEndForward;
  final Duration animationDuration;
  final int maxStackCards;
  final Key swiperKey;
  final String preloadKeyPrefix;
  final String stackCardKeyPrefix;
  final String downOverlayKeyPrefix;
  final String downBackEjectKeyPrefix;
  final String backfillKeyPrefix;
  final double boundaryFogOffsetFromDeckTop;
  final double? boundaryFogEndOffsetFromDeckTop;

  @override
  State<UpdateStockCardDeck> createState() => _UpdateStockCardDeckState();
}

class _UpdateStockCardDeckState extends State<UpdateStockCardDeck> {
  static const int _cacheWindowSize = 3;

  late PageController _pageController;
  bool _isSyncingFromExternalState = false;

  int get _endSentinelPage => widget.cardsCount;

  @override
  void initState() {
    super.initState();
    _pageController = PageController(initialPage: widget.currentIndex);
  }

  @override
  void didUpdateWidget(covariant UpdateStockCardDeck oldWidget) {
    super.didUpdateWidget(oldWidget);
    final needsControllerReset = oldWidget.cardsCount != widget.cardsCount;
    if (needsControllerReset) {
      final initialPage = widget.currentIndex.clamp(0, widget.cardsCount);
      _pageController.dispose();
      _pageController = PageController(initialPage: initialPage);
      return;
    }

    if (widget.currentIndex == oldWidget.currentIndex ||
        !_pageController.hasClients) {
      return;
    }

    final currentPage =
        _pageController.page?.round() ?? _pageController.initialPage;
    if (currentPage == widget.currentIndex) {
      return;
    }

    _isSyncingFromExternalState = true;
    _pageController
        .animateToPage(
          widget.currentIndex,
          duration: widget.animationDuration,
          curve: Curves.easeOutCubic,
        )
        .whenComplete(() {
          if (mounted) {
            _isSyncingFromExternalState = false;
          }
        });
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (widget.cardsCount <= 0) {
      return const SizedBox.shrink();
    }

    return Stack(
      fit: StackFit.expand,
      children: [
        _buildPreloadedCards(),
        PageView.builder(
          key: widget.swiperKey,
          controller: _pageController,
          scrollDirection: Axis.vertical,
          padEnds: false,
          itemCount: widget.cardsCount + 1,
          onPageChanged: _onPageChanged,
          itemBuilder: (context, index) {
            if (index >= widget.cardsCount) {
              return const SizedBox.shrink();
            }
            return KeyedSubtree(
              key: ValueKey('${widget.stackCardKeyPrefix}$index'),
              child: widget.cardBuilder(context, index),
            );
          },
        ),
      ],
    );
  }

  void _onPageChanged(int pageIndex) {
    if (_isSyncingFromExternalState) {
      return;
    }

    if (pageIndex == _endSentinelPage) {
      widget.onReachedEndForward();
      return;
    }

    if (pageIndex != widget.currentIndex) {
      widget.onCurrentIndexChanged(pageIndex);
    }
  }

  Widget _buildPreloadedCards() {
    final preloadIndices = _preloadCardIndices().toList(growable: false);
    return IgnorePointer(
      child: Stack(
        fit: StackFit.expand,
        children: [
          for (final index in preloadIndices)
            Offstage(
              offstage: true,
              child: KeyedSubtree(
                key: ValueKey('${widget.preloadKeyPrefix}$index'),
                child: widget.cardBuilder(context, index),
              ),
            ),
        ],
      ),
    );
  }

  Iterable<int> _preloadCardIndices() sync* {
    if (widget.cardsCount <= 0) {
      return;
    }

    final indices = <int>{};
    var start = widget.currentIndex - 1;
    var end = widget.currentIndex + 1;

    while (start < 0) {
      start += 1;
      end += 1;
    }

    while (end >= widget.cardsCount) {
      start -= 1;
      end -= 1;
    }

    start = start.clamp(0, widget.cardsCount - 1);
    end = end.clamp(0, widget.cardsCount - 1);

    for (var index = start; index <= end; index += 1) {
      indices.add(index);
      if (indices.length == _cacheWindowSize) {
        break;
      }
    }

    for (
      var index = widget.currentIndex;
      index < widget.cardsCount;
      index += 1
    ) {
      if (indices.length == _cacheWindowSize) {
        break;
      }
      indices.add(index);
    }

    for (var index = widget.currentIndex; index >= 0; index -= 1) {
      if (indices.length == _cacheWindowSize) {
        break;
      }
      indices.add(index);
    }

    yield* indices;
  }
}
