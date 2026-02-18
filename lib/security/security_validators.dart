class SecurityValidators {
  const SecurityValidators._();

  static final RegExp _controlChars = RegExp(r'[\x00-\x1F\x7F]');
  static final RegExp _unsafeControlChars = RegExp(
    r'[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]',
  );
  // Reject bidi override/isolation controls that can visually spoof text.
  static final RegExp _bidiControlChars = RegExp(
    r'[\u202A-\u202E\u2066-\u2069]',
  );

  static String normalizeText(
    String input, {
    required int maxLength,
    bool allowMultiline = false,
  }) {
    final normalized = _normalizeInternal(
      input,
      allowMultiline: allowMultiline,
    );
    if (normalized.length > maxLength) {
      return normalized.substring(0, maxLength);
    }
    return normalized;
  }

  static String? validateRequiredText(
    String value, {
    required String fieldName,
    required int maxLength,
  }) {
    if (_unsafeControlChars.hasMatch(value) ||
        _bidiControlChars.hasMatch(value)) {
      return '$fieldName field must not contain control characters.';
    }

    final normalized = _normalizeInternal(value, allowMultiline: false);
    if (normalized.isEmpty) {
      return '$fieldName field is required.';
    }
    if (normalized.length > maxLength) {
      return '$fieldName field must be at most $maxLength characters.';
    }
    return null;
  }

  static String? validateNonNegativeDecimal(
    String value, {
    required String fieldName,
    double? maxValue,
  }) {
    final raw = value.trim();
    if (raw.isEmpty) {
      return '$fieldName field is required.';
    }
    final parsed = double.tryParse(raw);
    if (parsed == null || parsed.isNaN || !parsed.isFinite) {
      return '$fieldName field must be a valid number (no symbols or letters).';
    }
    if (parsed < 0) {
      return '$fieldName field cannot be negative.';
    }
    if (maxValue != null && parsed > maxValue) {
      return '$fieldName field must be at most ${_formatLimit(maxValue)}.';
    }
    return null;
  }

  static String? validatePositiveDecimal(
    String value, {
    required String fieldName,
    double? maxValue,
  }) {
    final raw = value.trim();
    if (raw.isEmpty) {
      return '$fieldName field is required.';
    }
    final parsed = double.tryParse(raw);
    if (parsed == null || parsed.isNaN || !parsed.isFinite) {
      return '$fieldName field must be a valid number (no symbols or letters).';
    }
    if (parsed <= 0) {
      return '$fieldName field must be greater than 0.';
    }
    if (maxValue != null && parsed > maxValue) {
      return '$fieldName field must be at most ${_formatLimit(maxValue)}.';
    }
    return null;
  }

  static String? validateNonNegativeInteger(
    String value, {
    required String fieldName,
    int? maxValue,
  }) {
    final raw = value.trim();
    if (raw.isEmpty) {
      return '$fieldName field is required.';
    }
    final parsed = int.tryParse(raw);
    if (parsed == null) {
      return '$fieldName field must be a valid whole number (no symbols or letters).';
    }
    if (parsed < 0) {
      return '$fieldName field cannot be negative.';
    }
    if (maxValue != null && parsed > maxValue) {
      return '$fieldName field must be at most ${_formatLimit(maxValue)}.';
    }
    return null;
  }

  static String? validatePositiveInteger(
    String value, {
    required String fieldName,
    int? maxValue,
  }) {
    final raw = value.trim();
    if (raw.isEmpty) {
      return '$fieldName field is required.';
    }
    final parsed = int.tryParse(raw);
    if (parsed == null) {
      return '$fieldName field must be a valid whole number (no symbols or letters).';
    }
    if (parsed <= 0) {
      return '$fieldName field must be greater than 0.';
    }
    if (maxValue != null && parsed > maxValue) {
      return '$fieldName field must be at most ${_formatLimit(maxValue)}.';
    }
    return null;
  }

  static String _formatLimit(num value) {
    if (value is int) {
      return value.toString();
    }
    final doubleValue = value.toDouble();
    if (doubleValue == doubleValue.roundToDouble()) {
      return doubleValue.toStringAsFixed(0);
    }
    return doubleValue.toString();
  }

  static String _normalizeInternal(
    String input, {
    required bool allowMultiline,
  }) {
    var normalized = input;
    if (allowMultiline) {
      normalized = normalized.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
      normalized = normalized.replaceAll(
        RegExp(r'[\x00-\x09\x0B\x0C\x0E-\x1F\x7F]'),
        '',
      );
      normalized = normalized
          .split('\n')
          .map((line) => line.trim().replaceAll(RegExp(r'\s+'), ' '))
          .join('\n')
          .trim();
    } else {
      normalized = normalized.replaceAll(_controlChars, '');
      normalized = normalized.trim().replaceAll(RegExp(r'\s+'), ' ');
    }
    return normalized;
  }
}
