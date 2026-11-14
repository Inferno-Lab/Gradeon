import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:tangent/core/translations/app_translations.dart';

/// Every literal `'area.key'.tr` / `.trp(` in lib must exist in English, or families see raw keys.
void main() {
  test('literal translation keys all exist in English', () {
    final english = AppTranslations().keys['en']!;
    final pattern = RegExp(r"'([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+)'\s*\.\s*(?:tr|trp)\b");
    final missing = <String>{};
    for (final file in Directory('lib').listSync(recursive: true).whereType<File>()) {
      if (!file.path.endsWith('.dart')) continue;
      for (final m in pattern.allMatches(file.readAsStringSync())) {
        if (!english.containsKey(m.group(1))) missing.add('${m.group(1)}  (${file.path})');
      }
    }
    expect(missing, isEmpty);
  });

  test('keys built from data exist: weekdays and every subject in the timetable', () {
    final english = AppTranslations().keys['en']!;
    final missing = <String>{
      for (final d in ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']) 'day.$d',
    };
    final timetable = jsonDecode(File('assets/mock/timetable.json').readAsStringSync()) as List;
    for (final row in timetable) {
      for (final p in (row as Map)['periods'] as List) {
        final subject = (p as Map)['subject'] as String;
        if (p['kind'] == 'class') missing.addAll(['subject.$subject', 'subject_short.$subject']);
      }
    }
    expect(missing.where((k) => !english.containsKey(k)), isEmpty);
  });
}
