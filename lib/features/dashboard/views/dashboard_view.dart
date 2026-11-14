import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:tangent/core/routes/app_routes.dart';
import 'package:tangent/core/services/auth_service.dart';
import 'package:tangent/core/services/school_config.dart';
import 'package:tangent/core/theme/app_colors.dart';
import 'package:tangent/core/theme/app_typography.dart';
import 'package:tangent/core/theme/tokens.dart';
import 'package:tangent/core/utils/extensions.dart';
import 'package:tangent/core/utils/formatters.dart';
import 'package:tangent/core/utils/schedule.dart';
import 'package:tangent/core/widgets/glass.dart';
import 'package:tangent/core/widgets/page.dart';
import 'package:tangent/core/widgets/states.dart';
import 'package:tangent/core/widgets/ui.dart';
import 'package:tangent/data/models/academics.dart';
import 'package:tangent/data/models/user.dart';
import 'package:tangent/features/dashboard/controllers/dashboard_controller.dart';
import 'package:tangent/features/dashboard/widgets/child_switcher.dart';
import 'package:tangent/features/dashboard/widgets/home_cards.dart';
import 'package:tangent/features/dashboard/widgets/home_welcome.dart';
import 'package:intl/intl.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';
import 'package:tangent/core/utils/clock.dart';

class DashboardView extends StatefulWidget {
  const DashboardView({super.key});

  @override
  State<DashboardView> createState() => _DashboardViewState();
}

class _DashboardViewState extends State<DashboardView> {
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
      final hasDay = data != null && data.periods.isNotEmpty && _show('dayRibbon', 'timetable');
      final top = MediaQuery.paddingOf(context).top;
      controller.state.value; // rebuild on state changes
      final c = context.app;
      final user = auth.user.value;
      final first = parent ? (user?.name ?? '').split(' ').first : (data?.student.name ?? '').split(' ').first;
      final hello = parent ? '${Formatters.greetingKey(Clock.now()).tr}, $first' : greeting(first);
      final side = wide ? 130.0 : 20.0;
      // Home as the ParentHome and TeacherHome boards (design/hue/src), on the chalk ground: the greeting, today's lessons
      // as a strip and the cards the console chose.
      return Scaffold(
        backgroundColor: c.chalk,
        body: Stack(
          children: [
            NotificationListener<ScrollUpdateNotification>(
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
                padding: EdgeInsets.zero,
                children: [
                  Padding(
                    padding: EdgeInsets.fromLTRB(side, top + 8, wide ? 40 : 16, 20),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            if (parent) const ChildCapsule() else _ProfileCapsule(data: data),
                            const Spacer(),
                            if (!parent) ...[
                              GlassIconButton(
                                icon: PhosphorIconsRegular.magnifyingGlass,
                                label: 'common.search'.tr,
                                onTap: () => Get.toNamed<void>(AppRoutes.search),
                              ),
                              const SizedBox(width: 10),
                            ],
                            GlassIconButton(
                              icon: PhosphorIconsRegular.bell,
                              label: 'notifications.title'.tr,
                              badge: true,
                              onTap: () => Get.toNamed<void>(AppRoutes.notifications),
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),
                        Rise(child: Text(todayLine(), style: context.type.capB)),
                        const SizedBox(height: 6),
                        Rise(index: 1, child: Text(hello, style: context.type.h1)),
                      ],
                    ),
                  ),
                  Padding(
                    padding: EdgeInsets.fromLTRB(side, 0, wide ? 40 : 20, wide ? 40 : kDockClearance + MediaQuery.paddingOf(context).bottom),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const OfflineCapsule(),
                        if (hasDay) Padding(padding: const EdgeInsets.only(bottom: 16), child: PeriodStrip(periods: data.periods)),
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
          ],
        ),
      );
    });
  }
}

/// Today's lessons as a strip of subject cards in their spectrum colours, the one on now outlined (the ParentHome board).
class PeriodStrip extends StatelessWidget {
  const PeriodStrip({required this.periods, this.label, super.key});

  final List<PeriodSlot> periods;

  /// What a card says: the subject by default, a class for a teacher.
  final String Function(PeriodSlot)? label;

  @override
  Widget build(BuildContext context) {
    final now = nowMinutes();
    final lessons = periods.where((p) => p.kind == PeriodKind.klass).toList();
    return SizedBox(
      height: 64,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: lessons.length,
        separatorBuilder: (_, _) => const SizedBox(width: 8),
        itemBuilder: (context, i) {
          final p = lessons[i];
          final col = context.app.subjectFor(p.subject);
          final on = now >= minutesOf(p.start) && now < minutesOf(p.end);
          return Container(
            width: 112,
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 8),
            decoration: BoxDecoration(color: col.soft, borderRadius: BorderRadius.circular(AppRadius.md)),
            // The outline of the lesson on now is drawn over the card, so it never changes the card's size.
            foregroundDecoration: on
                ? BoxDecoration(borderRadius: BorderRadius.circular(AppRadius.md), border: Border.all(color: col.ink, width: 2))
                : null,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label?.call(p) ?? subjectName(p.subject), maxLines: 1, overflow: TextOverflow.ellipsis, style: context.type.ts.copyWith(color: col.ink)),
                const SizedBox(height: 2),
                Text(
                  on ? '${'home.now'.tr} · ${clockOf(minutesOf(p.start))}' : clockOf(minutesOf(p.start)),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: context.type.cap.copyWith(color: col.ink),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
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
          padding: const EdgeInsets.only(left: 6, right: 16),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              Avatar(name, size: 30, background: AppColors.light.paper, foreground: AppColors.light.ink),
              const SizedBox(width: 8),
              Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    name.split(' ').first,
                    style: AppText.chip(color: context.app.ink, height: 1.05),
                  ),
                  Text(
                    cls,
                    style: AppText.tiny(color: context.app.ink3, height: 1.05),
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


String greeting(String first) => '${Formatters.greetingKey(Clock.now()).tr},\n$first';

String todayLine() => DateFormat('EEEE · d MMMM', Get.locale?.languageCode).format(Clock.now());

/// Home sections follow what Tangent set for the school (console → The app → Home screen cards) and its modules.
bool _show(String card, [String? module]) => SchoolConfig.home.contains(card) && (module == null || SchoolConfig.has(module));

/// Home's cards in the order the console set, each once: what is due (fees, homework and events share one list),
/// attendance and the next exam side by side, and the latest notices. Today's timetable is the band at the top.
/// [due] replaces the student's due list (a parent's covers every child); [only] picks groups for the wide layout.
List<Widget> homeSections(HomeSnapshot data, {bool parent = false, List<Widget>? due, Set<String>? only}) {
  final out = <Widget>[];
  final done = <String>{};
  for (final key in SchoolConfig.home) {
    final group = switch (key) {
      'dueStack' || 'homework' || 'events' => 'due',
      'attendance' || 'nextExam' => 'stats',
      'notices' => 'notices',
      _ => null,
    };
    if (group == null || (only != null && !only.contains(group)) || !done.add(group)) continue;
    switch (group) {
      case 'due':
        out.addAll(due ?? [DueSection(items: data.due)]);
      case 'stats':
        final attendance = _show('attendance', 'attendance');
        final exam = _show('nextExam', 'exams');
        if (!parent && (attendance || exam)) {
          out
            ..add(const SizedBox(height: 12))
            ..add(StatsRow(data: data, attendance: attendance, exam: exam));
        }
      case 'notices':
        if (data.notices.isNotEmpty && SchoolConfig.has('notices')) out.add(NoticesCard(notices: data.notices.take(3).toList()));
    }
  }
  return out;
}

class _StudentBody extends StatelessWidget {
  const _StudentBody({required this.data, required this.scrub});

  final HomeSnapshot data;
  final int? scrub;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Rise(index: 1, child: QuickRow()),
        const SizedBox(height: 16),
        if (data.isNew)
          const Rise(index: 2, child: HomeWelcome())
        else ...[
          Rise(
            index: 2,
            child: NowCard(data: data, scrub: scrub),
          ),
          for (final (i, w) in homeSections(data).indexed) Rise(index: 3 + i, child: w),
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
    final c = context.app;
    final quiet = data.children.where(
      (child) => data.due.every((d) => d.childName != child.student.name.split(' ').first),
    );
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const Rise(index: 1, child: QuickRow()),
        Rise(index: 2, child: SectionLabel('home.both_children'.tr)),
        Rise(index: 2, child: ChildrenStrip(children: data.children)),
        if (data.isNew)
          const Padding(
            padding: EdgeInsets.only(top: 16),
            child: Rise(index: 3, child: HomeWelcome()),
          )
        else
          for (final (i, w) in homeSections(
            data,
            parent: true,
            due: [
              SectionLabel(
                'home.due_across'.trp({'amount': Formatters.inr(data.dueTotal)}),
                action: 'nav.fees',
                onAction: () => Get.toNamed<void>(AppRoutes.fees),
              ),
              DueList(items: data.due.take(4).toList(), showChild: true),
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
          ).indexed)
            Rise(index: 3 + i, child: w),
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
                // A parent is greeted by their own name, as on a phone; a student by theirs.
                greeting(
                  (parent ? Get.find<AuthService>().user.value?.name ?? '' : data.student.name).split(' ').first,
                ).replaceAll('\n', ' '),
                style: context.type.dl,
              ),
              const SizedBox(height: 16),
              const QuickRow(),
              const SizedBox(height: 12),
              if (data.isNew) ...[
                const HomeWelcome(),
              ] else ...[
                NowCard(data: data, scrub: scrub, large: true),
                ...homeSections(data, parent: parent, only: const {'due', 'notices'}),
              ],
            ],
          ),
        ),
        const SizedBox(width: 24),
        Expanded(
          flex: 4,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const SizedBox(height: 20),
              if (!data.isNew && !parent) ...homeSections(data, only: const {'stats'}),
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
              decoration: BoxDecoration(color: c.mariSoft, borderRadius: BorderRadius.circular(10)),
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
      padding: EdgeInsets.all(large ? 16 : 16),
      child: Row(
        children: [
          if (klass && !(isNow && now > end))
            Cover(subject: p.subject, large: large)
          else
            Hatch(
              radius: BorderRadius.circular(7),
              background: c.paper2,
              child: SizedBox(width: large ? 64 : 42, height: large ? 82 : 52),
            ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Overline(when, color: c.mariText),
                const SizedBox(height: 4),
                Text(
                  title,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: large ? context.type.h3 : context.type.t,
                ),
                const SizedBox(height: 2),
                Text(meta, maxLines: 1, overflow: TextOverflow.ellipsis, style: context.type.cap),
                const SizedBox(height: 8),
                ClipRRect(
                  borderRadius: BorderRadius.circular(2),
                  child: Stack(
                    children: [
                      Container(height: 4, color: c.line),
                      AnimatedFractionallySizedBox(
                        duration: AppMotion.t4,
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
                Icon(PhosphorIconsRegular.checkCircle, color: AppColors.ok),
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
  const StatsRow({required this.data, this.attendance = true, this.exam = true, super.key});

  final HomeSnapshot data;

  /// Which halves the school shows (console: Home screen cards); one alone fills the row.
  final bool attendance;
  final bool exam;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final next = data.nextExam;
    final days = next == null ? null : Formatters.daysUntil(next.startDate);
    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (attendance)
          Expanded(
            child: EduCard(
              onTap: () => Get.toNamed<void>(AppRoutes.attendance),
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Overline(DateFormat('MMMM', Get.locale?.languageCode).format(Clock.now())),
                  const SizedBox(height: 10),
                  BigNumber(value: data.summary.percent.round().toString(), unit: '%'),
                  const SizedBox(height: 10),
                  Wrap(
                    spacing: 2,
                    runSpacing: 2,
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
          if (attendance && exam) const SizedBox(width: 10),
          if (exam)
          Expanded(
            child: EduCard(
              onTap: () => Get.toNamed<void>(AppRoutes.results),
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Overline(next == null ? 'home.exam'.tr : 'home.exam_in'.trp({'name': next.name})),
                  const SizedBox(height: 10),
                  if (next == null)
                    Text('home.no_exam'.tr, style: context.type.t)
                  else
                    BigNumber(value: '$days', unit: ' ${'home.days'.tr}'),
                  const SizedBox(height: 10),
                  if (next != null)
                    Text(
                      'home.exam_meta'.trp({
                        'date': DateFormat('d MMM').format(next.startDate),
                        'n': '${next.subjects.length}',
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
            style: context.type.dl.copyWith(fontSize: size * .5, height: .9),
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
  return 'time.n_days'.trn(d);
}
