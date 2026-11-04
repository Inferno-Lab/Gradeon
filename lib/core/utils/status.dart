import 'package:gradeon/core/utils/formatters.dart';
import 'package:gradeon/data/models/academics.dart';
import 'package:gradeon/data/models/campus.dart';

enum MoneyStatus { paid, due, overdue, upcoming }

MoneyStatus moneyStatus(Installment item) {
  if (item.paid) return MoneyStatus.paid;
  final days = Formatters.daysUntil(item.dueDate);
  if (days < 0) return MoneyStatus.overdue;
  if (days <= 21) return MoneyStatus.due;
  return MoneyStatus.upcoming;
}

class AttendanceSummary {
  const AttendanceSummary({
    required this.present,
    required this.absent,
    required this.lateCount,
    required this.holiday,
  });

  final int present;
  final int absent;
  final int lateCount;
  final int holiday;

  double get percent {
    final marked = present + absent + lateCount;
    if (marked == 0) return 0;
    return (present + lateCount) / marked * 100;
  }

  // ignore: sort_constructors_first
  factory AttendanceSummary.from(List<AttendanceDay> days) {
    var present = 0;
    var absent = 0;
    var lateCount = 0;
    var holiday = 0;
    for (final day in days) {
      switch (day.status) {
        case AttendanceStatus.present:
          present++;
        case AttendanceStatus.absent:
          absent++;
        case AttendanceStatus.lateArrival:
          lateCount++;
        case AttendanceStatus.holiday:
          holiday++;
      }
    }
    return AttendanceSummary(
      present: present,
      absent: absent,
      lateCount: lateCount,
      holiday: holiday,
    );
  }
}

String weekdayKey(DateTime date) {
  const keys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  return keys[date.weekday - 1];
}

/// School days in a row (present or late) counting back from the latest mark.
/// Holidays don't break a streak.
int attendanceStreak(List<AttendanceDay> days) {
  final sorted = [...days]..sort((a, b) => b.date.compareTo(a.date));
  var streak = 0;
  for (final day in sorted) {
    if (day.status == AttendanceStatus.holiday) continue;
    if (day.status == AttendanceStatus.absent) break;
    streak++;
  }
  return streak;
}
