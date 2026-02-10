import 'package:flutter/material.dart';

import 'theme/app_theme.dart';

void main() {
  runApp(const BanjiApp());
}

class BanjiApp extends StatelessWidget {
  const BanjiApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'Banji Dashboard',
      theme: AppTheme.light(),
      home: const DashboardView(),
    );
  }
}

class DashboardView extends StatelessWidget {
  const DashboardView({super.key});

  @override
  Widget build(BuildContext context) {
    final edgePadding = AppThemeTokens.screenEdgePadding(
      MediaQuery.sizeOf(context),
    );

    return Scaffold(
      appBar: AppBar(
        title: const Text('banji'),
        actions: [
          IconButton(
            onPressed: () {},
            icon: const Icon(Icons.notifications_none_rounded),
          ),
          IconButton(
            onPressed: () {},
            icon: const Icon(Icons.tune_rounded),
          ),
        ],
      ),
      body: ListView(
        padding: edgePadding,
        children: const [
          _SectionTitle('Key Metrics'),
          SizedBox(height: 12),
          _MetricGrid(),
          SizedBox(height: 24),
          _SectionTitle('Performance'),
          SizedBox(height: 12),
          _ChartPlaceholder(),
          SizedBox(height: 24),
          _SectionTitle('Recent Activity'),
          SizedBox(height: 12),
          _ActivityList(),
        ],
      ),
    );
  }
}

class _SectionTitle extends StatelessWidget {
  const _SectionTitle(this.title);

  final String title;

  @override
  Widget build(BuildContext context) {
    return Text(
      title,
      style: Theme.of(context).textTheme.titleMedium?.copyWith(
            fontWeight: FontWeight.w700,
          ),
    );
  }
}

class _MetricGrid extends StatelessWidget {
  const _MetricGrid();

  @override
  Widget build(BuildContext context) {
    return GridView.builder(
      itemCount: 4,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        crossAxisSpacing: 12,
        mainAxisSpacing: 12,
        childAspectRatio: 1.7,
      ),
      itemBuilder: (_, __) => const _Card(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            _BarPlaceholder(width: 72, height: 10),
            SizedBox(height: 12),
            _BarPlaceholder(width: 120, height: 20),
          ],
        ),
      ),
    );
  }
}

class _ChartPlaceholder extends StatelessWidget {
  const _ChartPlaceholder();

  @override
  Widget build(BuildContext context) {
    return const _Card(
      height: 220,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.end,
        children: [
          _BarPlaceholder(width: double.infinity, height: 6),
          SizedBox(height: 20),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceEvenly,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              _BarPlaceholder(width: 20, height: 70),
              _BarPlaceholder(width: 20, height: 130),
              _BarPlaceholder(width: 20, height: 100),
              _BarPlaceholder(width: 20, height: 150),
              _BarPlaceholder(width: 20, height: 90),
              _BarPlaceholder(width: 20, height: 120),
            ],
          ),
          SizedBox(height: 12),
        ],
      ),
    );
  }
}

class _ActivityList extends StatelessWidget {
  const _ActivityList();

  @override
  Widget build(BuildContext context) {
    return Column(
      children: List.generate(
        5,
        (index) => const Padding(
          padding: EdgeInsets.only(bottom: 10),
          child: _Card(
            child: Row(
              children: [
                CircleAvatar(
                  radius: 20,
                  backgroundColor: Color(0xFFE2E8F0),
                ),
                SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      _BarPlaceholder(width: 160, height: 10),
                      SizedBox(height: 8),
                      _BarPlaceholder(width: 100, height: 10),
                    ],
                  ),
                ),
                SizedBox(width: 8),
                _BarPlaceholder(width: 44, height: 10),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.child, this.height});

  final Widget child;
  final double? height;

  @override
  Widget build(BuildContext context) {
    return Container(
      height: height,
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFE5E7EB)),
        boxShadow: const [
          BoxShadow(
            color: Color(0x0A0F172A),
            blurRadius: 8,
            offset: Offset(0, 2),
          ),
        ],
      ),
      child: child,
    );
  }
}

class _BarPlaceholder extends StatelessWidget {
  const _BarPlaceholder({required this.width, required this.height});

  final double width;
  final double height;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: const Color(0xFFE2E8F0),
        borderRadius: BorderRadius.circular(8),
      ),
    );
  }
}
