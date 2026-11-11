import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/routes/app_routes.dart';
import 'package:gradeon/core/routes/middlewares.dart';
import 'package:gradeon/core/theme/tokens.dart';
import 'package:gradeon/data/models/user.dart';
import 'package:gradeon/features/attendance/controllers/attendance_controller.dart';
import 'package:gradeon/features/attendance/views/attendance_view.dart';
import 'package:gradeon/features/auth/controllers/login_controller.dart';
import 'package:gradeon/features/auth/controllers/splash_controller.dart';
import 'package:gradeon/features/auth/views/login_view.dart';
import 'package:gradeon/features/auth/views/onboarding_view.dart';
import 'package:gradeon/features/auth/views/splash_view.dart';
import 'package:gradeon/features/chat/controllers/chat_controller.dart';
import 'package:gradeon/features/chat/views/chat_list_view.dart';
import 'package:gradeon/features/dashboard/controllers/academics_controller.dart';
import 'package:gradeon/features/dashboard/controllers/dashboard_controller.dart';
import 'package:gradeon/features/events/controllers/events_controller.dart';
import 'package:gradeon/features/events/views/events_view.dart';
import 'package:gradeon/features/exams_results/controllers/results_controller.dart';
import 'package:gradeon/features/exams_results/views/results_view.dart';
import 'package:gradeon/features/fees/controllers/fees_controller.dart';
import 'package:gradeon/features/fees/views/fees_view.dart';
import 'package:gradeon/features/gallery/controllers/gallery_controller.dart';
import 'package:gradeon/features/gallery/views/gallery_view.dart';
import 'package:gradeon/features/homework/controllers/homework_controller.dart';
import 'package:gradeon/features/homework/views/homework_scan_view.dart';
import 'package:gradeon/features/homework/views/homework_view.dart';
import 'package:gradeon/features/leave/controllers/leave_controller.dart';
import 'package:gradeon/features/leave/views/leave_view.dart';
import 'package:gradeon/features/library/controllers/library_controller.dart';
import 'package:gradeon/features/library/views/library_view.dart';
import 'package:gradeon/features/notices/controllers/notices_controller.dart';
import 'package:gradeon/features/notices/views/notices_view.dart';
import 'package:gradeon/features/notifications/controllers/notifications_controller.dart';
import 'package:gradeon/features/notifications/views/notifications_view.dart';
import 'package:gradeon/features/profile/controllers/profile_controller.dart';
import 'package:gradeon/features/search/search_view.dart';
import 'package:gradeon/features/settings/views/design_system_view.dart';
import 'package:gradeon/features/settings/views/settings_view.dart';
import 'package:gradeon/features/shell/shell_controller.dart';
import 'package:gradeon/features/shell/shell_view.dart';
import 'package:gradeon/features/teacher_tools/controllers/teacher_controller.dart';
import 'package:gradeon/features/teacher_tools/views/teacher_tools_view.dart';
import 'package:gradeon/features/timetable/controllers/timetable_controller.dart';
import 'package:gradeon/features/timetable/views/timetable_view.dart';
import 'package:gradeon/features/transport/controllers/transport_controller.dart';
import 'package:gradeon/features/transport/views/transport_view.dart';

class ShellBinding extends Bindings {
  @override
  void dependencies() {
    // Every screen the school may put in a role's tabs (console: The app → what each role sees); lazy, so only opened ones are made.
    Get
      ..lazyPut(ShellController.new, fenix: true)
      ..lazyPut(ChatListController.new, fenix: true)
      ..lazyPut(ProfileController.new, fenix: true)
      ..lazyPut(NoticesController.new, fenix: true)
      ..lazyPut(TeacherHomeController.new, fenix: true)
      ..lazyPut(DashboardController.new, fenix: true)
      ..lazyPut(AcademicsController.new, fenix: true)
      ..lazyPut(FeesController.new, fenix: true)
      ..lazyPut(HomeworkController.new, fenix: true)
      ..lazyPut(TimetableController.new, fenix: true)
      ..lazyPut(EventsController.new, fenix: true)
      ..lazyPut(LibraryController.new, fenix: true)
      ..lazyPut(TransportController.new, fenix: true)
      ..lazyPut(GalleryController.new, fenix: true);
  }
}

class AppPages {
  const AppPages._();

  static final pages = <GetPage<dynamic>>[
    GetPage(
      name: AppRoutes.splash,
      page: () => const SplashView(),
      binding: BindingsBuilder<void>(() {
        Get.put<SplashController>(SplashController());
      }),
      transition: Transition.fadeIn,
    ),
    GetPage(name: AppRoutes.onboarding, page: () => const OnboardingView(), binding: BindingsBuilder<void>(() => Get.lazyPut(OnboardingController.new, fenix: true)), transition: Transition.fadeIn),
    GetPage(name: AppRoutes.login, page: () => const LoginView(), binding: BindingsBuilder<void>(() => Get.lazyPut(LoginController.new, fenix: true)), transition: Transition.fadeIn),
    GetPage(name: AppRoutes.shell, page: () => const ShellView(), binding: ShellBinding(), middlewares: [AuthMiddleware()], transition: Transition.fadeIn, transitionDuration: AppMotion.t3),
    _page(AppRoutes.attendance, const AttendanceView(), AttendanceController.new),
    _page(AppRoutes.homework, const HomeworkView(), HomeworkController.new),
    GetPage(
      name: AppRoutes.homeworkDetail,
      page: () => const HomeworkDetailView(),
      binding: BindingsBuilder<void>(() {
        Get
          ..lazyPut(HomeworkDetailController.new, fenix: true)
          ..lazyPut(HomeworkController.new, fenix: true);
      }),
      middlewares: [AuthMiddleware()],
      transition: Transition.fadeIn,
      transitionDuration: AppMotion.t3,
    ),
    GetPage(name: AppRoutes.homeworkScan, page: () => const HomeworkScanView(), middlewares: [AuthMiddleware()], transition: Transition.downToUp),
    _page(AppRoutes.timetable, const TimetableView(), TimetableController.new),
    _page(AppRoutes.results, const ResultsView(), ResultsController.new),
    _page(AppRoutes.fees, const FeesView(), FeesController.new),
    GetPage(name: AppRoutes.receipt, page: () => const ReceiptView(), middlewares: [AuthMiddleware()], transition: Transition.fadeIn),
    _page(AppRoutes.notices, const NoticesView(), NoticesController.new),
    _page(AppRoutes.noticeDetail, const NoticeDetailView(), NoticeDetailController.new),
    _page(AppRoutes.events, const EventsView(), EventsController.new),
    GetPage(name: AppRoutes.eventDetail, page: () => const EventDetailView(), binding: BindingsBuilder<void>(() => Get.lazyPut(EventsController.new, fenix: true)), middlewares: [AuthMiddleware()], transition: Transition.fadeIn),
    _page(AppRoutes.chatThread, const ChatThreadView(), ChatThreadController.new),
    _page(AppRoutes.library, const LibraryView(), LibraryController.new),
    _page(AppRoutes.transport, const TransportView(), TransportController.new),
    _page(AppRoutes.gallery, const GalleryView(), GalleryController.new),
    _page(AppRoutes.leave, const LeaveView(), LeaveController.new),
    _page(AppRoutes.leaveApply, const LeaveApplyView(), LeaveApplyController.new),
    GetPage(
      name: AppRoutes.search,
      page: () => const SearchView(),
      binding: BindingsBuilder<void>(() => Get.lazyPut(AppSearchController.new, fenix: true)),
      middlewares: [AuthMiddleware()],
      transition: Transition.fadeIn,
      transitionDuration: AppMotion.t2,
    ),
    _page(AppRoutes.notifications, const NotificationsView(), NotificationsController.new),
    GetPage(name: AppRoutes.settings, page: () => const SettingsView(), middlewares: [AuthMiddleware()], transition: Transition.cupertino, transitionDuration: AppMotion.t3),
    GetPage(name: AppRoutes.about, page: () => const AboutView(), middlewares: [AuthMiddleware()], transition: Transition.cupertino),
    GetPage(name: AppRoutes.help, page: () => const HelpView(), middlewares: [AuthMiddleware()], transition: Transition.cupertino),
    GetPage(name: AppRoutes.designSystem, page: () => const DesignSystemView(), middlewares: [AuthMiddleware()], transition: Transition.fadeIn),
    _teacher(AppRoutes.teacherAttendance, const MarkAttendanceView(), MarkAttendanceController.new),
    _teacher(AppRoutes.teacherAssign, const AssignHomeworkView(), AssignHomeworkController.new),
    _teacher(AppRoutes.teacherGrade, const GradingView(), GradingController.new),
    _teacher(AppRoutes.teacherMarks, const MarksEntryView(), MarksEntryController.new),
    _teacher(AppRoutes.teacherNotice, const PostNoticeView(), PostNoticeController.new),
  ];

  static GetPage<dynamic> _page<T extends GetxController>(
    String name,
    Widget page,
    InstanceBuilderCallback<T> controller,
  ) {
    return GetPage(
      name: name,
      page: () => page,
      binding: BindingsBuilder<void>(() => Get.lazyPut<T>(controller, fenix: true)),
      middlewares: [AuthMiddleware()],
      transition: Transition.fadeIn,
      transitionDuration: AppMotion.t3,
    );
  }

  static GetPage<dynamic> _teacher<T extends GetxController>(
    String name,
    Widget page,
    InstanceBuilderCallback<T> controller,
  ) {
    return GetPage(
      name: name,
      page: () => page,
      binding: BindingsBuilder<void>(() => Get.lazyPut<T>(controller, fenix: true)),
      middlewares: [
        AuthMiddleware(),
        RoleMiddleware([UserRole.teacher]),
      ],
      transition: Transition.fadeIn,
      transitionDuration: AppMotion.t3,
    );
  }
}
