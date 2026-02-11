import 'package:flutter/material.dart';

import 'theme/app_theme.dart';
import 'views/home_view.dart';

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
      home: const HomeView(),
    );
  }
}
