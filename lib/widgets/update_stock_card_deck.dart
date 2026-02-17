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

  @override
  State<UpdateStockCardDeck> createState() => _UpdateStockCardDeckState();
}

class _UpdateStockCardDeckState extends State<UpdateStockCardDeck> {
  static const double _frontDismissFadeStrength = 0.45;
  static const double _restoreStartOffsetY = 72;
  static const double _backfillStartOffsetY = 24;
  static const double _backEjectBaseOffsetY = 40;
  static const double _backEjectTravelY = 24;
  static const double _backEjectScale = 0.92;

  final CardSwiperController _cardSwiperController = CardSwiperController();
  final List<int> _dismissedHistory = <int>[];

  int? _restoreOverlayIndex;
  int? _pendingRestoreIndex;
  int? _backEjectOverlayIndex;
  bool _isRestoreAnimating = false;
  int _restoreAnimationGeneration = 0;

  int _previewGeneration = 0;
  int _backfillGeneration = 0;
  int? _backfillPreviewIndex;

  @override
  void didUpdateWidget(covariant UpdateStockCardDeck oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (widget.currentIndex != oldWidget.currentIndex) {
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
        if (_backEjectOverlayIndex != null)
          Positioned.fill(
            child: IgnorePointer(child: _buildBackEjectOverlayCard()),
          ),
        CardSwiper(
          key: widget.swiperKey,
          controller: _cardSwiperController,
          cardsCount: widget.cardsCount,
          initialIndex: widget.currentIndex,
          duration: widget.animationDuration,
          padding: EdgeInsets.zero,
          maxAngle: 0,
          threshold: 30,
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
          cardBuilder: (context, index, _, verticalOffsetPercentage) {
            return _buildDeckCard(
              context: context,
              index: index,
              verticalOffsetPercentage: verticalOffsetPercentage,
            );
          },
        ),
        if (_restoreOverlayIndex != null)
          Positioned.fill(
            child: IgnorePointer(child: _buildRestoreOverlayCard()),
          ),
      ],
    );
  }

  bool _onSwipe({
    required int previousIndex,
    required int? currentIndex,
    required CardSwiperDirection direction,
  }) {
    if (_isRestoreAnimating) {
      return false;
    }

    if (direction == CardSwiperDirection.top) {
      final isAtLastCard = previousIndex >= widget.cardsCount - 1;
      if (isAtLastCard) {
        widget.onReachedEndForward();
        return false;
      }
      if (currentIndex == null) {
        return false;
      }
      _dismissedHistory.add(previousIndex);
      _startBackfillAnimation(currentIndex);
      widget.onCurrentIndexChanged(currentIndex);
      return true;
    }

    if (direction == CardSwiperDirection.bottom) {
      if (_dismissedHistory.isEmpty) {
        return false;
      }
      final restoreIndex = _dismissedHistory.removeLast();
      _startRestoreAnimation(
        restoreIndex: restoreIndex,
        backEjectIndex: _backCardIndexFor(widget.currentIndex),
      );
      return false;
    }

    return false;
  }

  Widget _buildDeckCard({
    required BuildContext context,
    required int index,
    required int verticalOffsetPercentage,
  }) {
    if (_backEjectOverlayIndex == index) {
      return const SizedBox.shrink();
    }

    final isFrontCard = index == widget.currentIndex;
    if (isFrontCard) {
      final upwardProgress = verticalOffsetPercentage < 0
          ? (verticalOffsetPercentage.abs() / 100).clamp(0.0, 1.0)
          : 0.0;
      final opacity = (1 - (upwardProgress * _frontDismissFadeStrength)).clamp(
        0.0,
        1.0,
      );
      return Opacity(
        opacity: opacity,
        child: widget.cardBuilder(context, index),
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

  Widget _buildRestoreOverlayCard() {
    final index = _restoreOverlayIndex;
    if (index == null) {
      return const SizedBox.shrink();
    }

    final generation = _restoreAnimationGeneration;
    return TweenAnimationBuilder<double>(
      key: ValueKey('${widget.downOverlayKeyPrefix}$generation'),
      tween: Tween<double>(begin: 0, end: 1),
      duration: widget.animationDuration,
      curve: Curves.easeOutCubic,
      onEnd: () {
        if (!mounted || generation != _restoreAnimationGeneration) {
          return;
        }
        final restoreIndex = _pendingRestoreIndex;
        setState(() {
          _isRestoreAnimating = false;
          _restoreOverlayIndex = null;
          _pendingRestoreIndex = null;
          _backEjectOverlayIndex = null;
          _previewGeneration += 1;
          _backfillGeneration += 1;
          _backfillPreviewIndex = restoreIndex == null
              ? null
              : _backfillIndexFor(restoreIndex);
        });
        if (restoreIndex != null) {
          widget.onCurrentIndexChanged(restoreIndex);
        }
      },
      builder: (context, progress, child) {
        final translateY = (1 - progress) * -_restoreStartOffsetY;
        return Opacity(
          opacity: progress.clamp(0.0, 1.0),
          child: Transform.translate(
            offset: Offset(0, translateY),
            child: child,
          ),
        );
      },
      child: widget.cardBuilder(context, index),
    );
  }

  Widget _buildBackEjectOverlayCard() {
    final index = _backEjectOverlayIndex;
    if (index == null) {
      return const SizedBox.shrink();
    }

    final generation = _restoreAnimationGeneration;
    return TweenAnimationBuilder<double>(
      key: ValueKey('${widget.downBackEjectKeyPrefix}$generation'),
      tween: Tween<double>(begin: 0, end: 1),
      duration: widget.animationDuration,
      curve: Curves.easeInCubic,
      builder: (context, progress, child) {
        final translateY =
            _backEjectBaseOffsetY + (progress * _backEjectTravelY);
        final scale = _backEjectScale - (progress * 0.04);
        return Opacity(
          opacity: (1 - progress).clamp(0.0, 1.0),
          child: Transform.translate(
            offset: Offset(0, translateY),
            child: Transform.scale(scale: scale, child: child),
          ),
        );
      },
      child: widget.cardBuilder(context, index),
    );
  }

  void _startBackfillAnimation(int currentIndex) {
    setState(() {
      _previewGeneration += 1;
      _backfillGeneration += 1;
      _backfillPreviewIndex = _backfillIndexFor(currentIndex);
    });
  }

  void _startRestoreAnimation({
    required int restoreIndex,
    required int? backEjectIndex,
  }) {
    setState(() {
      _isRestoreAnimating = true;
      _restoreAnimationGeneration += 1;
      _restoreOverlayIndex = restoreIndex;
      _pendingRestoreIndex = restoreIndex;
      _backEjectOverlayIndex = backEjectIndex;
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
    if (_restoreOverlayIndex case final restoreIndex?) {
      indices.add(restoreIndex);
    }
    if (_backEjectOverlayIndex case final backEjectIndex?) {
      indices.add(backEjectIndex);
    }
    yield* indices;
  }

  int? _backfillIndexFor(int currentIndex) {
    final index = currentIndex + (widget.maxStackCards - 1);
    return index < widget.cardsCount ? index : null;
  }

  int? _backCardIndexFor(int currentIndex) {
    final index = currentIndex + (widget.maxStackCards - 1);
    return index < widget.cardsCount ? index : null;
  }
}
