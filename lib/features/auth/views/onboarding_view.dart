import 'dart:async';
import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/theme/app_colors.dart';
import 'package:gradeon/core/theme/app_typography.dart';
import 'package:gradeon/core/theme/tokens.dart';
import 'package:gradeon/core/utils/extensions.dart';
import 'package:gradeon/core/utils/haptics.dart';
import 'package:gradeon/core/widgets/glass.dart';
import 'package:gradeon/core/widgets/ui.dart';
import 'package:gradeon/features/auth/controllers/splash_controller.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

/// Progress of one step inside a page's entrance: 0 before [from], 1 after [to].
double _phase(double t, double from, double to, [Curve curve = kEase]) =>
    curve.transform(((t - from) / (to - from)).clamp(0.0, 1.0));

/// Where the pager is, in pages (1.4 = most of the way to page two).
double _position(PageController pager, int fallback) =>
    pager.hasClients && pager.position.haveDimensions ? pager.page ?? fallback.toDouble() : fallback.toDouble();

/// A wash of the page's pigment on chalk, so the three stories stay in the same room.
Color _wash(AppColors c, double p) {
  final student = AppColors.subject('maths').fill;
  final parent = AppColors.subject('hindi').fill;
  final teacher = AppColors.ok;
  final pigment = p < 1 ? Color.lerp(student, parent, p)! : Color.lerp(parent, teacher, (p - 1).clamp(0.0, 1.0))!;
  return Color.lerp(c.chalk, pigment, c.dark ? .18 : .11)!;
}

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
                        radius: 18,
                        child: Center(
                          child: Text('common.skip'.tr, style: AppText.chip(color: context.app.ink, height: 1)),
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
    final pageColor = _wash(context.app, widget.index.toDouble());
    return ColoredBox(
      // Opaque fill so the previous page never shows through mid-swipe.
      color: pageColor,
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
                  SizedBox(
                    height: artH,
                    width: double.infinity,
                    // Clip parallax/scale so art cannot paint into the next page.
                    child: ClipRect(
                      child: Opacity(
                        opacity: still ? 1 : (.35 + .65 * near),
                        child: Transform.scale(
                          scale: still ? 1 : .97 + .03 * near,
                          child: switch (widget.index) {
                            0 => _DayArt(t: t),
                            1 => _ParentArt(t: t),
                            _ => _TeacherArt(t: t),
                          },
                        ),
                      ),
                    ),
                  ),
                  Expanded(
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

/// Thursday's periods as columns that rise one after another. A "Now" chip
/// then settles on Computer, the period in progress.
class _DayArt extends StatelessWidget {
  const _DayArt({required this.t});

  final double t;

  @override
  Widget build(BuildContext context) {
    const cols = [
      ('hindi', 'HI', 250.0),
      ('social', 'SST', 330.0),
      ('', '', 170.0),
      ('computer', 'CS', 410.0),
      ('art', 'ART', 300.0),
      ('maths', 'MA', 360.0),
    ];
    return LayoutBuilder(
      builder: (context, box) {
        final scale = box.maxHeight / 470;
        final colW = (box.maxWidth - 16) / 6 - 4;
        final now = _phase(t, .58, .88, kSpring);
        return Stack(
          children: [
            for (var i = 0; i < cols.length; i++)
              Builder(
                builder: (context) {
                  final h = cols[i].$3 * scale;
                  final grow = _phase(t, i * .07, i * .07 + .52, kSpring);
                  final label = _phase(t, i * .07 + .32, i * .07 + .58);
                  return Positioned(
                    left: 8 + i * (colW + 4),
                    bottom: -h * (1 - grow),
                    width: colW,
                    height: h,
                    child: cols[i].$1.isEmpty
                        ? Hatch(
                            radius: const BorderRadius.vertical(top: Radius.circular(12)),
                            background: context.app.paper2,
                          )
                        : Container(
                            padding: const EdgeInsets.only(bottom: 12),
                            alignment: Alignment.bottomCenter,
                            decoration: BoxDecoration(
                              color: AppColors.subject(cols[i].$1).fill,
                              borderRadius: const BorderRadius.vertical(top: Radius.circular(12)),
                            ),
                            child: Opacity(
                              opacity: label,
                              child: Text(
                                cols[i].$2,
                                style: AppText.stamp(color: AppColors.subject(cols[i].$1).on),
                              ),
                            ),
                          ),
                  );
                },
              ),
            Positioned(
              left: 8 + 3 * (colW + 4),
              bottom: 410 * scale * _phase(t, 3 * .07, 3 * .07 + .52, kSpring) - 10,
              width: colW,
              child: Opacity(
                opacity: now.clamp(0.0, 1.0),
                child: Transform.translate(
                  offset: Offset(0, 12 * (1 - now)),
                  child: Center(
                    child: DecoratedBox(
                      decoration: BoxDecoration(
                        color: context.app.paper,
                        borderRadius: BorderRadius.circular(10),
                        boxShadow: [
                          BoxShadow(
                            color: context.app.ink.withValues(alpha: .16),
                            blurRadius: 10,
                            offset: const Offset(0, 4),
                          ),
                        ],
                      ),
                      child: Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                        child: Text(
                          'onboarding.now'.tr,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppText.tiny(color: context.app.ink),
                        ),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

/// Two children's day cards drop in; then the switch capsule lands and
/// smoothly hands focus from Aarav to Ananya — selection pill, labels, and
/// card emphasis all move together.
class _ParentArt extends StatefulWidget {
  const _ParentArt({required this.t});

  final double t;

  @override
  State<_ParentArt> createState() => _ParentArtState();
}

class _ParentArtState extends State<_ParentArt> with SingleTickerProviderStateMixin {
  /// 0 = Aarav, 1 = Ananya. One smooth ease — no bounce, no overshoot.
  late final AnimationController _switch = AnimationController(
    vsync: this,
    duration: AppMotion.celebrate,
  );
  late final Animation<double> _hand =
      CurvedAnimation(parent: _switch, curve: kEase);
  var _switched = false;

  @override
  void didUpdateWidget(_ParentArt old) {
    super.didUpdateWidget(old);
    if (widget.t < .2 && old.t >= .2) {
      _switched = false;
      _switch.value = 0;
    }
    if (!_switched && widget.t >= .72) {
      _switched = true;
      if (context.reduceMotion) {
        _switch.value = 1;
      } else {
        unawaited(_switch.forward());
      }
    }
  }

  @override
  void dispose() {
    _switch.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = widget.t;
    final a = _phase(t, 0, .5);
    final b = _phase(t, .15, .65);
    final pill = _phase(t, .48, .78);
    Widget drop(double v, double rise, Widget child) => Opacity(
      opacity: v.clamp(0.0, 1.0),
      child: Transform.translate(offset: Offset(0, rise * (1 - v)), child: child),
    );
    return AnimatedBuilder(
      animation: _hand,
      builder: (context, _) {
        final s = _hand.value;
        return LayoutBuilder(
          builder: (context, box) {
            final scale = box.maxHeight / 470;
            return Stack(
              children: [
                Positioned(
                  left: 34,
                  right: 34,
                  top: 96 * scale,
                  child: drop(
                    a,
                    -70,
                    _KidCard(
                      subject: 'maths',
                      over: 'onboarding.kid_a_over'.tr,
                      big: 'onboarding.kid_a_big'.tr,
                      line: 'onboarding.kid_a_line'.tr,
                      angle: -.07 * a,
                      focus: 1 - s * .5,
                    ),
                  ),
                ),
                Positioned(
                  left: 34,
                  right: 34,
                  top: 250 * scale,
                  child: drop(
                    b,
                    90,
                    _KidCard(
                      subject: 'hindi',
                      over: 'onboarding.kid_b_over'.tr,
                      big: 'onboarding.kid_b_big'.tr,
                      line: 'onboarding.kid_b_line'.tr,
                      angle: .052 * b,
                      focus: .5 + s * .5,
                    ),
                  ),
                ),
                Positioned(
                  left: (box.maxWidth - 236) / 2,
                  top: 226 * scale,
                  child: Opacity(
                    opacity: pill.clamp(0.0, 1.0),
                    child: Transform.translate(
                      offset: Offset(0, 10 * (1 - pill)),
                      child: _SwitchCapsule(progress: s),
                    ),
                  ),
                ),
              ],
            );
          },
        );
      },
    );
  }
}

class _KidCard extends StatelessWidget {
  const _KidCard({
    required this.subject,
    required this.over,
    required this.big,
    required this.line,
    required this.angle,
    required this.focus,
  });

  final String subject;
  final String over;
  final String big;
  final String line;
  final double angle;
  final double focus;

  @override
  Widget build(BuildContext context) {
    final f = focus.clamp(0.0, 1.0);
    return Opacity(
      opacity: .42 + .58 * f,
      child: Transform.scale(
        scale: .94 + .06 * f,
        child: Transform.rotate(
          angle: angle,
          child: Container(
            height: 176,
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: AppColors.subject(subject).fill,
              borderRadius: BorderRadius.circular(24),
              boxShadow: [
                BoxShadow(
                  color: AppColors.light.ink.withValues(alpha: 0.6).withValues(alpha: .4 + .35 * f),
                  blurRadius: 28 + 18 * f,
                  spreadRadius: -18,
                  offset: Offset(0, 14 + 10 * f),
                ),
              ],
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Overline(over, color: AppColors.white.withValues(alpha: 0.8)),
                const SizedBox(height: 10),
                Text(big, style: context.type.h2.copyWith(color: AppColors.white)),
                const SizedBox(height: 4),
                Text(line, style: context.type.s.copyWith(color: AppColors.white.withValues(alpha: 0.88))),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Parent switcher: a white disc (2px larger than the avatar) slides behind the
/// active child — one clean rim, no glow, no scale. The name slides with it.
class _SwitchCapsule extends StatelessWidget {
  const _SwitchCapsule({required this.progress});

  /// 0 = Aarav, 1 = Ananya.
  final double progress;

  @override
  Widget build(BuildContext context) {
    final p = progress.clamp(0.0, 1.0);
    const width = 236.0;
    const height = 52.0;
    const pad = 8.0;
    const avatar = 40.0;
    const thumb = 44.0;
    // Centres of the two avatars; the thumb stays locked to those centres.
    const left0 = pad + (avatar - thumb) / 2;
    const left1 = width - pad - avatar + (avatar - thumb) / 2;
    final thumbLeft = left0 + (left1 - left0) * p;
    return ClipRRect(
      borderRadius: BorderRadius.circular(height / 2),
      child: Glass(
        width: width,
        height: height,
        radius: height / 2,
        onPigment: true,
        shadow: false,
        child: Stack(
          children: [
            Positioned(
              left: thumbLeft,
              top: (height - thumb) / 2,
              width: thumb,
              height: thumb,
              child: const DecoratedBox(
                decoration: BoxDecoration(color: AppColors.white, shape: BoxShape.circle),
              ),
            ),
            Positioned(
              left: pad,
              top: (height - avatar) / 2,
              child: Opacity(
                opacity: .5 + .5 * (1 - p),
                child: Avatar(
                  'Aarav Sharma',
                  background: AppColors.light.paper,
                  foreground: AppColors.light.ink,
                ),
              ),
            ),
            Positioned(
              right: pad,
              top: (height - avatar) / 2,
              child: Opacity(
                opacity: .5 + .5 * p,
                child: Avatar(
                  'Ananya Sharma',
                  initials: 'AN',
                  background: AppColors.light.paper,
                  foreground: AppColors.subject('hindi').fill,
                ),
              ),
            ),
            Positioned(
              left: pad + avatar + 8,
              right: pad + avatar + 8,
              top: 0,
              bottom: 0,
              child: ClipRect(
                child: Stack(
                  alignment: Alignment.center,
                  children: [
                    Transform.translate(
                      offset: Offset(-14 * p, 0),
                      child: Opacity(
                        opacity: (1 - p * 1.35).clamp(0.0, 1.0),
                        child: Text(
                          'onboarding.kid_a_over'.tr,
                          textAlign: TextAlign.center,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppText.capB(color: AppColors.white, height: 1.1),
                        ),
                      ),
                    ),
                    Transform.translate(
                      offset: Offset(14 * (1 - p), 0),
                      child: Opacity(
                        opacity: ((p - .12) / .88).clamp(0.0, 1.0),
                        child: Text(
                          'onboarding.kid_b_over'.tr,
                          textAlign: TextAlign.center,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppText.capB(color: AppColors.white, height: 1.1),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

/// A class register: the children pop in, two are marked absent and one late,
/// then the tally slides up.
class _TeacherArt extends StatelessWidget {
  const _TeacherArt({required this.t});

  final double t;

  @override
  Widget build(BuildContext context) {
    final mark = _phase(t, .68, .88, kSpring);
    final tally = _phase(t, .8, 1);
    const names = [
      'AS',
      'DM',
      'KS',
      'MK',
      'VJ',
      'AR',
      'IG',
      'SK',
      'AN',
      'KP',
      'RM',
      'TS',
      'NB',
      'PD',
      'YC',
      'HV',
      'OB',
      'ZA',
      'LF',
      'EG',
    ];
    const absent = {6, 18};
    const late = {12};
    return LayoutBuilder(
      builder: (context, box) {
        final s = box.maxHeight / 470;
        final w = math.min<double>(box.maxWidth - 48, 342);
        return Stack(
          children: [
            Positioned(
              left: (box.maxWidth - w) / 2,
              top: 110 * s,
              width: w,
              child: Wrap(
                spacing: (w - 5 * 62) / 4,
                runSpacing: 12,
                children: [
                  for (var i = 0; i < names.length; i++)
                    Builder(
                      builder: (context) {
                        final pop = _phase(t, i * .02, i * .02 + .3, kSpring);
                        return Opacity(
                          opacity: pop.clamp(0.0, 1.0),
                          child: Transform.scale(
                            scale: pop,
                            child: _RegisterDot(
                              initials: names[i],
                              colorIndex: i % 4,
                              absent: absent.contains(i),
                              late: late.contains(i),
                              mark: mark,
                            ),
                          ),
                        );
                      },
                    ),
                ],
              ),
            ),
            Positioned(
              left: (box.maxWidth - w) / 2,
              top: 110 * s + 268 + 22 * (1 - tally),
              width: w,
              child: Opacity(
                opacity: tally,
                child: Glass(
                  height: 56,
                  radius: 999,
                  padding: const EdgeInsets.only(left: 20, right: 8),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text.rich(
                          TextSpan(
                            text: '${'onboarding.tally_present'.tr} · ',
                            children: [
                              TextSpan(
                                text: '${'onboarding.tally_absent'.tr} · ',
                                style: TextStyle(color: context.app.badText),
                              ),
                              TextSpan(
                                text: 'onboarding.tally_late'.tr,
                                style: TextStyle(color: AppColors.late),
                              ),
                            ],
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppText.ts(color: context.app.ink, height: 1),
                        ),
                      ),
                      Btn('common.submit', kind: BtnKind.ink, small: true, onPressed: () {}),
                    ],
                  ),
                ),
              ),
            ),
          ],
        );
      },
    );
  }
}

class _RegisterDot extends StatelessWidget {
  const _RegisterDot({
    required this.initials,
    required this.colorIndex,
    required this.absent,
    required this.late,
    required this.mark,
  });

  final String initials;
  final int colorIndex;
  final bool absent;
  final bool late;

  /// 0 before the teacher marks the register, 1 once the A and L badges are on.
  final double mark;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final house = AppColors.houses[colorIndex];
    final ink = colorIndex == 3 ? AppColors.mariInk : AppColors.white;
    final m = mark.clamp(0.0, 1.0);
    final bg = absent ? Color.lerp(house, c.paper, m)! : house;
    final fg = absent ? Color.lerp(ink, c.badText, m)! : ink;
    return SizedBox(
      width: 62,
      height: 62,
      child: Stack(
        clipBehavior: Clip.none,
        children: [
          Container(
            alignment: Alignment.center,
            decoration: BoxDecoration(
              color: bg,
              shape: BoxShape.circle,
              border: absent ? Border.all(color: AppColors.bad.withValues(alpha: m), width: 2.5) : null,
            ),
            child: Text(initials, style: AppText.t(color: fg, height: 1)),
          ),
          if (absent || late)
            Positioned(
              right: -2,
              top: -2,
              child: Transform.scale(
                scale: mark,
                child: Container(
                  width: 20,
                  height: 20,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(color: absent ? AppColors.bad : AppColors.late, shape: BoxShape.circle),
                  child: Text(absent ? 'A' : 'L', style: AppText.tiny(color: AppColors.white)),
                ),
              ),
            ),
        ],
      ),
    );
  }
}
