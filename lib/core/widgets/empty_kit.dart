import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:tangent/core/theme/app_colors.dart';
import 'package:tangent/core/theme/tokens.dart';
import 'package:tangent/core/utils/extensions.dart';
import 'package:tangent/core/widgets/app_icons.dart';

/// The scene above an empty screen (Tangent Hue, design/hue/EMPTY-STATES.md, boards EmptyApp1–4): what will appear,
/// built from the app's own parts (cards, rows, tags, bars) and moving in one 10 s loop of up to six beats; still on
/// its last frame when the device asks for less motion. Hidden from screen readers: the words carry the meaning.
/// [search] is not a scene: a search or a filter with no match is not an empty screen, so it gets a plain icon tile.
enum EmptyArt {
  home,
  notices,
  fees,
  homework,
  chat,
  timetable,
  attendance,
  results,
  events,
  gallery,
  transport,
  library,
  leave,
  notifications,
  teacher,
  rollCall,
  marks,
  grading,
  assign,
  search,
}

class EmptyArtView extends StatefulWidget {
  const EmptyArtView(this.art, {this.height = 214, super.key});

  final EmptyArt art;
  final double height;

  @override
  State<EmptyArtView> createState() => _EmptyArtViewState();
}

class _EmptyArtViewState extends State<EmptyArtView> with SingleTickerProviderStateMixin {
  // One loop: parts enter at 0.6, 1.8, 3.0, 4.2, 5.4 and 6.6 s, hold to 9.2 s, then fade and start again.
  late final AnimationController _t = AnimationController(vsync: this, duration: const Duration(seconds: 10));

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (context.reduceMotion) {
      _t
        ..stop()
        ..value = .9;
    } else if (!_t.isAnimating) {
      _t.repeat();
    }
  }

  @override
  void dispose() {
    _t.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    if (widget.art == EmptyArt.search) {
      return ExcludeSemantics(
        child: Container(
          width: 64,
          height: 64,
          alignment: Alignment.center,
          decoration: BoxDecoration(color: c.paper2, borderRadius: BorderRadius.circular(AppRadius.panel)),
          child: Icon(AppIcons.search, size: 28, color: c.ink2),
        ),
      );
    }
    return ExcludeSemantics(
      child: _Loop(
        t: _t,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 340),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              SizedBox(height: widget.height, width: double.infinity, child: _scene(context, widget.art)),
              const SizedBox(height: 8),
              Text('empty.examples'.tr, style: context.type.tiny.copyWith(color: c.ink3)),
            ],
          ),
        ),
      ),
    );
  }
}

/// The loop's position (0 to 1) for the parts below it.
class _Loop extends InheritedNotifier<AnimationController> {
  const _Loop({required AnimationController t, required super.child}) : super(notifier: t);
}

/// A part that enters on beat [k] (1–6) and holds to the end of the loop; with [out] it leaves on that beat instead.
/// [from] is where it comes from; [pop] grows it in.
class Beat extends StatelessWidget {
  const Beat(this.k, this.child, {this.out, this.from = const Offset(0, 14), this.pop = false, super.key});

  final int k;
  final int? out;
  final Offset from;
  final bool pop;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final t = context.dependOnInheritedWidgetOfExactType<_Loop>()!.notifier!;
    return AnimatedBuilder(
      animation: t,
      builder: (context, child) {
        final v = t.value;
        double ramp(double at) => ((v - at) / .05).clamp(0.0, 1.0);
        var p = kEase.transform(ramp(.06 + .12 * (k - 1)));
        if (out != null) p *= 1 - kEaseIn.transform(ramp(.06 + .12 * (out! - 1)));
        p *= 1 - ramp(.92);
        return Opacity(
          opacity: p,
          child: Transform.translate(
            offset: from * (1 - p),
            child: pop ? Transform.scale(scale: .8 + .2 * p, child: child) : child,
          ),
        );
      },
      child: child,
    );
  }
}

/// A number counting up to [to] on beat [k].
class _Count extends StatelessWidget {
  const _Count(this.k, this.to, this.style, {this.suffix = ''});

  final int k;
  final int to;
  final TextStyle style;
  final String suffix;

  @override
  Widget build(BuildContext context) {
    final t = context.dependOnInheritedWidgetOfExactType<_Loop>()!.notifier!;
    return AnimatedBuilder(
      animation: t,
      builder: (context, _) {
        final p = kEase.transform(((t.value - (.06 + .12 * (k - 1))) / .2).clamp(0.0, 1.0));
        return Text('${(to * p).round()}$suffix', style: style);
      },
    );
  }
}

Widget _bar(BuildContext context, double w, {Color? color, double h = 8}) =>
    Container(width: w, height: h, decoration: BoxDecoration(color: color ?? context.app.line, borderRadius: BorderRadius.circular(h / 2)));

Widget _card(BuildContext context, Widget child, {EdgeInsets padding = const EdgeInsets.all(12), Color? color}) => Container(
  padding: padding,
  decoration: BoxDecoration(
    color: color ?? context.app.paper,
    borderRadius: BorderRadius.circular(AppRadius.panel),
    border: Border.all(color: context.app.line),
  ),
  child: child,
);

Widget _tile(BuildContext context, IconData icon, Color bg, Color fg, {double size = 36}) => Container(
  width: size,
  height: size,
  alignment: Alignment.center,
  decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(AppRadius.md)),
  child: Icon(icon, size: size * .5, color: fg),
);

Widget _tag(BuildContext context, String text, Color bg, Color fg) => Container(
  height: 22,
  padding: const EdgeInsets.symmetric(horizontal: 8),
  alignment: Alignment.center,
  decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(AppRadius.xs)),
  child: Text(text, style: context.type.tiny.copyWith(color: fg)),
);

/// A row of a list: its tile, a title and a line under it.
Widget _row(BuildContext context, IconData icon, Color bg, Color fg, String title, String sub, {Widget? trailing}) => _card(
  context,
  Row(
    children: [
      _tile(context, icon, bg, fg),
      const SizedBox(width: 10),
      Expanded(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: context.type.chip),
            Text(sub, maxLines: 1, overflow: TextOverflow.ellipsis, style: context.type.cap),
          ],
        ),
      ),
      ?trailing,
    ],
  ),
  padding: const EdgeInsets.fromLTRB(10, 8, 10, 8),
);

Widget _scene(BuildContext context, EmptyArt art) {
  final c = context.app;
  final t = context.type;
  final blue = c.spectrumFor('blue'), green = c.spectrumFor('green'), pink = c.spectrumFor('pink');
  final amber = c.spectrumFor('amber'), teal = c.spectrumFor('teal'), violet = c.spectrumFor('violet');
  switch (art) {
    // Preview cards of a school day fill in, one by one.
    case EmptyArt.home:
      return Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Beat(1, _row(context, AppIcons.attendance, c.okSoft, c.okText, 'Maya is in school', 'Marked present at 8:02')),
          const SizedBox(height: 8),
          Beat(2, _row(context, AppIcons.fees, c.lateSoft, c.lateText, '2,900.00 due 15 Nov', 'Term 1 · one tap to pay')),
          const SizedBox(height: 8),
          Beat(3, _row(context, AppIcons.homework, blue.soft, blue.ink, 'Maths: exercise 7', 'Due tomorrow')),
        ],
      );
    // A fanned deck of notices.
    case EmptyArt.notices:
      Widget notice(String tag, Color bg, Color fg, String title, double turn, int k) => Beat(
        k,
        Transform.rotate(
          angle: turn,
          child: SizedBox(
            width: 170,
            child: _card(
              context,
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  _tag(context, tag, bg, fg),
                  const SizedBox(height: 8),
                  Text(title, maxLines: 2, style: t.chip),
                  const SizedBox(height: 8),
                  _bar(context, 120),
                  const SizedBox(height: 4),
                  _bar(context, 84),
                ],
              ),
            ),
          ),
        ),
        pop: true,
      );
      return Stack(
        alignment: Alignment.center,
        children: [
          Positioned(left: 10, child: notice('Events', violet.soft, violet.ink, 'Sports day on Friday', -.12, 1)),
          Positioned(right: 10, child: notice('Holiday', c.okSoft, c.okText, 'School shut on Monday', .12, 2)),
          notice('Exams', c.lateSoft, c.lateText, 'Mid-term timetable is out', 0, 3),
        ],
      );
    // A receipt prints and is stamped paid.
    case EmptyArt.fees:
      return Center(
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            Beat(
              1,
              SizedBox(
                width: 200,
                child: _card(
                  context,
                  Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text('Northfield School', style: t.chip),
                      const SizedBox(height: 8),
                      for (final (i, l) in [('Tuition', '2,400.00'), ('Bus, north route', '320.00'), ('Lunch', '180.00')].indexed)
                        Beat(
                          2 + i,
                          Padding(
                            padding: const EdgeInsets.only(bottom: 4),
                            child: Row(children: [Expanded(child: Text(l.$1, style: t.cap)), Text(l.$2, style: t.capB)]),
                          ),
                          from: const Offset(-10, 0),
                        ),
                      Divider(color: c.line2, height: 12),
                      Row(children: [Expanded(child: Text('Total', style: t.chip)), Text('2,900.00', style: t.chip)]),
                    ],
                  ),
                ),
              ),
              from: const Offset(0, -24),
            ),
            Positioned(
              right: -18,
              bottom: -6,
              child: Beat(
                5,
                Transform.rotate(
                  angle: -.12,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(border: Border.all(color: AppColors.ok, width: 2.5), borderRadius: BorderRadius.circular(AppRadius.sm)),
                    child: Text('PAID', style: t.h3.copyWith(color: c.okText)),
                  ),
                ),
                pop: true,
              ),
            ),
          ],
        ),
      );
    // A homework card fills its photo slots and is handed in.
    case EmptyArt.homework:
    case EmptyArt.assign:
      return Center(
        child: SizedBox(
          width: 250,
          child: Beat(
            1,
            _card(
              context,
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Row(children: [_tile(context, AppIcons.homework, blue.soft, blue.ink, size: 32), const SizedBox(width: 8), Expanded(child: Text('Maths: exercise 7', style: t.chip))]),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      for (final (i, s) in [green, amber, pink].indexed) ...[
                        if (i > 0) const SizedBox(width: 8),
                        Expanded(child: Beat(2 + i, Container(height: 44, decoration: BoxDecoration(color: s.soft, borderRadius: BorderRadius.circular(AppRadius.sm))), pop: true)),
                      ],
                    ],
                  ),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      if (art == EmptyArt.assign) ...[
                        _Count(4, 28, t.chip),
                        Text(' of 32 handed in', style: t.cap),
                      ] else
                        Text('Due Thursday', style: t.cap),
                      const Spacer(),
                      Beat(5, _tag(context, 'Handed in', c.okSoft, c.okText), pop: true),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    // The first messages of a conversation arrive.
    case EmptyArt.chat:
      Widget bubble(String s, bool mine, int k) => Beat(
        k,
        Align(
          alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
          child: Container(
            constraints: const BoxConstraints(maxWidth: 220),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
            decoration: BoxDecoration(
              color: mine ? c.brand : c.paper,
              borderRadius: BorderRadius.circular(AppRadius.field),
              border: mine ? null : Border.all(color: c.line),
            ),
            child: Text(s, style: t.cap.copyWith(color: mine ? c.onBrand : c.ink)),
          ),
        ),
        from: Offset(mine ? 16 : -16, 0),
      );
      return Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          bubble('Leo has a dentist visit on Thursday at 10.', true, 1),
          const SizedBox(height: 8),
          bubble('Thank you. I will send his homework home.', false, 2),
          const SizedBox(height: 8),
          bubble('Lovely, thank you, Ms Ortiz.', true, 3),
        ],
      );
    // The day's lessons line up on a timeline.
    case EmptyArt.timetable:
    case EmptyArt.teacher:
      final lessons = [('8:00', 'Science', green), ('8:45', 'English', pink), ('9:30', 'Maths', blue), ('10:35', 'Art', amber)];
      return Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          for (final (i, l) in lessons.indexed)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Beat(
                1 + i,
                Row(
                  children: [
                    SizedBox(width: 44, child: Text(l.$1, style: t.capB)),
                    Expanded(
                      child: Container(
                        height: 34,
                        padding: const EdgeInsets.symmetric(horizontal: 12),
                        alignment: Alignment.centerLeft,
                        decoration: BoxDecoration(color: l.$3.soft, borderRadius: BorderRadius.circular(AppRadius.md)),
                        child: Text(art == EmptyArt.teacher ? '${['7 A', '7 B', '8 A', '9 C'][i]} · ${l.$2}' : l.$2, style: t.chip.copyWith(color: l.$3.ink)),
                      ),
                    ),
                  ],
                ),
                from: const Offset(16, 0),
              ),
            ),
        ],
      );
    // The month fills with days in school.
    case EmptyArt.attendance:
      return Center(
        child: SizedBox(
          width: 260,
          child: Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              for (var d = 0; d < 28; d++)
                Beat(
                  1 + d ~/ 6,
                  Container(
                    width: 31,
                    height: 31,
                    alignment: Alignment.center,
                    decoration: BoxDecoration(
                      color: d % 7 >= 5 ? c.paper2 : d == 10 ? c.badSoft : d == 17 ? c.lateSoft : c.okSoft,
                      borderRadius: BorderRadius.circular(AppRadius.sm),
                    ),
                    child: Text('${d + 1}', style: t.tiny.copyWith(color: d % 7 >= 5 ? c.ink3 : d == 10 ? c.badText : d == 17 ? c.lateText : c.okText)),
                  ),
                  pop: true,
                  from: Offset.zero,
                ),
            ],
          ),
        ),
      );
    // A grade ring fills, with the subjects around it.
    case EmptyArt.results:
      return Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Beat(
            1,
            SizedBox.square(
              dimension: 120,
              child: Stack(
                alignment: Alignment.center,
                children: [
                  CustomPaint(size: const Size.square(120), painter: _Ring(.86, c.brand, c.line)),
                  _Count(1, 86, t.h1, suffix: '%'),
                ],
              ),
            ),
            pop: true,
          ),
          const SizedBox(width: 16),
          Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              for (final (i, s) in [('Maths · A', blue), ('Science · A', green), ('English · B', pink), ('Art · A', amber)].indexed)
                Padding(padding: const EdgeInsets.only(bottom: 6), child: Beat(2 + i, _tag(context, s.$1, s.$2.soft, s.$2.ink), from: const Offset(12, 0))),
            ],
          ),
        ],
      );
    // An event ticket, and an answer to it.
    case EmptyArt.events:
      return Center(
        child: SizedBox(
          width: 260,
          child: Beat(
            1,
            _card(
              context,
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  _tag(context, 'Sat 21 Nov · 10:00', violet.soft, violet.ink),
                  const SizedBox(height: 8),
                  Text('Science fair', style: t.h3),
                  Text('Hall B · families welcome', style: t.cap),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(
                        child: Beat(
                          3,
                          Container(
                            height: 34,
                            alignment: Alignment.center,
                            decoration: BoxDecoration(color: c.brand, borderRadius: BorderRadius.circular(AppRadius.md)),
                            child: Text("I'm coming", style: t.chip.copyWith(color: c.onBrand)),
                          ),
                          pop: true,
                          from: Offset.zero,
                        ),
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Container(
                          height: 34,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(color: c.paper2, borderRadius: BorderRadius.circular(AppRadius.md)),
                          child: Text("Can't make it", style: t.chip),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    // A grid of photos appears.
    case EmptyArt.gallery:
      final tones = [green, blue, amber, pink, teal, violet];
      return GridView.count(
        crossAxisCount: 3,
        mainAxisSpacing: 6,
        crossAxisSpacing: 6,
        physics: const NeverScrollableScrollPhysics(),
        padding: const EdgeInsets.symmetric(horizontal: 32),
        children: [
          for (final (i, s) in tones.indexed)
            Beat(
              1 + i,
              Container(
                decoration: BoxDecoration(color: s.soft, borderRadius: BorderRadius.circular(AppRadius.md)),
                child: Icon(AppIcons.image, color: s.ink, size: 22),
              ),
              pop: true,
              from: Offset.zero,
            ),
        ],
      );
    // A route with its stops, and the bus moving along it.
    case EmptyArt.transport:
      final stops = [('School gate', '7:10'), ('Harbor Road', '7:22'), ('Cedar Hill', '7:31'), ('Your stop', '7:38')];
      return Center(
        child: SizedBox(
          width: 240,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              for (final (i, s) in stops.indexed)
                Beat(
                  1 + i,
                  Row(
                    children: [
                      Column(
                        children: [
                          Container(width: 14, height: 14, decoration: BoxDecoration(shape: BoxShape.circle, color: i == 3 ? c.brand : c.paper, border: Border.all(color: c.brand, width: 3))),
                          if (i < 3) Container(width: 3, height: 22, color: c.brandSoftLine),
                        ],
                      ),
                      const SizedBox(width: 10),
                      Expanded(child: Text(s.$1, style: i == 3 ? t.chip : t.cap.copyWith(color: c.ink2))),
                      Text(s.$2, style: t.capB),
                    ],
                  ),
                  from: const Offset(0, -10),
                ),
            ],
          ),
        ),
      );
    // A shelf of books; one goes out on loan.
    case EmptyArt.library:
      final spines = [blue, pink, green, amber, violet, teal, c.spectrumFor('red')];
      return Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              for (final (i, s) in spines.indexed)
                Beat(
                  i == 3 ? 1 : 1 + i % 2,
                  Container(
                    width: 24,
                    height: 70.0 + (i * 13 % 30),
                    margin: const EdgeInsets.symmetric(horizontal: 2),
                    decoration: BoxDecoration(color: s.fill, borderRadius: BorderRadius.circular(AppRadius.xs)),
                  ),
                  out: i == 3 ? 3 : null,
                ),
            ],
          ),
          Container(height: 6, width: 220, decoration: BoxDecoration(color: c.line2, borderRadius: BorderRadius.circular(AppRadius.hair))),
          const SizedBox(height: 10),
          Beat(4, _tag(context, 'On loan · back by 21 Nov', c.lateSoft, c.lateText), pop: true),
        ],
      );
    // A request is written, sent and approved.
    case EmptyArt.leave:
      return Center(
        child: SizedBox(
          width: 260,
          child: Beat(
            1,
            _card(
              context,
              Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                mainAxisSize: MainAxisSize.min,
                children: [
                  Text('Thu 19 – Fri 20 Nov', style: t.h3),
                  const SizedBox(height: 4),
                  Beat(2, Text('Family wedding in Cedar Hill', style: t.cap), from: const Offset(-10, 0)),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Beat(3, _tag(context, 'Sent to Ms Ortiz', c.infoSoft, c.infoText), pop: true),
                      const SizedBox(width: 6),
                      Beat(4, _tag(context, 'Approved', c.okSoft, c.okText), pop: true),
                    ],
                  ),
                ],
              ),
            ),
          ),
        ),
      );
    // Good empty: the alerts slide away and leave a zero.
    case EmptyArt.notifications:
    case EmptyArt.grading:
      final rows = art == EmptyArt.grading
          ? [('Ratios worksheet', 'Leo Martin'), ('Ratios worksheet', 'Ada Novak'), ('Ratios worksheet', 'Sam Okafor')]
          : [('Sports day on Friday', 'Notice'), ('Leo was marked present', 'Attendance'), ('2,900.00 is due', 'Fees')];
      return Stack(
        alignment: Alignment.center,
        children: [
          Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              for (final (i, r) in rows.indexed)
                Padding(
                  padding: const EdgeInsets.only(bottom: 6),
                  child: Beat(1 + i, _row(context, art == EmptyArt.grading ? AppIcons.homework : AppIcons.notifications, c.mariSoft, c.mariText, r.$1, r.$2), out: 4 + i % 2, from: const Offset(0, 10)),
                ),
            ],
          ),
          Beat(
            5,
            Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text('0', style: t.dl.copyWith(color: c.okText)),
                Text(art == EmptyArt.grading ? 'left to check' : 'new alerts', style: t.capB),
              ],
            ),
            pop: true,
            from: Offset.zero,
          ),
        ],
      );
    // The roll: names are marked one by one.
    case EmptyArt.rollCall:
      final names = ['Maya Torres', 'Leo Martin', 'Ada Novak', 'Sam Okafor'];
      return Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          for (final (i, n) in names.indexed)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: _card(
                context,
                Row(
                  children: [
                    Expanded(child: Text(n, style: t.chip)),
                    Beat(1 + i, i == 2 ? _tag(context, 'Absent', c.badSoft, c.badText) : _tag(context, 'Present', c.okSoft, c.okText), pop: true, from: Offset.zero),
                  ],
                ),
                padding: const EdgeInsets.fromLTRB(12, 8, 10, 8),
              ),
            ),
        ],
      );
    // A marks sheet types itself in.
    case EmptyArt.marks:
      final rows = [('Maya Torres', 18), ('Leo Martin', 15), ('Ada Novak', 19), ('Sam Okafor', 12)];
      return Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          for (final (i, r) in rows.indexed)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: _card(
                context,
                Row(
                  children: [
                    Expanded(child: Text(r.$1, style: t.chip)),
                    Container(
                      width: 48,
                      height: 28,
                      alignment: Alignment.center,
                      decoration: BoxDecoration(color: c.paper2, borderRadius: BorderRadius.circular(AppRadius.sm)),
                      child: _Count(1 + i, r.$2, t.chip),
                    ),
                    Text(' / 20', style: t.cap),
                  ],
                ),
                padding: const EdgeInsets.fromLTRB(12, 6, 10, 6),
              ),
            ),
        ],
      );
    case EmptyArt.search:
      return const SizedBox.shrink();
  }
}

extension on AppColors {
  /// The route line between stops: the brand's soft fill, a little stronger.
  Color get brandSoftLine => Color.lerp(mariSoft, brand, .3)!;
}

class _Ring extends CustomPainter {
  _Ring(this.value, this.color, this.track);

  final double value;
  final Color color;
  final Color track;

  @override
  void paint(Canvas canvas, Size size) {
    final r = Offset.zero & size;
    final p = Paint()
      ..style = PaintingStyle.stroke
      ..strokeWidth = 12
      ..strokeCap = StrokeCap.round;
    canvas
      ..drawArc(r.deflate(6), 0, math.pi * 2, false, p..color = track)
      ..drawArc(r.deflate(6), -math.pi / 2, math.pi * 2 * value, false, p..color = color);
  }

  @override
  bool shouldRepaint(_Ring old) => old.value != value || old.color != color;
}
