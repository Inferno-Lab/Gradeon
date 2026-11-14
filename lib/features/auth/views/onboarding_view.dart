import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:tangent/core/theme/app_typography.dart';
import 'package:tangent/core/theme/tokens.dart';
import 'package:tangent/core/utils/extensions.dart';
import 'package:tangent/core/utils/haptics.dart';
import 'package:tangent/core/widgets/app_icons.dart';
import 'package:tangent/core/widgets/glass.dart';
import 'package:tangent/core/widgets/ui.dart';
import 'package:tangent/data/models/academics.dart';
import 'package:tangent/features/auth/controllers/splash_controller.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

/// Progress of one step inside a page's entrance: 0 before [from], 1 after [to].
double _phase(double t, double from, double to, [Curve curve = kEase]) =>
    curve.transform(((t - from) / (to - from)).clamp(0.0, 1.0));

/// Where the pager is, in pages (1.4 = most of the way to page two).
double _position(PageController pager, int fallback) =>
    pager.hasClients && pager.position.haveDimensions ? pager.page ?? fallback.toDouble() : fallback.toDouble();

class OnboardingView extends GetView<OnboardingController> {
  const OnboardingView({super.key});

  @override
  Widget build(BuildContext context) {
    final inset = MediaQuery.paddingOf(context);
    final pager = controller.controller;
    // PageView stays outside AnimatedBuilder: rebuilding it on every scroll
    // tick used to flash page 0 for a frame before the next page settled.
    return Scaffold(
      backgroundColor: context.app.chalk,
      body: Stack(
        children: [
          PageView.builder(
            controller: pager,
            itemCount: 3,
            onPageChanged: (value) {
              controller.page.value = value;
              Haptics.selection();
            },
            itemBuilder: (context, i) => _Page(index: i, pager: pager),
          ),
          Positioned(
            left: 16,
            right: 16,
            top: inset.top + 8,
            child: Obx(() {
              final last = controller.page.value == 2;
              final first = controller.page.value == 0;
              return Row(
                children: [
                  _TopChip(
                    visible: !first,
                    child: GlassIconButton(
                      icon: PhosphorIconsBold.caretLeft,
                      label: 'common.back'.tr,
                      onTap: () => unawaited(controller.previous()),
                    ),
                  ),
                  const Spacer(),
                  _TopChip(
                    visible: !last,
                    child: GlassPress(
                      onTap: controller.finish,
                      label: 'common.skip'.tr,
                      child: Glass(
                        width: 84,
                        height: 40,
                        radius: 20,
                        onPigment: true,
                        child: Center(
                          child: Text('common.skip'.tr, style: AppText.chip(color: context.app.onDeep, height: 1)),
                        ),
                      ),
                    ),
                  ),
                ],
              );
            }),
          ),
          Positioned(
            left: 24,
            right: 24,
            bottom: 40 + inset.bottom,
            child: Row(
              children: [
                AnimatedBuilder(
                  animation: pager,
                  builder: (context, _) => _Dots(
                    position: _position(pager, controller.page.value),
                    onTap: (i) => unawaited(controller.goTo(i)),
                  ),
                ),
                const Spacer(),
                Obx(() {
                  final last = controller.page.value == 2;
                  return AnimatedContainer(
                    duration: AppMotion.t3,
                    curve: kEase,
                    width: last ? 188 : 140,
                    child: Btn(
                      last ? 'common.get_started' : 'common.next',
                      key: ValueKey(last),
                      kind: last ? BtnKind.primary : BtnKind.ink,
                      trailing: last ? PhosphorIconsBold.arrowRight : PhosphorIconsBold.caretRight,
                      expand: true,
                      onPressed: controller.next,
                    ),
                  );
                }),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

/// Skip and back arrive and leave with the page, never locked out mid-motion.
class _TopChip extends StatelessWidget {
  const _TopChip({required this.visible, required this.child});

  final bool visible;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    return ExcludeSemantics(
      excluding: !visible,
      child: IgnorePointer(
        ignoring: !visible,
        child: AnimatedOpacity(
          duration: AppMotion.t2,
          opacity: visible ? 1 : 0,
          child: AnimatedScale(
            duration: AppMotion.t2,
            curve: kEase,
            scale: visible || context.reduceMotion ? 1 : .92,
            child: child,
          ),
        ),
      ),
    );
  }
}

/// One onboarding page. Art and copy play in the first time the page is
/// settled on; later visits stay drawn so a tab change never flashes empty.
class _Page extends StatefulWidget {
  const _Page({required this.index, required this.pager});

  final int index;
  final PageController pager;

  static const _copy = [
    ('onboarding.one_kicker', 'onboarding.one_title', 'onboarding.one_body'),
    ('onboarding.two_kicker', 'onboarding.two_title', 'onboarding.two_body'),
    ('onboarding.three_kicker', 'onboarding.three_title', 'onboarding.three_body'),
  ];

  @override
  State<_Page> createState() => _PageState();
}

class _PageState extends State<_Page> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(vsync: this, duration: AppMotion.loop);
  var _wasActive = false;
  var _played = false;

  @override
  void initState() {
    super.initState();
    widget.pager.addListener(_onPager);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted) _onPager();
    });
  }

  @override
  void dispose() {
    widget.pager.removeListener(_onPager);
    _c.dispose();
    super.dispose();
  }

  bool get _active {
    final at = _position(widget.pager, widget.index);
    return (at - widget.index).abs() < .5;
  }

  void _onPager() {
    if (!mounted) return;
    final active = _active;
    if (active && !_wasActive) _enter();
    _wasActive = active;
  }

  void _enter() {
    if (!mounted) return;
    if (context.reduceMotion) {
      _c.value = 1;
      _played = true;
      return;
    }
    // First visit: play the story. Later visits stay fully drawn — resetting
    // to 0 here made the previous page flash for a frame on every tab change.
    if (_played) {
      _c.value = 1;
      return;
    }
    _played = true;
    unawaited(_c.forward(from: 0));
  }

  @override
  Widget build(BuildContext context) {
    final still = context.reduceMotion;
    final inset = MediaQuery.paddingOf(context);
    final copy = _Page._copy[widget.index];
    final c = context.app;
    return ColoredBox(
      // Opaque fill so the previous page never shows through mid-swipe.
      color: c.chalk,
      child: LayoutBuilder(
        builder: (context, box) {
          final artH = (box.maxHeight * .557).clamp(280.0, 520.0);
          final compact = box.maxHeight < 720;
          return AnimatedBuilder(
            animation: Listenable.merge([_c, widget.pager]),
            builder: (context, _) {
              final t = still ? 1.0 : _c.value;
              final drift = still ? 0.0 : (_position(widget.pager, widget.index) - widget.index).clamp(-1.0, 1.0);
              final near = (1 - drift.abs()).clamp(0.0, 1.0);
              Widget rise(double from, double to, Widget child) {
                final v = _phase(t, from, to);
                return Opacity(
                  opacity: v * near,
                  child: Transform.translate(
                    offset: Offset(0, 16 * (1 - v)),
                    child: child,
                  ),
                );
              }

              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // As every Hue page: the art on the school's deep colour, the words on the sheet rising over it.
                  Container(
                    height: artH,
                    width: double.infinity,
                    color: c.deep,
                    padding: EdgeInsets.fromLTRB(24, inset.top + 64, 24, 48),
                    // Clip parallax/scale so art cannot paint into the next page.
                    child: ClipRect(
                      child: Opacity(
                        opacity: still ? 1 : (.35 + .65 * near),
                        child: Transform.scale(
                          scale: still ? 1 : .97 + .03 * near,
                          // On a short phone the art scales down instead of overflowing.
                          child: LayoutBuilder(
                            builder: (context, box) => FittedBox(
                              fit: BoxFit.scaleDown,
                              alignment: Alignment.bottomCenter,
                              child: SizedBox(
                                width: box.maxWidth,
                                child: switch (widget.index) {
                                  0 => _DayArt(t: t),
                                  1 => _ParentArt(t: t),
                                  _ => _TeacherArt(t: t),
                                },
                              ),
                            ),
                          ),
                        ),
                      ),
                    ),
                  ),
                  Expanded(
                    child: Container(
                      transform: Matrix4.translationValues(0, -28, 0),
                      decoration: BoxDecoration(
                        color: c.chalk,
                        borderRadius: const BorderRadius.vertical(top: Radius.circular(AppRadius.sheet)),
                      ),
                      child: SingleChildScrollView(
                      padding: EdgeInsets.fromLTRB(24, compact ? 24 : 32, 24, 112 + inset.bottom),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          rise(
                            .22,
                            .52,
                            Overline('${copy.$1.tr} · ${'onboarding.page_of'.trp({'n': '${widget.index + 1}'})}'),
                          ),
                          const SizedBox(height: 12),
                          rise(.32, .64, Text(copy.$2.tr, style: context.type.h1)),
                          const SizedBox(height: 12),
                          rise(.42, .78, Text(copy.$3.tr, style: context.type.b.copyWith(color: context.app.ink2))),
                        ],
                      ),
                    ),
                    ),
                  ),
                ],
              );
            },
          );
        },
      ),
    );
  }
}

/// Page dots that stretch with the swipe itself. Tapping one jumps to it.
class _Dots extends StatelessWidget {
  const _Dots({required this.position, required this.onTap});

  final double position;
  final ValueChanged<int> onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    return Semantics(
      label: 'onboarding.page_of'.trp({'n': '${position.round() + 1}'}),
      child: Row(
        children: [
          for (var i = 0; i < 3; i++)
            Pressable(
              onTap: () => onTap(i),
              child: SizedBox(
                height: 44,
                child: Padding(
                  padding: const EdgeInsets.only(right: 6),
                  child: Center(
                    child: Builder(
                      builder: (context) {
                        final near = (1 - (position - i).abs()).clamp(0.0, 1.0);
                        return Container(
                          width: 6 + 18 * near,
                          height: 6,
                          decoration: BoxDecoration(
                            color: Color.lerp(c.line2, c.ink, near),
                            borderRadius: BorderRadius.circular(2),
                          ),
                        );
                      },
                    ),
                  ),
                ),
              ),),
        ],
      ),
    );
  }
}

/// A card of the art: deep2 on the deep colour, or the bright colour for the one that matters now. It rises in at [v].
class _ArtRow extends StatelessWidget {
  const _ArtRow({required this.v, required this.child, this.on = false});

  final double v;
  final Widget child;
  final bool on;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    return Opacity(
      opacity: v.clamp(0.0, 1.0),
      child: Transform.translate(
        offset: Offset(0, 18 * (1 - v)),
        child: AnimatedContainer(
          duration: AppMotion.t3,
          curve: kEase,
          height: 64,
          padding: const EdgeInsets.symmetric(horizontal: 12),
          decoration: BoxDecoration(color: on ? c.bright : c.deep2, borderRadius: BorderRadius.circular(AppRadius.panel)),
          child: child,
        ),
      ),
    );
  }
}

/// A row's title and line, in the bright card's ink when it is the one on now.
Widget _lines(BuildContext context, String title, String line, {bool on = false}) {
  final c = context.app;
  return Expanded(
    child: Column(
      mainAxisAlignment: MainAxisAlignment.center,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, maxLines: 1, overflow: TextOverflow.ellipsis, style: context.type.t.copyWith(color: on ? c.onBright : c.onDeep)),
        Text(line, maxLines: 1, overflow: TextOverflow.ellipsis, style: context.type.s.copyWith(color: on ? c.onBright : c.onDeep2)),
      ],
    ),
  );
}

/// Today's periods as the ParentHome board's cards, one after another; the one on now turns bright.
class _DayArt extends StatelessWidget {
  const _DayArt({required this.t});

  final double t;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    const rows = [
      ('social', 'Social studies', '8:45 · Room B-204'),
      ('computer', 'Computer', '9:40 · Lab 2'),
      ('art', 'Art', '10:25 · Studio'),
      ('maths', 'Maths', '11:25 · Room B-204'),
    ];
    final now = _phase(t, .6, .85) > .5;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final (i, r) in rows.indexed) ...[
          if (i > 0) const SizedBox(height: 8),
          _ArtRow(
            v: _phase(t, i * .08, i * .08 + .4, kSpring),
            on: now && i == 1,
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(color: c.subjectFor(r.$1).soft, borderRadius: BorderRadius.circular(AppRadius.md)),
                  child: Icon(AppIcons.homework, size: 20, color: c.subjectFor(r.$1).ink),
                ),
                const SizedBox(width: 12),
                _lines(context, r.$2, r.$3, on: now && i == 1),
                if (now && i == 1) Stamp('onboarding.now'.tr, color: c.onBright),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

/// Each child as a row: arrival and what is due; the switch at the top moves between them.
class _ParentArt extends StatelessWidget {
  const _ParentArt({required this.t});

  final double t;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final kids = [
      ('AS', 'blue', 'onboarding.kid_a_over'.tr, 'onboarding.kid_a_big'.tr, 'onboarding.kid_a_line'.tr),
      ('AN', 'pink', 'onboarding.kid_b_over'.tr, 'onboarding.kid_b_big'.tr, 'onboarding.kid_b_line'.tr),
    ];
    final second = _phase(t, .62, .86) > .5;
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final (i, k) in kids.indexed) ...[
          if (i > 0) const SizedBox(height: 8),
          _ArtRow(
            v: _phase(t, i * .12, i * .12 + .45, kSpring),
            on: second ? i == 1 : i == 0,
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(color: c.spectrumFor(k.$2).soft, shape: BoxShape.circle),
                  child: Text(k.$1, style: context.type.capB.copyWith(color: c.spectrumFor(k.$2).ink)),
                ),
                const SizedBox(width: 12),
                _lines(context, '${k.$3} · ${k.$4}', k.$5, on: second ? i == 1 : i == 0),
              ],
            ),
          ),
        ],
        const SizedBox(height: 8),
        _ArtRow(
          v: _phase(t, .3, .7, kSpring),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(color: c.lateSoft, borderRadius: BorderRadius.circular(AppRadius.md)),
                child: Icon(AppIcons.fees, size: 20, color: c.lateText),
              ),
              const SizedBox(width: 12),
              _lines(context, 'onboarding.fee_title'.tr, 'onboarding.fee_line'.tr),
            ],
          ),
        ),
      ],
    );
  }
}

/// The RollCall board: names with their marks, two turning absent and one late, then the count.
class _TeacherArt extends StatelessWidget {
  const _TeacherArt({required this.t});

  final double t;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final mark = _phase(t, .55, .8) > .5;
    const kids = [('Ishaan Gupta', 'IG', 'teal'), ('Kiara Patel', 'KP', 'amber'), ('Leo Fernandes', 'LF', 'violet'), ('Zoya Shaikh', 'ZS', 'blue')];
    final marks = [AttendanceStatus.absent, AttendanceStatus.present, AttendanceStatus.lateArrival, AttendanceStatus.present];
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Opacity(
          opacity: _phase(t, .75, 1),
          child: Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(
              '${'onboarding.tally_present'.tr} · ${'onboarding.tally_absent'.tr} · ${'onboarding.tally_late'.tr}',
              style: context.type.t.copyWith(color: c.bright),
            ),
          ),
        ),
        for (final (i, k) in kids.indexed) ...[
          if (i > 0) const SizedBox(height: 8),
          _ArtRow(
            v: _phase(t, i * .08, i * .08 + .4, kSpring),
            child: Row(
              children: [
                Container(
                  width: 40,
                  height: 40,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(color: c.spectrumFor(k.$3).soft, shape: BoxShape.circle),
                  child: Text(k.$2, style: context.type.capB.copyWith(color: c.spectrumFor(k.$3).ink)),
                ),
                const SizedBox(width: 12),
                _lines(context, k.$1, 'teacher.roll'.trp({'n': '${4 + i * 3}'})),
                _Pill(mark: mark ? marks[i] : AttendanceStatus.present),
              ],
            ),
          ),
        ],
      ],
    );
  }
}

/// The RollCall board's status pill.
class _Pill extends StatelessWidget {
  const _Pill({required this.mark});

  final AttendanceStatus mark;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final (label, soft, ink, icon) = switch (mark) {
      AttendanceStatus.absent => ('teacher.absent_t', c.badSoft, c.badText, AppIcons.absent),
      AttendanceStatus.lateArrival => ('teacher.late_t', c.lateSoft, c.lateText, AppIcons.late),
      _ => ('teacher.present_t', c.okSoft, c.okText, AppIcons.present),
    };
    return AnimatedContainer(
      duration: AppMotion.t2,
      curve: kEase,
      height: 36,
      padding: const EdgeInsets.symmetric(horizontal: 10),
      decoration: BoxDecoration(color: soft, borderRadius: BorderRadius.circular(AppRadius.sm)),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [Icon(icon, size: 16, color: ink), const SizedBox(width: 6), Text(label.tr, style: context.type.ts.copyWith(color: ink))],
      ),
    );
  }
}
