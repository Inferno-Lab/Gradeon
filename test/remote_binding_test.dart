import 'package:flutter_test/flutter_test.dart';
import 'package:get/get.dart';
import 'package:tangent/core/bindings/initial_binding.dart';
import 'package:tangent/core/config/app_config.dart';
import 'package:tangent/core/services/storage_service.dart';
import 'package:tangent/data/repositories/academic_repository.dart';
import 'package:tangent/data/repositories/auth_repository.dart';
import 'package:tangent/data/repositories/campus_repository.dart';
import 'package:tangent/data/repositories/directory_repository.dart';

void main() {
  tearDown(() {
    AppConfig.useMockData = true;
    Get.reset();
  });

  test('useMockData false resolves every remote repository', () {
    Get.testMode = true;
    Get.put(StorageService(memory: <String, dynamic>{}));
    AppConfig.useMockData = false;
    InitialBinding().dependencies();

    expect(Get.find<AuthRepository>(), isA<RemoteAuthRepository>());
    expect(Get.find<DirectoryRepository>(), isA<RemoteDirectoryRepository>());
    expect(Get.find<AttendanceRepository>(), isA<RemoteAttendanceRepository>());
    expect(Get.find<TimetableRepository>(), isA<RemoteTimetableRepository>());
    expect(Get.find<HomeworkRepository>(), isA<RemoteHomeworkRepository>());
    expect(Get.find<ExamRepository>(), isA<RemoteExamRepository>());
    expect(Get.find<FeeRepository>(), isA<RemoteFeeRepository>());
    expect(Get.find<NoticeRepository>(), isA<RemoteNoticeRepository>());
    expect(Get.find<EventRepository>(), isA<RemoteEventRepository>());
    expect(Get.find<ChatRepository>(), isA<RemoteChatRepository>());
    expect(Get.find<LibraryRepository>(), isA<RemoteLibraryRepository>());
    expect(Get.find<TransportRepository>(), isA<RemoteTransportRepository>());
    expect(Get.find<LeaveRepository>(), isA<RemoteLeaveRepository>());
    expect(Get.find<GalleryRepository>(), isA<RemoteGalleryRepository>());
    expect(Get.find<NotificationRepository>(), isA<RemoteNotificationRepository>());
  });
}
