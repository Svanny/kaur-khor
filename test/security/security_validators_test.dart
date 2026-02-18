import 'package:flutter_test/flutter_test.dart';

import 'package:banji/security/security_validators.dart';

void main() {
  group('SecurityValidators.normalizeText', () {
    test('trims and collapses whitespace in single-line mode', () {
      final normalized = SecurityValidators.normalizeText(
        '  hello   world  ',
        maxLength: 64,
      );
      expect(normalized, 'hello world');
    });

    test('rejects control characters by stripping them in normalization', () {
      final normalized = SecurityValidators.normalizeText(
        'ab\x00c\x1F',
        maxLength: 64,
      );
      expect(normalized, 'abc');
    });

    test('supports multiline normalization', () {
      final normalized = SecurityValidators.normalizeText(
        ' line 1  \r\n\tline 2 ',
        maxLength: 64,
        allowMultiline: true,
      );
      expect(normalized, 'line 1\nline 2');
    });

    test('enforces max length', () {
      final normalized = SecurityValidators.normalizeText(
        'abcdef',
        maxLength: 4,
      );
      expect(normalized, 'abcd');
    });
  });

  group('SecurityValidators.validateRequiredText', () {
    test('accepts valid text', () {
      final error = SecurityValidators.validateRequiredText(
        'Valid Name',
        fieldName: 'Name',
        maxLength: 20,
      );
      expect(error, isNull);
    });

    test('rejects empty or whitespace-only values', () {
      final error = SecurityValidators.validateRequiredText(
        '   ',
        fieldName: 'Name',
        maxLength: 20,
      );
      expect(error, 'Name field is required.');
    });

    test('rejects control characters', () {
      final error = SecurityValidators.validateRequiredText(
        'Name\x00',
        fieldName: 'Name',
        maxLength: 20,
      );
      expect(error, 'Name field must not contain control characters.');
    });

    test('rejects bidirectional control characters', () {
      final error = SecurityValidators.validateRequiredText(
        'Name\u202E',
        fieldName: 'Name',
        maxLength: 20,
      );
      expect(error, 'Name field must not contain control characters.');
    });

    test('rejects over-limit values', () {
      final error = SecurityValidators.validateRequiredText(
        'abcdefghijklmnop',
        fieldName: 'Name',
        maxLength: 5,
      );
      expect(error, 'Name field must be at most 5 characters.');
    });
  });

  group('SecurityValidators numeric validation', () {
    test('accepts valid non-negative decimal', () {
      expect(
        SecurityValidators.validateNonNegativeDecimal(
          '1200.50',
          fieldName: 'Price',
        ),
        isNull,
      );
    });

    test('rejects invalid decimal, NaN, and infinity', () {
      expect(
        SecurityValidators.validateNonNegativeDecimal(
          '12x',
          fieldName: 'Price',
        ),
        'Price field must be a valid number (no symbols or letters).',
      );
      expect(
        SecurityValidators.validateNonNegativeDecimal(
          'NaN',
          fieldName: 'Price',
        ),
        'Price field must be a valid number (no symbols or letters).',
      );
      expect(
        SecurityValidators.validateNonNegativeDecimal(
          'Infinity',
          fieldName: 'Price',
        ),
        'Price field must be a valid number (no symbols or letters).',
      );
    });

    test('rejects negative values where disallowed', () {
      expect(
        SecurityValidators.validateNonNegativeDecimal('-1', fieldName: 'Price'),
        'Price field cannot be negative.',
      );
      expect(
        SecurityValidators.validateNonNegativeInteger('-2', fieldName: 'Bulk'),
        'Bulk field cannot be negative.',
      );
    });

    test('rejects values above configured numeric limits', () {
      expect(
        SecurityValidators.validateNonNegativeDecimal(
          '1000.01',
          fieldName: 'Price',
          maxValue: 1000,
        ),
        'Price field must be at most 1000.',
      );
      expect(
        SecurityValidators.validatePositiveDecimal(
          '250',
          fieldName: 'Ratio',
          maxValue: 100,
        ),
        'Ratio field must be at most 100.',
      );
      expect(
        SecurityValidators.validateNonNegativeInteger(
          '1001',
          fieldName: 'Bulk',
          maxValue: 1000,
        ),
        'Bulk field must be at most 1000.',
      );
      expect(
        SecurityValidators.validatePositiveInteger(
          '101',
          fieldName: 'Pieces',
          maxValue: 100,
        ),
        'Pieces field must be at most 100.',
      );
    });

    test('accepts and rejects positive-only validators correctly', () {
      expect(
        SecurityValidators.validatePositiveDecimal('0.5', fieldName: 'Ratio'),
        isNull,
      );
      expect(
        SecurityValidators.validatePositiveInteger('1', fieldName: 'Pieces'),
        isNull,
      );
      expect(
        SecurityValidators.validatePositiveDecimal('0', fieldName: 'Ratio'),
        'Ratio field must be greater than 0.',
      );
      expect(
        SecurityValidators.validatePositiveInteger('0', fieldName: 'Pieces'),
        'Pieces field must be greater than 0.',
      );
    });
  });
}
