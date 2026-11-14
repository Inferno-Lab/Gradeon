import 'package:tangent/core/utils/clock.dart';

/// Turns `today-3` and `today+1T08:15` into ISO strings anchored on today.
abstract final class DateSeed {
  static final _pattern = RegExp(r'^today([+-]\d+)?(?:T(\d{2}):(\d{2}))?$');

  static dynamic resolve(dynamic node) {
    if (node is String) return _resolveString(node);
    if (node is List) {
      return [for (final item in node) resolve(item)];
    }
    if (node is Map) {
      return <String, dynamic>{
        for (final entry in node.entries)
          entry.key.toString(): resolve(entry.value),
      };
    }
    return node;
  }

  static String _resolveString(String value) {
    final match = _pattern.firstMatch(value);
    if (match == null) return value;
    final offset = int.tryParse(match.group(1) ?? '') ?? 0;
    final now = Clock.now();
    final day = DateTime(now.year, now.month, now.day).add(Duration(days: offset));
    final iso =
        '${day.year.toString().padLeft(4, '0')}-'
        '${day.month.toString().padLeft(2, '0')}-'
        '${day.day.toString().padLeft(2, '0')}';
    final hour = match.group(2);
    if (hour == null) return iso;
    return '${iso}T$hour:${match.group(3)}:00';
  }
}
