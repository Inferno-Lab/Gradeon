import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/services/school_config.dart';

void main() {
  setUp(() => Get.testMode = true);
  tearDown(() {
    SchoolConfig.modules.clear();
    SchoolConfig.features.clear();
  });

  test('a school shows only what its config gives it', () {
    SchoolConfig.modules.assignAll(['people', 'fees']);
    SchoolConfig.features.assignAll(['fees.onlinePayment']);
    expect(SchoolConfig.has('fees'), isTrue);
    expect(SchoolConfig.hasFeature('fees.onlinePayment'), isTrue);
  });

  test('a module or feature the school does not have is refused', () {
    SchoolConfig.modules.assignAll(['people', 'fees']);
    SchoolConfig.features.assignAll(['fees.reminders']);
    expect(SchoolConfig.has('chat'), isFalse);
    expect(SchoolConfig.hasFeature('fees.reminders'), isTrue);
    expect(SchoolConfig.allows('fees.onlinePayment'), isFalse);
  });
}
