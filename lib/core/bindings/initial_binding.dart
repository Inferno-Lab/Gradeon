import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/config/app_config.dart';
import 'package:gradeon/core/network/api_client.dart';
import 'package:gradeon/core/services/auth_service.dart';
import 'package:gradeon/core/services/connectivity_service.dart';
import 'package:gradeon/core/services/school_config.dart';
import 'package:gradeon/data/datasources/mock_json_datasource.dart';
import 'package:gradeon/data/datasources/remote_datasource.dart';
import 'package:gradeon/data/repositories/academic_repository.dart';
import 'package:gradeon/data/repositories/assistant_repository.dart';
import 'package:gradeon/data/repositories/auth_repository.dart';
import 'package:gradeon/data/repositories/campus_repository.dart';
import 'package:gradeon/data/repositories/directory_repository.dart';

class InitialBinding extends Bindings {
  @override
  void dependencies() {
    // Release builds only ever talk to a school (AppConfig.assertReleaseUrl), so the sample content's code is compiled out.
    if (AppConfig.useMockData && !kReleaseMode) {
      final source = Get.put(MockJsonDataSource(), permanent: true);
      Get
        ..lazyPut<AuthRepository>(() => MockAuthRepository(source), fenix: true)
        ..lazyPut<DirectoryRepository>(
          () => MockDirectoryRepository(source),
          fenix: true,
        )
        ..lazyPut<AttendanceRepository>(
          () => MockAttendanceRepository(source),
          fenix: true,
        )
        ..lazyPut<TimetableRepository>(
          () => MockTimetableRepository(source),
          fenix: true,
        )
        ..lazyPut<HomeworkRepository>(
          () => MockHomeworkRepository(source),
          fenix: true,
        )
        ..lazyPut<ExamRepository>(() => MockExamRepository(source), fenix: true)
        ..lazyPut<FeeRepository>(() => MockFeeRepository(source), fenix: true)
        ..lazyPut<NoticeRepository>(() => MockNoticeRepository(source), fenix: true)
        ..lazyPut<EventRepository>(() => MockEventRepository(source), fenix: true)
        ..lazyPut<ChatRepository>(() => MockChatRepository(source), fenix: true)
        ..lazyPut<LibraryRepository>(
          () => MockLibraryRepository(source),
          fenix: true,
        )
        ..lazyPut<TransportRepository>(
          () => MockTransportRepository(source),
          fenix: true,
        )
        ..lazyPut<LeaveRepository>(() => MockLeaveRepository(source), fenix: true)
        ..lazyPut<GalleryRepository>(
          () => MockGalleryRepository(source),
          fenix: true,
        )
        ..lazyPut<NotificationRepository>(
          () => MockNotificationRepository(source),
          fenix: true,
        )
        ..lazyPut<AssistantRepository>(MockAssistantRepository.new, fenix: true);
      return;
    }

    final remote = Get.put(
      RemoteDataSource(ApiClient(onSignedOut: () => unawaited(Get.find<AuthService>().signOut()), onLocked: () => unawaited(SchoolConfig.load()))),
      permanent: true,
    );
    // Attendance marked without a signal is sent as soon as the phone is back online.
    if (Get.isRegistered<ConnectivityService>()) {
      Get.find<ConnectivityService>().onBackOnline.add(() async { await remote.client.flushOutbox(); });
    }
    Get
      ..lazyPut<AuthRepository>(() => RemoteAuthRepository(remote), fenix: true)
      ..lazyPut<DirectoryRepository>(
        () => RemoteDirectoryRepository(remote),
        fenix: true,
      )
      ..lazyPut<AttendanceRepository>(
        () => RemoteAttendanceRepository(remote),
        fenix: true,
      )
      ..lazyPut<TimetableRepository>(
        () => RemoteTimetableRepository(remote),
        fenix: true,
      )
      ..lazyPut<HomeworkRepository>(
        () => RemoteHomeworkRepository(remote),
        fenix: true,
      )
      ..lazyPut<ExamRepository>(() => RemoteExamRepository(remote), fenix: true)
      ..lazyPut<FeeRepository>(() => RemoteFeeRepository(remote), fenix: true)
      ..lazyPut<NoticeRepository>(() => RemoteNoticeRepository(remote), fenix: true)
      ..lazyPut<EventRepository>(() => RemoteEventRepository(remote), fenix: true)
      ..lazyPut<ChatRepository>(() => RemoteChatRepository(remote), fenix: true)
      ..lazyPut<LibraryRepository>(
        () => RemoteLibraryRepository(remote),
        fenix: true,
      )
      ..lazyPut<TransportRepository>(
        () => RemoteTransportRepository(remote),
        fenix: true,
      )
      ..lazyPut<LeaveRepository>(() => RemoteLeaveRepository(remote), fenix: true)
      ..lazyPut<GalleryRepository>(
        () => RemoteGalleryRepository(remote),
        fenix: true,
      )
      ..lazyPut<NotificationRepository>(
        () => RemoteNotificationRepository(remote),
        fenix: true,
      )
      ..lazyPut<AssistantRepository>(() => RemoteAssistantRepository(remote), fenix: true);
  }
}
