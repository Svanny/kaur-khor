import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_card_swiper/flutter_card_swiper.dart';

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
  static const int _swipeThreshold = 30;
  static const double _boundaryFogTransitionHeight = 48;
  static const double _backfillStartOffsetY = 24;

  final CardSwiperController _cardSwiperController = CardSwiperController();
  final List<int> _dismissedHistory = <int>[];

  int _previewGeneration = 0;
  int _backfillGeneration = 0;
  int? _backfillPreviewIndex;
  bool _isUpwardDragActive = false;
  bool _holdBoundaryFogForSwipeOut = false;

  @override
  void didUpdateWidget(covariant UpdateStockCardDeck oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.currentIndex != oldWidget.currentIndex) {
      _holdBoundaryFogForSwipeOut = false;
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (!mounted) {
          return;
        }
        _cardSwiperController.moveTo(widget.currentIndex);
      });
    }
  }

  @override
  void dispose() {
    _cardSwiperController.dispose();
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
        CardSwiper(
          key: widget.swiperKey,
          controller: _cardSwiperController,
          cardsCount: widget.cardsCount,
          initialIndex: widget.currentIndex,
          duration: widget.animationDuration,
          padding: EdgeInsets.zero,
          maxAngle: 0,
          threshold: _swipeThreshold,
          scale: 0.96,
          isLoop: false,
          numberOfCardsDisplayed: math.min(
            widget.maxStackCards,
            widget.cardsCount,
          ),
          backCardOffset: const Offset(0, 20),
          allowedSwipeDirection: const AllowedSwipeDirection.only(
            up: true,
            down: true,
          ),
          onSwipe: (previousIndex, currentIndex, direction) {
            return _onSwipe(
              previousIndex: previousIndex,
              currentIndex: currentIndex,
              direction: direction,
            );
          },
          onSwipeDirectionChange: (_, verticalDirection) {
            final isUpward = verticalDirection == CardSwiperDirection.top;
            if (_isUpwardDragActive == isUpward) {
              return;
            }
            setState(() => _isUpwardDragActive = isUpward);
          },
          cardBuilder: (context, index, _, verticalOffsetPercentage) {
            return _buildDeckCard(
              context: context,
              index: index,
              verticalOffsetPercentage: verticalOffsetPercentage,
            );
          },
        ),
      ],
    );
  }

  bool _onSwipe({
    required int previousIndex,
    required int? currentIndex,
    required CardSwiperDirection direction,
  }) {
    if (direction == CardSwiperDirection.top) {
      final isAtLastCard = previousIndex >= widget.cardsCount - 1;
      if (isAtLastCard) {
        _setBoundaryFogSwipeHold(false);
        widget.onReachedEndForward();
        return false;
      }
      if (currentIndex == null) {
        _setBoundaryFogSwipeHold(false);
        return false;
      }
      _setBoundaryFogSwipeHold(true);
      _dismissedHistory.add(previousIndex);
      _startBackfillAnimation(currentIndex);
      widget.onCurrentIndexChanged(currentIndex);
      return true;
    }

    if (direction == CardSwiperDirection.bottom) {
      _setBoundaryFogSwipeHold(false);
      if (_dismissedHistory.isEmpty) {
        return false;
      }
      final restoreIndex = _dismissedHistory.removeLast();
      _previewGeneration += 1;
      _backfillGeneration += 1;
      _backfillPreviewIndex = _backfillIndexFor(restoreIndex);
      widget.onCurrentIndexChanged(restoreIndex);
      return false;
    }

    return false;
  }

  void _setBoundaryFogSwipeHold(bool hold) {
    if (_holdBoundaryFogForSwipeOut == hold) {
      return;
    }
    setState(() => _holdBoundaryFogForSwipeOut = hold);
  }

  Widget _buildDeckCard({
    required BuildContext context,
    required int index,
    required int verticalOffsetPercentage,
  }) {
    final isFrontCard = index == widget.currentIndex;
    if (isFrontCard) {
      final frontCard = widget.cardBuilder(context, index);
      if (_isDownwardRestoreDrag(verticalOffsetPercentage)) {
        return _buildFrontCardWithDownwardRestorePreview(
          context: context,
          child: frontCard,
          verticalOffsetPercentage: verticalOffsetPercentage,
        );
      }
      return _buildFrontCardWithBoundaryFog(
        context: context,
        child: frontCard,
        verticalOffsetPercentage: verticalOffsetPercentage,
      );
    }

    final preview = IgnorePointer(
      child: KeyedSubtree(
        key: ValueKey(
          '${widget.stackCardKeyPrefix}$index-g$_previewGeneration',
        ),
        child: widget.cardBuilder(context, index),
      ),
    );

    if (_backfillPreviewIndex != index) {
      return preview;
    }

    final generation = _backfillGeneration;
    return TweenAnimationBuilder<double>(
      key: ValueKey('${widget.backfillKeyPrefix}$index-g$generation'),
      tween: Tween<double>(begin: 0, end: 1),
      duration: widget.animationDuration,
      curve: Curves.easeOutCubic,
      builder: (context, progress, child) {
        final translateY = (1 - progress) * _backfillStartOffsetY;
        return Opacity(
          opacity: progress.clamp(0.0, 1.0),
          child: Transform.translate(
            offset: Offset(0, translateY),
            child: child,
          ),
        );
      },
      child: preview,
    );
  }

  bool _isDownwardRestoreDrag(int verticalOffsetPercentage) {
    return verticalOffsetPercentage > 0 && _dismissedHistory.isNotEmpty;
  }

  Widget _buildFrontCardWithDownwardRestorePreview({
    required BuildContext context,
    required Widget child,
    required int verticalOffsetPercentage,
  }) {
    if (_dismissedHistory.isEmpty) {
      return child;
    }

    final dragOffsetY = (verticalOffsetPercentage * _swipeThreshold) / 100;
    final enhancedDragOffsetY = dragOffsetY * 2;
    final restoreIndex = _dismissedHistory.last;
    return LayoutBuilder(
      builder: (context, constraints) {
        final previewTranslateY =
            widget.boundaryFogOffsetFromDeckTop -
            constraints.maxHeight +
            dragOffsetY;
        return Stack(
          fit: StackFit.expand,
          clipBehavior: Clip.none,
          children: [
            Transform.translate(offset: Offset(0, -dragOffsetY), child: child),
            Transform.translate(
              offset: Offset(
                0,
                previewTranslateY + enhancedDragOffsetY - dragOffsetY,
              ),
              child: IgnorePointer(
                child: KeyedSubtree(
                  key: ValueKey(
                    'update-stock-down-ether-preview-$restoreIndex',
                  ),
                  child: widget.cardBuilder(context, restoreIndex),
                ),
              ),
            ),
          ],
        );
      },
    );
  }

  Widget _buildFrontCardWithBoundaryFog({
    required BuildContext context,
    required Widget child,
    required int verticalOffsetPercentage,
  }) {
    if (!_isUpwardDragActive && !_holdBoundaryFogForSwipeOut) {
      return child;
    }

    final dragOffsetY = (verticalOffsetPercentage * _swipeThreshold) / 100;
    late final double fogStartY;
    late final double fogEndY;

    if (widget.boundaryFogEndOffsetFromDeckTop case final fogEndOffset?) {
      fogStartY = widget.boundaryFogOffsetFromDeckTop - dragOffsetY;
      fogEndY = fogEndOffset - dragOffsetY;
      if (math.max(fogStartY, fogEndY) <= 0 && !_holdBoundaryFogForSwipeOut) {
        return child;
      }
    } else {
      fogStartY = widget.boundaryFogOffsetFromDeckTop - dragOffsetY;
      if (fogStartY <= 0 && !_holdBoundaryFogForSwipeOut) {
        return child;
      }
      fogEndY = fogStartY + _boundaryFogTransitionHeight;
    }

    return ShaderMask(
      key: const ValueKey('update-stock-boundary-fog-mask'),
      blendMode: BlendMode.dstIn,
      shaderCallback: (Rect rect) {
        if (rect.height <= 0) {
          return const LinearGradient(
            colors: <Color>[Colors.transparent, Colors.transparent],
          ).createShader(rect);
        }

        final minStop = math.min(fogStartY, fogEndY);
        final maxStop = math.max(fogStartY, fogEndY);
        final start = (minStop / rect.height).clamp(0.0, 1.0).toDouble();
        var end = (maxStop / rect.height).clamp(0.0, 1.0).toDouble();
        if (end <= start) {
          end = (start + 0.001).clamp(0.0, 1.0).toDouble();
        }

        return LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: <Color>[
            Colors.transparent,
            Colors.transparent,
            Colors.white,
            Colors.white,
          ],
          stops: <double>[0, start, end, 1],
        ).createShader(rect);
      },
      child: child,
    );
  }

  void _startBackfillAnimation(int currentIndex) {
    setState(() {
      _previewGeneration += 1;
      _backfillGeneration += 1;
      _backfillPreviewIndex = _backfillIndexFor(currentIndex);
    });
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
              child: RepaintBoundary(
                key: ValueKey('${widget.preloadKeyPrefix}$index'),
                child: widget.cardBuilder(context, index),
              ),
            ),
        ],
      ),
    );
  }

  Iterable<int> _preloadCardIndices() sync* {
    final indices = <int>{};
    for (var i = 0; i < widget.maxStackCards; i += 1) {
      final index = widget.currentIndex + i;
      if (index < widget.cardsCount) {
        indices.add(index);
      }
    }
    if (_dismissedHistory case [..., final lastDismissed]) {
      indices.add(lastDismissed);
    }
    yield* indices;
  }

  int? _backfillIndexFor(int currentIndex) {
    final index = currentIndex + (widget.maxStackCards - 1);
    return index < widget.cardsCount ? index : null;
  }
}
