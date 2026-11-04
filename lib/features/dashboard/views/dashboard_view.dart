import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/routes/app_routes.dart';
import 'package:gradeon/core/services/auth_service.dart';
import 'package:gradeon/core/theme/app_colors.dart';
import 'package:gradeon/core/theme/app_typography.dart';
import 'package:gradeon/core/utils/extensions.dart';
import 'package:gradeon/core/utils/formatters.dart';
import 'package:gradeon/core/utils/schedule.dart';
import 'package:gradeon/core/utils/status.dart';
import 'package:gradeon/core/widgets/glass.dart';
import 'package:gradeon/core/widgets/page.dart';
import 'package:gradeon/core/widgets/states.dart';
import 'package:gradeon/core/widgets/ui.dart';
import 'package:gradeon/data/models/academics.dart';
import 'package:gradeon/data/models/user.dart';
import 'package:gradeon/features/dashboard/controllers/dashboard_controller.dart';
import 'package:gradeon/features/dashboard/widgets/child_switcher.dart';
import 'package:gradeon/features/dashboard/widgets/day_ribbon.dart';
import 'package:gradeon/features/dashboard/widgets/home_cards.dart';
import 'package:gradeon/features/dashboard/widgets/home_welcome.dart';
import 'package:intl/intl.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

class DashboardView extends StatefulWidget {
  const DashboardView({super.key});

  @override
  State<DashboardView> createState() => _DashboardViewState();
}

class _DashboardViewState extends State<DashboardView> {
  final _ribbon = GlobalKey<DayRibbonState>();
  int? _scrub;
  var _pulled = false;

  DashboardController get controller => Get.find<DashboardController>();

  @override
  Widget build(BuildContext context) {
    final auth = Get.find<AuthService>();
    return Obx(() {
      final data = controller.snapshot;
      final parent = auth.role == UserRole.parent;
      final wide = context.isWide;
      // With no classes today there is no ribbon: a slim header and dark controls.
      final hasDay = data != null && data.periods.isNotEmpty;
      final ribbonH = hasDay ? (parent ? 196.0 : 236.0) : 0.0;
      final controlInk = hasDay ? AppColors.white : context.app.ink;
      final top = MediaQuery.paddingOf(context).top;
      controller.state.value; // rebuild on state changes
      return Scaffold(
        backgroundColor: context.app.chalk,
        body: NotificationListener<ScrollUpdateNotification>(
          // Pull down on Home opens search.
          onNotification: (n) {
            if (n.metrics.pixels < -90 && !_pulled) {
              _pulled = true;
              unawaited(Get.toNamed<void>(AppRoutes.search)?.then((_) => _pulled = false));
            }
            return false;
          },
          // No refresh circle here: pulling down is the search gesture, and Home reloads itself on any change.
          child: ListView(
              physics: const AlwaysScrollableScrollPhysics(parent: BouncingScrollPhysics()),
              padding: EdgeInsets.only(bottom: wide ? 40 : kDockClearance + MediaQuery.paddingOf(context).bottom),
              children: [
                SizedBox(
                  height: hasDay || data == null ? ribbonH + 36 : top + 64,
                  child: Stack(
                    children: [
                      if (data == null)
                        const _RibbonPlaceholder(height: 189)
                      else if (hasDay)
                        Positioned(
                          left: 0,
                          right: 0,
                          top: 0,
                          child: DayRibbon(
                            key: _ribbon,
                            periods: data.periods,
                            height: ribbonH,
                            pxPerMinute: wide ? 3.6 : 2.4,
                            leftInset: wide ? 110 : 0,
                            showLabel: !parent,
                            draggable: !parent,
                            onScrub: (m) => setState(() => _scrub = m),
                            blockDetail: wide ? (p) => data.teacherNames[p.teacherId] : null,
                          ),
                        ),
                      if (hasDay)
                        Positioned(
                          left: 0,
                          right: 0,
                          top: ribbonH + 6,
                          child: RibbonScale(
                            periods: data.periods,
                            pxPerMinute: wide ? 3.6 : 2.4,
                            leftInset: wide ? 110 : 0,
                          ),
                        ),
                      Positioned(
                        left: wide ? 130 : 16,
                        top: top + 8,
                        child: parent ? const ChildCapsule() : _ProfileCapsule(data: data),
                      ),
                      Positioned(
                        right: wide ? 24 : 16,
                        top: top + 8,
                        child: Row(
                          children: [
                            if (!parent) ...[
                              GlassIconButton(
                                icon: PhosphorIconsRegular.magnifyingGlass,
                                label: 'common.search'.tr,
                                color: controlInk,
                                onTap: () => Get.toNamed<void>(AppRoutes.search),
                              ),
                              const SizedBox(width: 10),
                            ],
                            GlassIconButton(
                              icon: PhosphorIconsRegular.bell,
                              label: 'notifications.title'.tr,
                              color: controlInk,
                              badge: true,
                              onTap: () => Get.toNamed<void>(AppRoutes.notifications),
                            ),
                          ],
                        ),
                      ),
                      if (_scrub != null)
                        Positioned(
                          right: 16,
                          top: ribbonH + 30,
                          child: GlassPress(
                            onTap: () => _ribbon.currentState?.backToNow(),
                            child: Glass(
                              height: 36,
                              radius: 18,
                              padding: const EdgeInsets.symmetric(horizontal: 14),
                              child: Row(
                                mainAxisSize: MainAxisSize.min,
                                children: [
                                  Icon(PhosphorIconsRegular.clock, size: 15, color: context.app.ink),
                                  const SizedBox(width: 6),
                                  Text(
                                    'home.back_to_now'.tr,
                                    style: anek(13.5, 650, height: 1, color: context.app.ink),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
                Padding(
                  padding: EdgeInsets.fromLTRB(wide ? 130 : 20, 0, wide ? 40 : 20, 0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const OfflineCapsule(),
                      ViewStateView(
                        state: controller.state.value,
                        onRetry: controller.load,
                        errorKey: controller.errorMessage.value,
                        emptyTitle: 'home.empty_title',
                        emptyBody: 'home.empty_body',
                        child: data == null
                            ? const SizedBox.shrink()
                            : wide
                            ? _WideBody(data: data, scrub: _scrub, parent: parent)
                            : parent
                            ? _ParentBody(data: data)
                            : _StudentBody(data: data, scrub: _scrub),
                      ),
                    ],
                  ),
                ),
              ],
            ),
        ),
      );
    });
  }
}

class _RibbonPlaceholder extends StatelessWidget {
  const _RibbonPlaceholder({required this.height});

  final double height;

  @override
  Widget build(BuildContext context) => Sweep(
    child: Row(
      children: [
        for (var i = 0; i < 4; i++)
          Expanded(
            child: Container(
              height: height,
              margin: const EdgeInsets.only(right: 4),
              decoration: BoxDecoration(
                color: context.app.paper2,
                borderRadius: const BorderRadius.vertical(bottom: Radius.circular(20)),
              ),
            ),
          ),
      ],
    ),
  );
}

class _ProfileCapsule extends StatelessWidget {
  const _ProfileCapsule({required this.data});

  final HomeSnapshot? data;

  @override
  Widget build(BuildContext context) {
    final user = Get.find<AuthService>().user.value;
    final name = data?.student.name ?? user?.name ?? '';
    final cls = data == null ? '' : '${data!.schoolClass.name} ${data!.schoolClass.section}';
    return GlassPress(
      onTap: () => Get.toNamed<void>(AppRoutes.profile),
      child: Semantics(
        button: true,
        label: 'home.profile_capsule'.trp({'name': name, 'class': cls}),
        child: Glass(
          height: 44,
          // Frosted with ink text: over the ribbon the capsule meets pale hatching as well as colour.
          padding: const EdgeInsets.only(left: 5, right: 14),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Avatar(name, size: 30, background: const Color(0xFFFBFCF9), foreground: const Color(0xFF10201B)),
              const SizedBox(width: 8),
              Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    name.split(' ').first,
                    style: anek(14, 680, height: 1.05, color: context.app.ink),
                  ),
                  Text(
                    cls,
                    style: anek(11.5, 560, height: 1.05, color: context.app.ink3),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}


String greeting(String first) => '${Formatters.greetingKey(DateTime.now()).tr},\n$first';

String todayLine() => DateFormat('EEEE · d MMMM', Get.locale?.languageCode).format(DateTime.now());

class _StudentBody extends StatelessWidget {
  const _StudentBody({required this.data, required this.scrub});

  final HomeSnapshot data;
  final int? scrub;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Rise(child: Overline(todayLine())),
        const SizedBox(height: 8),
        Rise(index: 1, child: Text(greeting(data.student.name.split(' ').first), style: context.type.h1)),
        const SizedBox(height: 18),
        if (data.isNew)
          const Rise(index: 2, child: HomeWelcome())
        else ...[
          Rise(
            index: 2,
            child: NowCard(data: data, scrub: scrub),
          ),
          Rise(index: 3, child: DueSection(items: data.due)),
          const SizedBox(height: 12),
          Rise(index: 5, child: StatsRow(data: data)),
        ],
      ],
    );
  }
}

class _ParentBody extends StatelessWidget {
  const _ParentBody({required this.data});

  final HomeSnapshot data;

  @override
  Widget build(BuildContext context) {
    final user = Get.find<AuthService>().user.value;
    final c = context.app;
    final quiet = data.children.where(
      (child) => data.due.every((d) => d.childName != child.student.name.split(' ').first),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Rise(child: Overline(todayLine())),
        const SizedBox(height: 8),
        Rise(
          index: 1,
          child: Text(
            '${Formatters.greetingKey(DateTime.now()).tr}, ${(user?.name ?? '').split(' ').first}',
            style: context.type.h1,
          ),
        ),
        Rise(index: 2, child: SectionLabel('home.both_children'.tr)),
        Rise(index: 2, child: ChildrenStrip(children: data.children)),
        if (data.isNew)
          const Padding(
            padding: EdgeInsets.only(top: 16),
            child: Rise(index: 3, child: HomeWelcome()),
          )
        else ...[
          Rise(
            index: 3,
            child: SectionLabel(
              'home.due_across'.trp({'amount': Formatters.inr(data.dueTotal)}),
              action: 'nav.fees',
              onAction: () => Get.toNamed<void>(AppRoutes.fees),
            ),
          ),
          Rise(index: 4, child: DueList(items: data.due.take(4).toList(), showChild: true)),
          for (final child in quiet)
            Padding(
              padding: const EdgeInsets.only(top: 10),
              child: Center(
                child: Text(
                  'home.nothing_due_for'.trp({'name': child.student.name.split(' ').first}),
                  style: context.type.cap.copyWith(color: c.ink3),
                ),
              ),
            ),
        ],
      ],
    );
  }
}

class _WideBody extends StatelessWidget {
  const _WideBody({required this.data, required this.scrub, required this.parent});

  final HomeSnapshot data;
  final int? scrub;
  final bool parent;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Expanded(
          flex: 5,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Overline(todayLine()),
              const SizedBox(height: 8),
              Text(
                greeting(data.student.name.split(' ').first).replaceAll('\n', ' '),
                style: context.type.h1.copyWith(fontSize: 40),
              ),
              const SizedBox(height: 18),
              if (data.isNew) ...[
                const HomeWelcome(),
              ] else ...[
                NowCard(data: data, scrub: scrub, large: true),
                DueSection(items: data.due),
              ],
            ],
          ),
        ),
        const SizedBox(width: 28),
        Expanded(
          flex: 4,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 22),
              if (!data.isNew) ...[
                StatsRow(data: data),
                if (data.notices.any((n) => n.pinned)) ...[
                  SectionLabel('home.pinned_notices'.tr),
                  EduCard(
                    child: Column(
                      children: [
                        for (var i = 0; i < data.notices.where((n) => n.pinned).length; i++) ...[
                          if (i > 0) const Hr(),
                          NoticeLine(notice: data.notices.where((n) => n.pinned).elementAt(i)),
                        ],
                      ],
                    ),
                  ),
                ],
              ],
              if (parent) ...[SectionLabel('home.both_children'.tr), ChildrenStrip(children: data.children)],
            ],
          ),
        ),
      ],
    );
  }
}

/// The "Now" card under the ribbon; follows the lens while scrubbing.
class NowCard extends StatelessWidget {
  const NowCard({required this.data, required this.scrub, this.large = false, super.key});

  final HomeSnapshot data;
  final int? scrub;
  final bool large;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final periods = data.periods;
    if (periods.isEmpty) {
      return EduCard(
        padding: const EdgeInsets.all(16),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(color: c.mariSoft, borderRadius: BorderRadius.circular(12)),
              child: Icon(PhosphorIconsRegular.sun, size: 20, color: c.mariText),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('home.no_classes_today'.tr, style: context.type.t),
                  Text('home.no_classes_body'.tr, style: context.type.cap),
                ],
              ),
            ),
          ],
        ),
      );
    }
    final now = nowMinutes();
    final start = minutesOf(periods.first.start);
    final end = minutesOf(periods.last.end);
    final minute = scrub ?? now.clamp(start - 1, end + 1);
    final isNow = scrub == null;
    final p = periodAt(periods, minute.clamp(start, end))!;
    final a = minutesOf(p.start);
    final b = minutesOf(p.end);
    final klass = p.kind == PeriodKind.klass;
    final who = data.teacherNames[p.teacherId] ?? '';

    late final String when;
    late final String title;
    late final String meta;
    var pct = ((minute - a) / (b - a)).clamp(0.0, 1.0);
    if (isNow && now < start) {
      when = 'home.starts_at'.trp({'time': clockOf(start)});
      title = '${subjectName(p.subject)} · $who';
      meta = 'home.room_line'.trp({'room': p.room, 'start': clockOf(a), 'end': clockOf(b)});
      pct = 0;
    } else if (isNow && now > end) {
      when = 'home.done_today'.tr;
      title = 'home.school_over'.tr;
      meta = 'home.ended_at'.trp({'time': clockOf(end)});
      pct = 1;
    } else {
      final label = isNow ? 'home.now'.tr : (minute < now ? 'home.earlier'.tr : 'home.later'.tr);
      when = '$label · ${clockOf(minute)}';
      if (klass) {
        title = '${subjectName(p.subject)} · $who';
        final left = (b - minute).clamp(0, 999);
        meta =
            'home.room_line'.trp({'room': p.room, 'start': clockOf(a), 'end': clockOf(b)}) +
            (isNow ? ' · ${'home.min_left'.trp({'n': '$left'})}' : '');
      } else {
        final next = nextClassAfter(periods, p);
        title = subjectName(p.subject);
        meta = 'home.until_next'.trp({
          'time': clockOf(b),
          'next': next == null ? 'home.home_time'.tr : subjectName(next.subject),
        });
      }
    }
    return EduCard(
      padding: EdgeInsets.all(large ? 16 : 14),
      child: Row(
        children: [
          if (klass && !(isNow && now > end))
            Cover(subject: p.subject, large: large)
          else
            Hatch(
              radius: BorderRadius.circular(8),
              background: c.paper2,
              child: SizedBox(width: large ? 64 : 42, height: large ? 82 : 52),
            ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Overline(when, color: c.mariText),
                const SizedBox(height: 5),
                Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: large ? context.type.h3 : context.type.t,
                ),
                const SizedBox(height: 2),
                Text(meta, maxLines: 1, overflow: TextOverflow.ellipsis, style: context.type.cap),
                const SizedBox(height: 9),
                ClipRRect(
                  borderRadius: BorderRadius.circular(2),
                  child: Stack(
                    children: [
                      Container(height: 4, color: c.line),
                      AnimatedFractionallySizedBox(
                        duration: const Duration(milliseconds: 400),
                        widthFactor: pct,
                        child: Container(height: 4, color: c.ink),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class DueSection extends StatelessWidget {
  const DueSection({required this.items, super.key});

  final List<DueItem> items;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        SectionLabel(
          'home.due_count'.trp({'n': '${items.length}'}),
          top: 24,
          action: 'common.see_all',
          onAction: () => Get.toNamed<void>(AppRoutes.homework),
        ),
        if (items.isEmpty)
          EduCard(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                const Icon(PhosphorIconsRegular.checkCircle, color: AppColors.ok),
                const SizedBox(width: 12),
                Expanded(child: Text('home.nothing_due'.tr, style: context.type.t)),
              ],
            ),
          )
        else
          DueList(items: items.take(3).toList()),
      ],
    );
  }
}

class StatsRow extends StatelessWidget {
  const StatsRow({required this.data, super.key});

  final HomeSnapshot data;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final exam = data.nextExam;
    final days = exam == null ? null : Formatters.daysUntil(exam.startDate);
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Expanded(
            child: EduCard(
              onTap: () => Get.toNamed<void>(AppRoutes.attendance),
              padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Overline(DateFormat('MMMM', Get.locale?.languageCode).format(DateTime.now())),
                  const SizedBox(height: 10),
                  BigNumber(value: data.summary.percent.round().toString(), unit: '%'),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 3,
                    runSpacing: 3,
                    children: [
                      for (final d in data.monthDays.where((d) => d.status != AttendanceStatus.holiday))
                        Dot(switch (d.status) {
                          AttendanceStatus.present => AppColors.ok,
                          AttendanceStatus.absent => AppColors.bad,
                          AttendanceStatus.lateArrival => AppColors.late,
                          AttendanceStatus.holiday => c.line2,
                        }),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: EduCard(
              onTap: () => Get.toNamed<void>(AppRoutes.results),
              padding: const EdgeInsets.fromLTRB(14, 14, 14, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Overline(exam == null ? 'home.exam'.tr : 'home.exam_in'.trp({'name': exam.name})),
                  const SizedBox(height: 10),
                  if (exam == null)
                    Text('home.no_exam'.tr, style: context.type.t)
                  else
                    BigNumber(value: '$days', unit: ' ${'home.days'.tr}'),
                  const SizedBox(height: 10),
                  if (exam != null)
                    Text(
                      'home.exam_meta'.trp({
                        'date': DateFormat('d MMM').format(exam.startDate),
                        'n': '${exam.subjects.length}',
                      }),
                      style: context.type.cap,
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// Wide display number with a narrower unit ("92%", "14 days").
class BigNumber extends StatelessWidget {
  const BigNumber({required this.value, this.unit = '', this.size = 48, super.key});

  final String value;
  final String unit;
  final double size;

  @override
  Widget build(BuildContext context) {
    final base = size >= 60 ? context.type.dx.copyWith(fontSize: size) : context.type.dl.copyWith(fontSize: size);
    return Text.rich(
      TextSpan(
        text: value,
        children: [
          TextSpan(
            text: unit,
            style: anek(size * .5, 760, width: 110, height: .9, color: context.app.ink),
          ),
        ],
      ),
      style: base,
      maxLines: 1,
    );
  }
}

/// Status line shared by home rows ("6 days").
String daysStamp(DateTime date) {
  final d = Formatters.daysUntil(date);
  if (d == 0) return 'time.today'.tr;
  if (d == 1) return 'time.one_day'.tr;
  return 'time.n_days'.trp({'n': '$d'});
}

MoneyStatus feeTone(DueItem item) => moneyStatus(item.installment!);
