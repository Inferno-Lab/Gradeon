import 'package:tangent/data/models/academics.dart';
import 'package:tangent/core/utils/clock.dart';

/// Minutes since midnight for "HH:mm".
int minutesOf(String hhmm) {
  final parts = hhmm.split(':');
  return int.parse(parts[0]) * 60 + int.parse(parts[1]);
}

int nowMinutes([DateTime? at]) {
  final now = at ?? Clock.now();
  return now.hour * 60 + now.minute;
}

/// "9:52", 12-hour without a suffix, as printed on the ribbon.
String clockOf(int minutes) {
  final h = minutes ~/ 60;
  final m = minutes % 60;
  final hh = h > 12 ? h - 12 : (h == 0 ? 12 : h);
  return '$hh:${m.toString().padLeft(2, '0')}';
}

/// The period at [minute], or the last one that has started. Gaps between
/// periods count as the previous period (a few minutes of walking).
PeriodSlot? periodAt(List<PeriodSlot> periods, int minute) {
  if (periods.isEmpty) return null;
  for (final p in periods) {
    if (minute < minutesOf(p.end) + 3) return p;
  }
  return periods.last;
}

PeriodSlot? nextClassAfter(List<PeriodSlot> periods, PeriodSlot? current) {
  if (current == null) return null;
  final i = periods.indexOf(current);
  for (var j = i + 1; j < periods.length; j++) {
    if (periods[j].kind == PeriodKind.klass) return periods[j];
  }
  return null;
}

/// Weekdays (`DateTime.monday` to `DateTime.sunday`) the school is closed every week. A school build takes them from
/// the console (`calendar.weeklyOff`, set by `SchoolConfig.load`); the demo content teaches all seven days so every
/// screen has lectures whatever day it is.
final weeklyOffDays = <int>{};

bool isWeeklyOff(DateTime d) => weeklyOffDays.contains(d.weekday);
