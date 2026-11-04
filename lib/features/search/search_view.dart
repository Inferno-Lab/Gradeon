import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/routes/app_routes.dart';
import 'package:gradeon/core/services/auth_service.dart';
import 'package:gradeon/core/services/storage_service.dart';
import 'package:gradeon/core/theme/app_colors.dart';
import 'package:gradeon/core/theme/app_typography.dart';
import 'package:gradeon/core/utils/extensions.dart';
import 'package:gradeon/core/utils/formatters.dart';
import 'package:gradeon/core/utils/schedule.dart';
import 'package:gradeon/core/utils/status.dart';
import 'package:gradeon/core/widgets/empty_art.dart';
import 'package:gradeon/core/widgets/glass.dart';
import 'package:gradeon/core/widgets/page.dart';
import 'package:gradeon/core/widgets/states.dart';
import 'package:gradeon/core/widgets/ui.dart';
import 'package:gradeon/data/models/academics.dart';
import 'package:gradeon/data/models/campus.dart';
import 'package:gradeon/data/models/student.dart';
import 'package:gradeon/data/repositories/academic_repository.dart';
import 'package:gradeon/data/repositories/campus_repository.dart';
import 'package:gradeon/data/repositories/directory_repository.dart';
import 'package:gradeon/features/chat/controllers/chat_controller.dart';
import 'package:intl/intl.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

const searchScopes = ['all', 'homework', 'notices', 'people', 'events'];

class AppSearchController extends GetxController {
  final query = ''.obs;
  final scope = 'all'.obs;
  final ready = false.obs;
  final recent = <String>[].obs;

  final List<Homework> _homework = [];
  List<Notice> _notices = [];
  List<Teacher> _people = [];
  List<SchoolEvent> _events = [];
  List<PeriodSlot> today = [];
  final Map<String, SchoolClass> _classes = {};
  String? studentId;

  @override
  void onInit() {
    super.onInit();
    final args = Get.arguments;
    if (args is Map && searchScopes.contains(args['scope'])) scope.value = args['scope'] as String;
    recent.assignAll(
      Get.find<StorageService>().read<List<dynamic>>(StorageKeys.recentSearches)?.cast<String>() ?? const [],
    );
    unawaited(_load());
  }

  Future<void> _load() async {
    final auth = Get.find<AuthService>();
    final directory = Get.find<DirectoryRepository>();
    studentId = auth.activeStudentId.value;
    final user = auth.user.value;
    // Whatever fails to load is simply not searchable; the rest still works.
    Future<T?> soft<T>(Future<T> Function() f) async {
      try {
        return await f();
      } on Exception {
        return null;
      }
    }

    final classIds = <String>[];
    if (studentId != null) {
      final s = await soft(() => directory.student(studentId!));
      if (s != null) classIds.add(s.classId);
    } else if (user?.teacherId != null) {
      classIds.addAll((await soft(() => directory.classesForTeacher(user!.teacherId!)) ?? []).map((c) => c.id));
    }
    for (final id in classIds) {
      _homework.addAll(await soft(() => Get.find<HomeworkRepository>().forClass(id)) ?? []);
      final cls = await soft(() => directory.schoolClass(id));
      if (cls != null) _classes[id] = cls;
    }
    _notices = await soft(() => Get.find<NoticeRepository>().all()) ?? [];
    _people = await soft(directory.teachers) ?? [];
    _events = await soft(() => Get.find<EventRepository>().all()) ?? [];
    if (classIds.isNotEmpty) {
      final days = await soft(() => Get.find<TimetableRepository>().forClass(classIds.first)) ?? [];
      today = days.where((d) => d.day == weekdayKey(DateTime.now())).firstOrNull?.periods ?? [];
    }
    ready.value = true;
  }

  bool _has(String text) => text.toLowerCase().contains(query.value.trim().toLowerCase());

  List<Homework> get homework => query.value.trim().isEmpty
      ? []
      : (_homework.where((h) => _has(h.title) || _has(h.description) || _has(subjectName(h.subject))).toList()
          ..sort((a, b) => b.dueOn.compareTo(a.dueOn)));

  List<Notice> get notices =>
      query.value.trim().isEmpty ? [] : _notices.where((n) => _has(n.title) || _has(n.body)).toList();

  List<Teacher> get people =>
      query.value.trim().isEmpty ? [] : _people.where((t) => _has(t.name) || _has(subjectName(t.subject))).toList();

  List<SchoolEvent> get events => query.value.trim().isEmpty
      ? []
      : _events.where((e) => _has(e.title) || _has(e.description) || _has(e.venue)).toList();

  String? classLabel(String classId) {
    final c = _classes[classId];
    return c == null ? null : '${c.name.replaceAll(RegExp('[^0-9]'), '')} ${c.section}';
  }

  void remember() {
    final q = query.value.trim();
    if (q.length < 2) return;
    recent
      ..remove(q)
      ..insert(0, q);
    if (recent.length > 6) recent.removeRange(6, recent.length);
    unawaited(Get.find<StorageService>().write(StorageKeys.recentSearches, recent.toList()));
  }
}

/// Search, pulled down from Home: a glass field over today's ribbon.
class SearchView extends StatefulWidget {
  const SearchView({super.key});

  @override
  State<SearchView> createState() => _SearchViewState();
}

class _SearchViewState extends State<SearchView> {
  final _text = TextEditingController();
  final _focus = FocusNode();
  AppSearchController get c => Get.find<AppSearchController>();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _focus.requestFocus());
  }

  @override
  void dispose() {
    _text.dispose();
    _focus.dispose();
    super.dispose();
  }

  void _set(String v) {
    _text
      ..text = v
      ..selection = TextSelection.collapsed(offset: v.length);
    c.query.value = v;
    setState(() {});
  }

  void _go(String route, {Object? arguments}) {
    c.remember();
    unawaited(Get.toNamed<void>(route, arguments: arguments));
  }

  @override
  Widget build(BuildContext context) {
    final app = context.app;
    final inset = MediaQuery.paddingOf(context);
    final side = (MediaQuery.sizeOf(context).width - 720) / 2;
    final gutter = side > 16 ? side : 16.0;
    return Scaffold(
      backgroundColor: app.chalk,
      body: Stack(
        children: [
          Positioned(
            left: 0,
            right: 0,
            top: 0,
            height: 84 + inset.top,
            child: Obx(() => _Ribbon(periods: c.today.toList(), ready: c.ready.value)),
          ),
          Positioned.fill(
            child: Obx(() {
              c.query.value;
              c.scope.value;
              c.ready.value;
              c.recent.length;
              final q = c.query.value.trim();
              final s = c.scope.value;
              final hw = s == 'all' || s == 'homework' ? c.homework : <Homework>[];
              final nt = s == 'all' || s == 'notices' ? c.notices : <Notice>[];
              final pp = s == 'all' || s == 'people' ? c.people : <Teacher>[];
              final ev = s == 'all' || s == 'events' ? c.events : <SchoolEvent>[];
              final total = c.homework.length + c.notices.length + c.people.length + c.events.length;
              return ListView(
                keyboardDismissBehavior: ScrollViewKeyboardDismissBehavior.onDrag,
                padding: EdgeInsets.fromLTRB(gutter + 4, inset.top + 102, gutter + 4, inset.bottom + 32),
                children: [
                  SingleChildScrollView(
                    scrollDirection: Axis.horizontal,
                    clipBehavior: Clip.none,
                    child: Row(
                      children: [
                        for (final key in searchScopes) ...[
                          Semantics(
                            selected: s == key,
                            child: Chip2(
                              key == 'all' && q.isNotEmpty
                                  ? 'search.all_n'.trp({'n': '$total'})
                                  : 'search.scope_$key'.tr,
                              on: s == key,
                              onTap: () => c.scope.value = key,
                            ),
                          ),
                          const SizedBox(width: 8),
                        ],
                      ],
                    ),
                  ),
                  if (q.isEmpty) ...[
                    if (c.recent.isNotEmpty) ...[
                      SectionLabel('search.recent'.tr),
                      Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: [
                          for (final r in c.recent)
                            Chip2(r, icon: PhosphorIconsRegular.clockCounterClockwise, onTap: () => _set(r)),
                        ],
                      ),
                    ] else
                      const EmptyState(art: EmptyArt.search, title: 'search.start', body: 'search.start_body'),
                  ] else if (!c.ready.value)
                    const Padding(padding: EdgeInsets.only(top: 22), child: SkeletonList())
                  else if (hw.isEmpty && nt.isEmpty && pp.isEmpty && ev.isEmpty)
                    EmptyState(art: EmptyArt.search, title: 'search.nothing', body: 'search.nothing_body'.trp({'q': q}))
                  else ...[
                    if (hw.isNotEmpty)
                      ..._section('search.scope_homework', [
                        for (final h in hw)
                          _Result(
                            leading: Cover(subject: h.subject),
                            title: _mark(context, h.title, q),
                            sub: _homeworkLine(h),
                            onTap: () => _go(AppRoutes.homeworkDetail.replaceFirst(':id', h.id)),
                          ),
                      ]),
                    if (nt.isNotEmpty)
                      ..._section('search.scope_notices', [
                        for (final n in nt)
                          _Result(
                            leading: _IconTile(
                              icon: PhosphorIconsRegular.megaphone,
                              fill: app.mariSoft,
                              on: app.mariText,
                            ),
                            title: _mark(context, n.title, q),
                            subSpan: _snippet(context, n.body, q),
                            onTap: () => _go('/notices/${n.id}'),
                          ),
                      ]),
                    if (pp.isNotEmpty)
                      ..._section('search.scope_people', [
                        for (final t in pp)
                          _Result(
                            leading: Avatar(
                              t.name,
                              background: AppColors.subject(t.subject).fill,
                              foreground: AppColors.subject(t.subject).on,
                            ),
                            title: _mark(context, t.name, q),
                            sub: [
                              subjectName(t.subject),
                              ...t.classIds.map(c.classLabel).whereType<String>(),
                            ].join(' · '),
                            trailing: Icon(PhosphorIconsRegular.chatCircle, size: 18, color: app.ink3),
                            onTap: () {
                              c.remember();
                              if (Get.isRegistered<ChatListController>()) {
                                unawaited(Get.find<ChatListController>().startWith(t));
                              }
                            },
                          ),
                      ]),
                    if (ev.isNotEmpty)
                      ..._section('search.scope_events', [
                        for (final e in ev)
                          _Result(
                            leading: _IconTile(
                              icon: PhosphorIconsRegular.calendarBlank,
                              fill: AppColors.subject('science').fill,
                              on: AppColors.white,
                            ),
                            title: _mark(context, e.title, q),
                            sub: '${DateFormat('EEE d MMM').format(e.date)} · ${e.venue}',
                            onTap: () => _go('/events/${e.id}'),
                          ),
                      ]),
                  ],
                ],
              );
            }),
          ),
          Positioned(
            left: gutter,
            right: gutter,
            top: inset.top + 12,
            child: TweenAnimationBuilder<double>(
              tween: Tween(begin: context.reduceMotion ? 1 : 0, end: 1),
              duration: const Duration(milliseconds: 550),
              curve: const Cubic(.3, 1.45, .45, 1),
              builder: (context, t, child) => Opacity(
                opacity: t.clamp(0, 1),
                child: Transform.translate(
                  offset: Offset(0, -30 * (1 - t)),
                  child: Transform.scale(scale: .94 + .06 * t, child: child),
                ),
              ),
              child: Glass(
                height: 56,
                radius: 28,
                tint: app.dark ? null : const Color(0x80FBFCF9),
                padding: const EdgeInsets.only(left: 18, right: 8),
                child: Row(
                  children: [
                    Icon(PhosphorIconsRegular.magnifyingGlass, color: app.ink, size: 22),
                    const SizedBox(width: 10),
                    Expanded(
                      child: TextField(
                        controller: _text,
                        focusNode: _focus,
                        textInputAction: TextInputAction.search,
                        onChanged: (v) => setState(() => c.query.value = v),
                        onSubmitted: (_) => c.remember(),
                        style: anek(17, 560, color: app.ink),
                        cursorColor: app.ink,
                        decoration: InputDecoration(
                          isCollapsed: true,
                          filled: false,
                          border: InputBorder.none,
                          enabledBorder: InputBorder.none,
                          focusedBorder: InputBorder.none,
                          hintText: 'search.hint'.tr,
                          hintStyle: anek(17, 520, color: app.ink3),
                        ),
                      ),
                    ),
                    Semantics(
                      button: true,
                      label: _text.text.isEmpty ? 'common.close'.tr : 'common.clear'.tr,
                      child: GestureDetector(
                        onTap: _text.text.isEmpty ? () => Get.back<void>() : () => _set(''),
                        child: Container(
                          width: 40,
                          height: 40,
                          decoration: BoxDecoration(color: app.ink.withValues(alpha: .08), shape: BoxShape.circle),
                          child: Icon(PhosphorIconsRegular.x, size: 18, color: app.ink),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  String _homeworkLine(Homework h) {
    final sub = c.studentId == null ? null : h.forStudent(c.studentId!);
    final graded = sub?.grade;
    if (graded != null) {
      return '${subjectName(h.subject)} · ${'search.graded'.trp({'grade': graded})} · ${DateFormat('d MMM').format(h.dueOn)}';
    }
    final days = Formatters.daysUntil(h.dueOn);
    final when = days == 0
        ? 'common.today'.tr.toLowerCase()
        : days == 1
        ? 'common.tomorrow'.tr.toLowerCase()
        : DateFormat('EEE d MMM').format(h.dueOn);
    return '${subjectName(h.subject)} · ${'search.due'.trp({'when': when})}';
  }

  List<Widget> _section(String key, List<Widget> rows) => [
    SectionLabel(key.tr, top: 20),
    EduCard(
      child: Column(
        children: [
          for (var i = 0; i < rows.length; i++) ...[if (i > 0) const Hr(indent: 68), rows[i]],
        ],
      ),
    ),
  ];
}

/// Highlights every match of [q] in [text] with a marigold wash.
TextSpan _mark(BuildContext context, String text, String q) {
  final style = TextStyle(backgroundColor: context.app.mariSoft);
  final lower = text.toLowerCase();
  final needle = q.toLowerCase();
  final spans = <TextSpan>[];
  var i = 0;
  while (needle.isNotEmpty) {
    final at = lower.indexOf(needle, i);
    if (at < 0) break;
    if (at > i) spans.add(TextSpan(text: text.substring(i, at)));
    spans.add(TextSpan(text: text.substring(at, at + needle.length), style: style));
    i = at + needle.length;
  }
  if (i < text.length) spans.add(TextSpan(text: text.substring(i)));
  return TextSpan(children: spans);
}

/// A quoted window of [body] around the first match.
TextSpan _snippet(BuildContext context, String body, String q) {
  final at = body.toLowerCase().indexOf(q.toLowerCase());
  if (at < 0) return TextSpan(text: body);
  final from = (at - 24).clamp(0, body.length);
  final to = (at + q.length + 36).clamp(0, body.length);
  final cut = body.substring(from, to);
  return TextSpan(
    children: [
      TextSpan(text: from > 0 ? '“…' : '“'),
      _mark(context, cut, q),
      TextSpan(text: to < body.length ? '…”' : '”'),
    ],
  );
}

class _IconTile extends StatelessWidget {
  const _IconTile({required this.icon, required this.fill, required this.on});

  final IconData icon;
  final Color fill;
  final Color on;

  @override
  Widget build(BuildContext context) => Container(
    width: 40,
    height: 40,
    decoration: BoxDecoration(color: fill, borderRadius: BorderRadius.circular(12)),
    child: Icon(icon, size: 18, color: on),
  );
}

class _Result extends StatelessWidget {
  const _Result({
    required this.leading,
    required this.title,
    required this.onTap,
    this.sub,
    this.subSpan,
    this.trailing,
  });

  final Widget leading;
  final TextSpan title;
  final String? sub;
  final TextSpan? subSpan;
  final Widget? trailing;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Pressable(
    onTap: onTap,
    scale: .985,
    child: Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
      child: Row(
        children: [
          leading,
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text.rich(title, style: context.type.t),
                if (subSpan != null)
                  Text.rich(subSpan!, style: context.type.cap, maxLines: 2, overflow: TextOverflow.ellipsis)
                else if (sub != null)
                  Text(sub!, style: context.type.cap, maxLines: 2, overflow: TextOverflow.ellipsis),
              ],
            ),
          ),
          if (trailing != null) ...[const SizedBox(width: 8), trailing!],
        ],
      ),
    ),
  );
}

/// Today's periods as blocks, the Home ribbon peeking out behind the field.
class _Ribbon extends StatelessWidget {
  const _Ribbon({required this.periods, required this.ready});

  final List<PeriodSlot> periods;
  final bool ready;

  @override
  Widget build(BuildContext context) {
    if (!ready || periods.isEmpty) return const SizedBox.shrink();
    final now = nowMinutes();
    final first = minutesOf(periods.first.start);
    // Centre the ribbon on now, as Home does.
    const k = 2.07;
    final width = MediaQuery.sizeOf(context).width;
    final offset = width / 2 - (now.clamp(first, minutesOf(periods.last.end)) - first) * k;
    return ClipRect(
      child: Stack(
        children: [
          for (final p in periods)
            Positioned(
              left: offset + (minutesOf(p.start) - first) * k,
              width: (minutesOf(p.end) - minutesOf(p.start)) * k - 3,
              top: 0,
              bottom: 0,
              child: Opacity(
                opacity: minutesOf(p.end) <= now ? .55 : 1,
                child: p.kind == PeriodKind.klass
                    ? DecoratedBox(
                        decoration: BoxDecoration(
                          color: minutesOf(p.end) <= now
                              ? Color.lerp(AppColors.subject(p.subject).fill, const Color(0xFF9AA39E), .65)
                              : AppColors.subject(p.subject).fill,
                          borderRadius: const BorderRadius.vertical(bottom: Radius.circular(18)),
                        ),
                      )
                    : Hatch(
                        radius: const BorderRadius.vertical(bottom: Radius.circular(18)),
                        background: context.app.paper2,
                      ),
              ),
            ),
        ],
      ),
    );
  }
}
