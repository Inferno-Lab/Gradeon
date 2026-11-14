import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:tangent/core/services/theme_service.dart';
import 'package:tangent/core/theme/app_colors.dart';
import 'package:tangent/core/theme/app_typography.dart';
import 'package:tangent/core/theme/tokens.dart';
import 'package:tangent/core/translations/en_redesign.dart';

extension AppContext on BuildContext {
  ColorScheme get colors => Theme.of(this).colorScheme;

  AppColors get app => Theme.of(this).extension<AppColors>()!;

  AppType get type => AppType(app);

  TextTheme get text => Theme.of(this).textTheme;

  bool get isWide => MediaQuery.sizeOf(this).width >= AppBreakpoints.tablet;

  bool get reduceMotion =>
      MediaQuery.disableAnimationsOf(this) ||
      (Get.isRegistered<ThemeService>() && Get.find<ThemeService>().reduceMotion.value);

}

extension DateOnly on DateTime {
  DateTime get dateOnly => DateTime(year, month, day);

  bool isSameDay(DateTime other) => year == other.year && month == other.month && day == other.day;
}

extension SafeTranslate on String {
  /// Translates this key and fills `@name` placeholders.
  ///
  /// GetX's own `trParams` replaces keys in map order, so `@n` also rewrote the
  /// start of `@name` ("1ame"). This replaces the longest keys first.
  String trp(Map<String, String> params) {
    final keys = params.keys.toList()..sort((a, b) => b.length.compareTo(a.length));
    var out = tr;
    for (final key in keys) {
      out = out.replaceAll('@$key', params[key]!);
    }
    return out;
  }

  /// A count: `'homework.n_files'.trn(1)` is "1 file" through the key's `_one` form. A language uses its own singular,
  /// or the English one only while its plural is still English, so a Hindi screen never shows an English word.
  String trn(num n, [Map<String, String> params = const {}]) {
    final one = '${this}_one';
    final translated = one.tr != enRedesign[one] || tr == enRedesign[this];
    return (n == 1 && one.tr != one && translated ? one : this).trp({'n': '$n', ...params});
  }
}
