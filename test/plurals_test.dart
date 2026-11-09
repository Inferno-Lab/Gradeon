import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/translations/app_translations.dart';
import 'package:gradeon/core/utils/extensions.dart';

void main() {
  test('a count of one reads in the singular, others in the plural', () {
    Get
      ..addTranslations(AppTranslations().keys)
      ..locale = const Locale('en');
    expect('homework.n_files'.trn(1), '1 file');
    expect('homework.n_files'.trn(3), '3 files');
    expect('teacher.oldest'.trn(1), 'oldest 1 day');
    // A key without a singular keeps its one form.
    expect('teacher.n_absent'.trn(1), '1 absent');
  });
}
