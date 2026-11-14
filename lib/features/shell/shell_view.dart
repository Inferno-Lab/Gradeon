import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:tangent/core/services/school_config.dart';
import 'package:tangent/core/utils/extensions.dart';
import 'package:tangent/core/widgets/dock.dart';
import 'package:tangent/core/widgets/lazy_stack.dart';
import 'package:tangent/features/auth/views/welcome_overlay.dart';
import 'package:tangent/features/chat/controllers/chat_controller.dart';
import 'package:tangent/features/chat/views/chat_list_view.dart';
import 'package:tangent/features/dashboard/views/academics_view.dart';
import 'package:tangent/features/dashboard/views/dashboard_view.dart';
import 'package:tangent/features/driver/views/driver_view.dart';
import 'package:tangent/features/events/views/events_view.dart';
import 'package:tangent/features/fees/views/fees_view.dart';
import 'package:tangent/features/gallery/views/gallery_view.dart';
import 'package:tangent/features/homework/views/homework_view.dart';
import 'package:tangent/features/library/views/library_view.dart';
import 'package:tangent/features/notices/views/notices_view.dart';
import 'package:tangent/features/profile/views/profile_view.dart';
import 'package:tangent/features/shell/shell_controller.dart';
import 'package:tangent/features/teacher_tools/views/teacher_home_view.dart';
import 'package:tangent/features/timetable/views/timetable_view.dart';
import 'package:tangent/features/transport/views/transport_view.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

class ShellView extends StatefulWidget {
  const ShellView({super.key});

  @override
  State<ShellView> createState() => _ShellViewState();
}

class _ShellViewState extends State<ShellView> {
  late var _welcome = welcomePending();

  @override
  Widget build(BuildContext context) {
    final controller = Get.find<ShellController>();
    final chat = Get.find<ChatListController>();
    return Obx(() {
      final unread = chat.unread.value;
      final tabs = _tabsFor(controller.isTeacher, driver: controller.isDriver);
      // Each role gets the tabs Tangent set for it at this school (console → The app → What each role sees), Profile always last.
      final keys = [...SchoolConfig.dock.where((k) => k != 'profile' && tabs.containsKey(k)), 'profile'];
      controller.tabs = keys;
      final items = [
        for (final k in keys)
          if (k == 'chat')
            DockItem(icon: tabs[k]!.$1.icon, activeIcon: tabs[k]!.$1.activeIcon, label: tabs[k]!.$1.label, badge: unread)
          else
            tabs[k]!.$1,
      ];
      final pages = [for (final k in keys) tabs[k]!.$2];
      final index = controller.index.value.clamp(0, pages.length - 1);
      final wide = context.isWide;
      return PopScope(
        canPop: false,
        onPopInvokedWithResult: (didPop, _) {
          if (!didPop) unawaited(controller.onBack());
        },
        child: Scaffold(
          backgroundColor: context.app.chalk,
          body: Stack(
            children: [
              Positioned.fill(
                child: LazyIndexedStack(index: index, children: pages),
              ),
              if (!_welcome) ...[
                if (wide)
                  Positioned(
                    left: 20,
                    top: 0,
                    bottom: 0,
                    child: Center(
                      child: GlassRail(items: items, index: index, onChanged: controller.go),
                    ),
                  )
                else
                  Positioned(
                    left: 16,
                    right: 16,
                    bottom: 20 + MediaQuery.paddingOf(context).bottom,
                    child: Center(
                      child: ConstrainedBox(
                        constraints: const BoxConstraints(maxWidth: 460),
                        child: GlassDock(items: items, index: index, onChanged: controller.go),
                      ),
                    ),
                  ),
              ],
              if (_welcome)
                Positioned.fill(
                  child: WelcomeOverlay(
                    onFinished: () {
                      if (mounted) setState(() => _welcome = false);
                    },
                  ),
                ),
            ],
          ),
        ),
      );
    });
  }
}

/// Every tab the console can put in a role's dock (config-engine APP_CATALOG.dock), keyed as there; Profile is always last.
Map<String, (DockItem, Widget)> _tabsFor(bool teacher, {bool driver = false}) => {
  'home': (
    const DockItem(icon: PhosphorIconsRegular.house, activeIcon: PhosphorIconsBold.house, label: 'nav.home'),
    driver ? const DriverView() : teacher ? const TeacherHomeView() : const DashboardView(),
  ),
  'trips': (const DockItem(icon: PhosphorIconsRegular.steeringWheel, activeIcon: PhosphorIconsBold.steeringWheel, label: 'nav.trips'), const DriverView()),
  'academics': (
    const DockItem(icon: PhosphorIconsRegular.bookOpen, activeIcon: PhosphorIconsBold.bookOpen, label: 'nav.academics'),
    const AcademicsView(),
  ),
  'classes': (
    const DockItem(icon: PhosphorIconsRegular.chalkboardTeacher, activeIcon: PhosphorIconsBold.chalkboardTeacher, label: 'nav.classes'),
    const TeacherClassesView(),
  ),
  'homework': (const DockItem(icon: PhosphorIconsRegular.notebook, activeIcon: PhosphorIconsBold.notebook, label: 'nav.homework'), const HomeworkView()),
  'timetable': (const DockItem(icon: PhosphorIconsRegular.clock, activeIcon: PhosphorIconsBold.clock, label: 'nav.timetable'), const TimetableView()),
  'fees': (const DockItem(icon: PhosphorIconsRegular.wallet, activeIcon: PhosphorIconsBold.wallet, label: 'nav.fees'), const FeesView()),
  'notices': (const DockItem(icon: PhosphorIconsRegular.megaphone, activeIcon: PhosphorIconsBold.megaphone, label: 'nav.notices'), const NoticesView()),
  'chat': (const DockItem(icon: PhosphorIconsRegular.chatCircle, activeIcon: PhosphorIconsBold.chatCircle, label: 'nav.chat'), const ChatListView()),
  'events': (const DockItem(icon: PhosphorIconsRegular.calendarBlank, activeIcon: PhosphorIconsBold.calendarBlank, label: 'nav.events'), const EventsView()),
  'transport': (const DockItem(icon: PhosphorIconsRegular.bus, activeIcon: PhosphorIconsBold.bus, label: 'nav.transport'), const TransportView()),
  'library': (const DockItem(icon: PhosphorIconsRegular.books, activeIcon: PhosphorIconsBold.books, label: 'nav.library'), const LibraryView()),
  'gallery': (const DockItem(icon: PhosphorIconsRegular.images, activeIcon: PhosphorIconsBold.images, label: 'nav.gallery'), const GalleryView()),
  'profile': (const DockItem(icon: PhosphorIconsRegular.user, activeIcon: PhosphorIconsBold.user, label: 'nav.profile'), const ProfileView()),
};
