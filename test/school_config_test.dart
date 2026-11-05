import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/services/school_config.dart';

void main() {
  setUp(() => Get.testMode = true);
  tearDown(() {
    SchoolConfig.modules.clear();
    SchoolConfig.features.value = null;
  });

  test('before the school config arrives, everything shows', () {
    expect(SchoolConfig.has('fees'), isTrue);
    expect(SchoolConfig.hasFeature('fees.onlinePayment'), isTrue);
    expect(SchoolConfig.allows('chat.familyChat'), isTrue);
  });

  test('a module or feature the school does not have is refused', () {
    SchoolConfig.modules.assignAll(['people', 'fees']);
    SchoolConfig.features.value = ['fees.reminders'];
    expect(SchoolConfig.has('chat'), isFalse);
    expect(SchoolConfig.hasFeature('fees.reminders'), isTrue);
    expect(SchoolConfig.allows('fees.onlinePayment'), isFalse);
  });
}
