import 'package:intl/intl.dart';
import 'package:tangent/core/utils/clock.dart';

abstract final class Formatters {
  static String inr(num amount) => NumberFormat.currency(
    locale: 'en_IN',
    symbol: '₹',
    decimalDigits: 0,
  ).format(amount);

  static String dayMonth(DateTime date) => DateFormat('d MMM').format(date);

  static String fullDate(DateTime date) => DateFormat('d MMM yyyy').format(date);

  static String weekday(DateTime date) => DateFormat('EEE').format(date);

  static String timeOf(DateTime date) => DateFormat('h:mm a').format(date);

  static String greetingKey(DateTime now) {
    final hour = now.hour;
    if (hour < 12) return 'home.greeting_morning';
    if (hour < 17) return 'home.greeting_afternoon';
    return 'home.greeting_evening';
  }

  static String countdown(DateTime due) {
    final now = Clock.now();
    final today = DateTime(now.year, now.month, now.day);
    final target = DateTime(due.year, due.month, due.day);
    final days = target.difference(today).inDays;
    if (days < 0) return 'time.overdue';
    if (days == 0) return 'time.due_today';
    if (days == 1) return 'time.due_tomorrow';
    return 'time.due_in_days';
  }

  static int daysUntil(DateTime date) {
    final now = Clock.now();
    final today = DateTime(now.year, now.month, now.day);
    final target = DateTime(date.year, date.month, date.day);
    return target.difference(today).inDays;
  }

  static String initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty);
    final letters = parts.take(2).map((p) => p[0].toUpperCase()).join();
    return letters.isEmpty ? '?' : letters;
  }
}
