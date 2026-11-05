import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/routes/app_routes.dart';
import 'package:gradeon/core/services/auth_service.dart';
import 'package:gradeon/core/theme/app_colors.dart';
import 'package:gradeon/core/theme/app_typography.dart';
import 'package:gradeon/core/utils/calendar.dart';
import 'package:gradeon/core/utils/extensions.dart';
import 'package:gradeon/core/widgets/empty_art.dart';
import 'package:gradeon/core/widgets/glass.dart';
import 'package:gradeon/core/widgets/page.dart';
import 'package:gradeon/core/widgets/states.dart';
import 'package:gradeon/core/widgets/toast.dart';
import 'package:gradeon/core/widgets/ui.dart';
import 'package:gradeon/data/models/campus.dart';
import 'package:gradeon/data/models/user.dart';
import 'package:gradeon/features/notices/controllers/notices_controller.dart';
import 'package:intl/intl.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

/// Category badge text and colours.
({String abbr, Color fill, Color on}) _category(BuildContext context, String category) {
  final c = context.app;
  return switch (category) {
    'sports' => (abbr: 'SPORT', fill: AppColors.subject('pe').fill, on: AppColors.subject('pe').on),
    'fees' => (abbr: 'FEES', fill: c.lateSoft, on: c.lateText),
    'holiday' => (abbr: 'HOL', fill: AppColors.subject('art').fill, on: AppColors.subject('art').on),
    'exams' => (abbr: 'EXAM', fill: c.badSoft, on: c.badText),
    'academic' => (abbr: 'ACAD', fill: c.mariSoft, on: c.mariText),
    'events' => (abbr: 'EVENT', fill: AppColors.subject('social').fill, on: AppColors.subject('social').on),
    _ => (abbr: 'NEWS', fill: c.paper2, on: c.ink2),
  };
}

Color _stampTone(BuildContext context, String category) => switch (category) {
  'exams' => context.app.badText,
  'fees' => context.app.dark ? const Color(0xFFF6BA45) : AppColors.late,
  'holiday' || 'sports' || 'events' => AppColors.ok,
  _ => context.app.mariText,
};

String _when(DateTime d) {
  final today = DateUtils.dateOnly(DateTime.now());
  final day = DateUtils.dateOnly(d);
  if (day == today) return 'common.today'.tr;
  if (day == today.subtract(const Duration(days: 1))) return 'common.yesterday'.tr;
  return DateFormat('EEE d MMM').format(d);
}

/// Same as [_when] but reads inside a sentence: "today", "yesterday".
String _whenInline(DateTime d) {
  final w = _when(d);
  final ago = DateUtils.dateOnly(DateTime.now()).difference(DateUtils.dateOnly(d)).inDays;
  return ago == 0 || ago == 1 ? w.toLowerCase() : w;
}

void _openNotice(Notice n) => unawaited(Get.toNamed<void>('/notices/${n.id}'));

class NoticesView extends GetView<NoticesController> {
  const NoticesView({super.key});

  @override
  Widget build(BuildContext context) {
    final tab = ModalRoute.of(context)?.settings.name != AppRoutes.notices;
    final teacher = Get.find<AuthService>().user.value?.role == UserRole.teacher;
    return Obx(() {
      controller.filter.value;
      controller.read.length;
      final pinned = controller.pinned;
      final week = controller.thisWeek;
      final earlier = controller.earlier;
      return PageFrame(
        dockPage: tab,
        leading: tab ? null : const BackGlass(),
        actions: [
          GlassIconButton(
            icon: PhosphorIconsRegular.magnifyingGlass,
            label: 'notices.search'.tr,
            onTap: () => Get.toNamed<void>(AppRoutes.search, arguments: {'scope': 'notices'}),
          ),
          if (teacher)
            GlassIconButton(
              icon: PhosphorIconsRegular.plus,
              label: 'notices.post'.tr,
              onTap: () => Get.toNamed<void>(AppRoutes.teacherNotice),
            ),
        ],
        onRefresh: controller.load,
        children: [
          const Rise(child: PageTitle('notices.title')),
          ViewStateView(
            state: controller.state.value,
            onRetry: controller.load,
            errorKey: controller.errorMessage.value,
            emptyTitle: 'notices.empty',
            emptyBody: 'notices.empty_body',
            emptyArt: EmptyArt.notice,
            emptyHint: 'notices.empty_hint',
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const SizedBox(height: 14),
                Rise(index: 1, child: _Filters(controller: controller)),
                if (pinned.isNotEmpty) ...[
                  const SizedBox(height: 22),
                  Rise(
                    index: 1,
                    child: IntrinsicHeight(
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          for (var i = 0; i < pinned.length; i++) ...[
                            if (i > 0) const SizedBox(width: 12),
                            Expanded(
                              child: _Slip(
                                notice: pinned[i],
                                tilt: i.isEven ? -1.5 : 1.2,
                                pin: i.isEven ? AppColors.bad : AppColors.subject('maths').fill,
                              ),
                            ),
                          ],
                          if (pinned.length == 1) const Expanded(child: SizedBox()),
                        ],
                      ),
                    ),
                  ),
                ],
                if (week.isNotEmpty) ...[
                  Rise(index: 2, child: SectionLabel('notices.this_week'.tr, top: 24)),
                  Rise(
                    index: 3,
                    child: _NoticeList(items: week, controller: controller),
                  ),
                ],
                if (earlier.isNotEmpty) ...[
                  Rise(index: 3, child: SectionLabel('notices.earlier'.tr, top: 24)),
                  Rise(
                    index: 4,
                    child: _NoticeList(items: earlier, controller: controller),
                  ),
                ],
                if (pinned.isEmpty && week.isEmpty && earlier.isEmpty)
                  const EmptyState(art: EmptyArt.notice, title: 'notices.none_here', body: 'notices.none_here_body'),
              ],
            ),
          ),
        ],
      );
    });
  }
}

class _Slip extends StatelessWidget {
  const _Slip({required this.notice, required this.tilt, required this.pin});

  final Notice notice;
  final double tilt;
  final Color pin;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final tilted = context.reduceMotion ? 0.0 : tilt;
    return Semantics(
      button: true,
      label: '${'notices.pinned'.tr}, ${notice.title}',
      child: Pressable(
        onTap: () => _openNotice(notice),
        child: Transform.rotate(
          angle: tilted * 3.14159 / 180,
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              Container(
                width: double.infinity,
                padding: const EdgeInsets.fromLTRB(14, 16, 14, 14),
                decoration: BoxDecoration(
                  color: c.paper,
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(color: c.line),
                  boxShadow: const [
                    BoxShadow(color: Color(0x7310201B), blurRadius: 24, spreadRadius: -14, offset: Offset(0, 10)),
                  ],
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Stamp('notices.cat_${notice.category}'.tr, color: _stampTone(context, notice.category), size: 10),
                    const SizedBox(height: 10),
                    Text(notice.title, style: context.type.t),
                    const SizedBox(height: 6),
                    Text('${_when(notice.date)} · ${notice.author}', style: context.type.cap),
                  ],
                ),
              ),
              Positioned(
                top: -7,
                left: 0,
                right: 0,
                child: Center(
                  child: Container(
                    width: 16,
                    height: 16,
                    decoration: BoxDecoration(
                      color: pin,
                      shape: BoxShape.circle,
                      boxShadow: const [BoxShadow(color: Color(0x40000000), blurRadius: 6, offset: Offset(0, 3))],
                    ),
                    foregroundDecoration: const BoxDecoration(
                      shape: BoxShape.circle,
                      gradient: RadialGradient(
                        center: Alignment(-.35, -.35),
                        radius: .9,
                        colors: [Color(0x00000000), Color(0x00000000), Color(0x33000000)],
                        stops: [0, .6, 1],
                      ),
                    ),
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _NoticeList extends StatelessWidget {
  const _NoticeList({required this.items, required this.controller});

  final List<Notice> items;
  final NoticesController controller;

  @override
  Widget build(BuildContext context) => EduCard(
    child: Column(
      children: [
        for (var i = 0; i < items.length; i++) ...[
          if (i > 0) const Hr(indent: 66),
          _Row(notice: items[i], unread: controller.unread(items[i])),
        ],
      ],
    ),
  );
}

class _Row extends StatelessWidget {
  const _Row({required this.notice, required this.unread});

  final Notice notice;
  final bool unread;

  @override
  Widget build(BuildContext context) {
    final cat = _category(context, notice.category);
    final holiday = notice.category == 'holiday';
    return Semantics(
      button: true,
      label: '${unread ? '${'notices.unread'.tr}, ' : ''}${notice.title}, ${_when(notice.date)}, ${notice.author}',
      excludeSemantics: true,
      child: Pressable(
        onTap: () => _openNotice(notice),
        scale: .985,
        child: Stack(
          children: [
            if (unread) const Positioned(left: 5, top: 22, child: Dot(AppColors.mari, size: 7)),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 13),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Container(
                    width: 40,
                    height: 40,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(color: cat.fill, borderRadius: BorderRadius.circular(12)),
                    child: Text(cat.abbr, style: anek(10, 780, height: 1, em: .06, color: cat.on)),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(notice.title, style: context.type.t),
                        Text('${_when(notice.date)} · ${notice.author}', style: context.type.cap),
                      ],
                    ),
                  ),
                  if (holiday) ...[
                    const SizedBox(width: 8),
                    Semantics(
                      button: true,
                      label: 'notices.add_calendar'.tr,
                      child: GestureDetector(
                        behavior: HitTestBehavior.opaque,
                        onTap: () =>
                            unawaited(addToCalendar(title: notice.title, first: notice.date, details: notice.body)),
                        child: Padding(
                          padding: const EdgeInsets.all(4),
                          child: Stamp('notices.plus_cal'.tr, color: AppColors.off, size: 10),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// Filters sit under the title, like every other list screen; a floating bar at the bottom hid behind the dock.
class _Filters extends StatelessWidget {
  const _Filters({required this.controller});

  final NoticesController controller;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      label: 'notices.filter'.tr,
      container: true,
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        clipBehavior: Clip.none,
        child: Row(
          children: [
            for (final key in noticeFilters.keys) ...[
              if (key != noticeFilters.keys.first) const SizedBox(width: 8),
              Semantics(
                selected: controller.filter.value == key,
                child: Chip2(
                  'notices.filter_$key',
                  on: controller.filter.value == key,
                  onTap: () => controller.filter.value = key,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class NoticeDetailView extends GetView<NoticeDetailController> {
  const NoticeDetailView({super.key});

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    return Obx(() {
      controller.state.value;
      final notice = controller.notice;
      final sittings = controller.sittings;
      final holiday = notice?.category == 'holiday';
      final calendar = notice != null && (sittings.isNotEmpty || holiday);
      return PageFrame(
        leading: const BackGlass(),
        actions: [
          if (notice != null)
            GlassIconButton(
              icon: PhosphorIconsRegular.export,
              label: 'notices.share'.tr,
              onTap: () => ToastHelper.show('notices.shared', kind: ToastKind.success),
            ),
        ],
        topPadding: MediaQuery.paddingOf(context).top + 60,
        onRefresh: controller.load,
        bottomBar: !calendar
            ? null
            : Glass(
                height: 64,
                radius: 32,
                padding: const EdgeInsets.only(left: 20, right: 8),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        sittings.isNotEmpty
                            ? 'notices.exam_days'.trp({'n': '${sittings.length}'})
                            : 'notices.school_closed'.tr,
                        style: anek(13, 600, height: 1.3, color: c.ink3),
                      ),
                    ),
                    Btn(
                      'notices.add_calendar',
                      icon: PhosphorIconsRegular.calendarPlus,
                      height: 48,
                      onPressed: () => unawaited(
                        addToCalendar(
                          title: notice.title,
                          first: sittings.isNotEmpty ? sittings.first.$1 : notice.date,
                          last: sittings.isNotEmpty ? sittings.last.$1 : null,
                          details: notice.body,
                        ),
                      ),
                    ),
                  ],
                ),
              ),
        children: [
          ViewStateView(
            state: controller.state.value,
            onRetry: controller.load,
            errorKey: controller.errorMessage.value,
            emptyArt: EmptyArt.search,
            emptyTitle: 'notices.gone',
            emptyBody: 'notices.gone_body',
            child: notice == null
                ? const SizedBox.shrink()
                : Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Rise(
                        child: Wrap(
                          spacing: 8,
                          children: [
                            Stamp('notices.cat_${notice.category}'.tr, color: _stampTone(context, notice.category)),
                            if (notice.pinned) Stamp('notices.pinned'.tr, color: c.mariText),
                          ],
                        ),
                      ),
                      const SizedBox(height: 14),
                      Rise(index: 1, child: Text(notice.title, style: context.type.h1)),
                      const SizedBox(height: 12),
                      Rise(
                        index: 2,
                        child: Row(
                          children: [
                            Avatar(notice.author, size: 32, background: c.ink, foreground: c.chalk),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Text(
                                '${notice.author} · ${_whenInline(notice.date)}',
                                style: anek(13, 600, height: 1.3, color: c.ink2),
                              ),
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 16),
                      Rise(index: 3, child: Text(notice.body, style: context.type.b)),
                      if (sittings.isNotEmpty) ...[
                        const SizedBox(height: 16),
                        Rise(
                          index: 4,
                          child: EduCard(
                            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                            child: Column(
                              children: [
                                for (var i = 0; i < sittings.length; i++)
                                  _Sitting(
                                    day: sittings[i].$1,
                                    subjects: sittings[i].$2,
                                    last: i == sittings.length - 1,
                                  ),
                              ],
                            ),
                          ),
                        ),
                      ],
                      for (final file in notice.attachments) ...[
                        const SizedBox(height: 12),
                        Rise(
                          index: 5,
                          child: Pressable(
                            onTap: () => ToastHelper.show('notices.attachment_demo'),
                            child: Row(
                              children: [
                                Icon(PhosphorIconsRegular.paperclip, size: 18, color: c.ink3),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Text(file, style: anek(13, 600, height: 1.3, color: c.ink3)),
                                ),
                              ],
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
          ),
        ],
      );
    });
  }
}

class _Sitting extends StatelessWidget {
  const _Sitting({required this.day, required this.subjects, required this.last});

  final DateTime day;
  final List<String> subjects;
  final bool last;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 9),
          child: Row(
            children: [
              SizedBox(
                width: 46,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('${day.day}', style: anek(20, 760, width: 118, height: 1, color: c.ink)),
                    Text(
                      DateFormat('EEE').format(day).toUpperCase(),
                      style: anek(10.5, 700, height: 1.2, em: .06, color: c.ink3),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Cover(subject: subjects.first, label: '', width: 30, height: 38),
              const SizedBox(width: 12),
              Expanded(child: Text(subjects.map(subjectName).join(' · '), style: context.type.t)),
              Text(
                subjects.length > 1 ? 'notices.sittings'.trp({'n': '${subjects.length}'}) : '8:30–11:00',
                style: context.type.mono.copyWith(color: c.ink3),
              ),
            ],
          ),
        ),
        if (!last) const DashedLine(dash: 4, gap: 3, thickness: 1),
      ],
    );
  }
}
