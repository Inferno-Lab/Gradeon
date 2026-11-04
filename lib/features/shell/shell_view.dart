import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/utils/extensions.dart';
import 'package:gradeon/core/widgets/dock.dart';
import 'package:gradeon/core/widgets/lazy_stack.dart';
import 'package:gradeon/features/auth/views/welcome_overlay.dart';
import 'package:gradeon/features/chat/controllers/chat_controller.dart';
import 'package:gradeon/features/chat/views/chat_list_view.dart';
import 'package:gradeon/features/dashboard/views/academics_view.dart';
import 'package:gradeon/features/dashboard/views/dashboard_view.dart';
import 'package:gradeon/features/fees/views/fees_view.dart';
import 'package:gradeon/features/notices/views/notices_view.dart';
import 'package:gradeon/features/profile/views/profile_view.dart';
import 'package:gradeon/features/shell/shell_controller.dart';
import 'package:gradeon/features/teacher_tools/views/teacher_home_view.dart';
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
      final teacher = controller.isTeacher;
      final unread = chat.unread.value;
      final items = [
        for (final item in teacher ? _teacherNav : _familyNav)
          item.label == 'nav.chat'
              ? DockItem(icon: item.icon, activeIcon: item.activeIcon, label: item.label, badge: unread)
              : item,
      ];
      final pages = teacher ? _teacherPages : _familyPages;
      final index = controller.index.value;
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

const _familyNav = [
  DockItem(icon: PhosphorIconsRegular.house, activeIcon: PhosphorIconsBold.house, label: 'nav.home'),
  DockItem(icon: PhosphorIconsRegular.bookOpen, activeIcon: PhosphorIconsBold.bookOpen, label: 'nav.academics'),
  DockItem(icon: PhosphorIconsRegular.wallet, activeIcon: PhosphorIconsBold.wallet, label: 'nav.fees'),
  DockItem(icon: PhosphorIconsRegular.chatCircle, activeIcon: PhosphorIconsBold.chatCircle, label: 'nav.chat'),
  DockItem(icon: PhosphorIconsRegular.user, activeIcon: PhosphorIconsBold.user, label: 'nav.profile'),
];

const _teacherNav = [
  DockItem(icon: PhosphorIconsRegular.house, activeIcon: PhosphorIconsBold.house, label: 'nav.home'),
  DockItem(
    icon: PhosphorIconsRegular.chalkboardTeacher,
    activeIcon: PhosphorIconsBold.chalkboardTeacher,
    label: 'nav.classes',
  ),
  DockItem(icon: PhosphorIconsRegular.megaphone, activeIcon: PhosphorIconsBold.megaphone, label: 'nav.notices'),
  DockItem(icon: PhosphorIconsRegular.chatCircle, activeIcon: PhosphorIconsBold.chatCircle, label: 'nav.chat'),
  DockItem(icon: PhosphorIconsRegular.user, activeIcon: PhosphorIconsBold.user, label: 'nav.profile'),
];

const _familyPages = [DashboardView(), AcademicsView(), FeesView(), ChatListView(), ProfileView()];

const _teacherPages = [TeacherHomeView(), TeacherClassesView(), NoticesView(), ChatListView(), ProfileView()];
