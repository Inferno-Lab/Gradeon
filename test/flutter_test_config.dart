import 'dart:async';

import 'package:gradeon/core/utils/clock.dart';

/// Every test runs at the same moment of the school week (Wednesday mid-morning, time still ticking), so a run does not
/// pass at 11:00 and fail at 13:30. `--dart-define=TEST_NOW=2026-11-14T13:33` replays another moment.
Future<void> testExecutable(FutureOr<void> Function() testMain) async {
  const at = String.fromEnvironment('TEST_NOW');
  final offset = (at.isEmpty ? DateTime(2026, 11, 11, 10, 30) : DateTime.parse(at)).difference(DateTime.now());
  Clock.source = () => DateTime.now().add(offset);
  await testMain();
}
