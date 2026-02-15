import 'dart:math';

import 'security_limits.dart';

class IdGenerator {
  IdGenerator._();

  static final Random _random = Random.secure();
  static const String _alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';

  static String newSkuId() {
    return _newId('sku');
  }

  static String newServiceId() {
    return _newId('service');
  }

  static String _newId(String prefix) {
    return '$prefix-${_randomToken(SecurityLimits.idRandomLength)}';
  }

  static String _randomToken(int length) {
    final buffer = StringBuffer();
    for (var i = 0; i < length; i++) {
      buffer.write(_alphabet[_random.nextInt(_alphabet.length)]);
    }
    return buffer.toString();
  }
}
