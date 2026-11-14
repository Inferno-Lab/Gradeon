/// The time the app thinks it is. Everything asks `Clock.now()` instead of `DateTime.now()`, so a test can fix the hour
/// (screens change with the school day: the period on now, the end of the day, a weekend) and CI does not depend on when
/// it runs.
abstract final class Clock {
  static DateTime Function() source = DateTime.now;

  static DateTime now() => source();
}
