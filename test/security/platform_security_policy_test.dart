import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

void main() {
  test('android release is not debug signed and app id is not com.example', () {
    final gradle = File('android/app/build.gradle.kts').readAsStringSync();

    expect(
      gradle.contains('signingConfig = signingConfigs.getByName("debug")'),
      isFalse,
    );
    expect(gradle.contains('applicationId = "com.example.'), isFalse);
  });

  test('android manifest declares explicit backup policy', () {
    final manifest = File(
      'android/app/src/main/AndroidManifest.xml',
    ).readAsStringSync();

    expect(manifest.contains('android:allowBackup="'), isTrue);
  });

  test('ios plist does not weaken ATS', () {
    final infoPlist = File('ios/Runner/Info.plist').readAsStringSync();

    expect(infoPlist.contains('NSAllowsArbitraryLoads'), isFalse);
  });

  test('macos release entitlements remain minimal', () {
    final entitlements = File(
      'macos/Runner/Release.entitlements',
    ).readAsStringSync();

    expect(entitlements.contains('com.apple.security.network.server'), isFalse);
  });

  test('web index includes CSP meta policy', () {
    final indexHtml = File('web/index.html').readAsStringSync();

    expect(indexHtml.toLowerCase().contains('content-security-policy'), isTrue);
  });
}
