import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/physics.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/theme/app_colors.dart';
import 'package:gradeon/core/theme/app_typography.dart';
import 'package:gradeon/core/utils/extensions.dart';
import 'package:gradeon/core/utils/haptics.dart';

/// A short spring with a little settle, the same family as a flicked sheet.
const _lensSpring = SpringDescription(mass: 1, stiffness: 340, damping: 32);

/// Height of the tab bar above the system inset (Gradeon Hue: 84 with the inset on a phone).
const kTabBarHeight = 68.0;

class DockItem {
  const DockItem({required this.icon, required this.activeIcon, required this.label, this.badge = 0});

  final IconData icon;
  final IconData activeIcon;
  final String label;
  final int badge;
}

/// The tab bar: the school's deep colour along the bottom; the open tab is a bright block that glides to it.
class GlassDock extends StatefulWidget {
  const GlassDock({required this.items, required this.index, required this.onChanged, super.key});

  final List<DockItem> items;
  final int index;
  final ValueChanged<int> onChanged;

  @override
  State<GlassDock> createState() => _GlassDockState();
}

class _GlassDockState extends State<GlassDock> with SingleTickerProviderStateMixin {
  late final AnimationController _x = AnimationController.unbounded(
    vsync: this,
    value: widget.index.toDouble(),
  );

  @override
  void didUpdateWidget(GlassDock old) {
    super.didUpdateWidget(old);
    if (old.index != widget.index) _glide(widget.index);
  }

  @override
  void dispose() {
    _x.dispose();
    super.dispose();
  }

  void _glide(int index) {
    final target = index.toDouble();
    if (context.reduceMotion) {
      _x.value = target;
      return;
    }
    unawaited(_x.animateWith(SpringSimulation(_lensSpring, _x.value, target, _x.velocity)));
  }

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final bottom = MediaQuery.paddingOf(context).bottom;
    // Gradeon Hue's tab bar (design/hue/src/ParentHome.html): the school's deep colour, the open tab a bright block.
    return AnimatedBuilder(
      animation: _x,
      builder: (context, _) {
        return Container(
          height: kTabBarHeight + bottom,
          padding: EdgeInsets.fromLTRB(10, 8, 10, 8 + bottom),
          decoration: BoxDecoration(color: c.deep, boxShadow: [BoxShadow(color: c.shadow, blurRadius: 24, offset: const Offset(0, -4))]),
          child: LayoutBuilder(
            builder: (context, box) {
              final slot = box.maxWidth / widget.items.length;
              final left = _x.value * slot + 2;
              return Stack(
                children: [
                  Positioned(
                    left: left,
                    top: 0,
                    bottom: 0,
                    width: slot - 4,
                    child: IgnorePointer(
                      child: DecoratedBox(decoration: BoxDecoration(color: c.bright, borderRadius: BorderRadius.circular(20))),
                    ),
                  ),
                  Row(
                    children: [
                      for (var i = 0; i < widget.items.length; i++)
                        Expanded(
                          child: _DockButton(
                            item: widget.items[i],
                            on: i == widget.index,
                            onTap: () {
                              if (i == widget.index) return;
                              Haptics.selection();
                              widget.onChanged(i);
                            },
                          ),
                        ),
                    ],
                  ),
                ],
              );
            },
          ),
        );
      },
    );
  }
}

class _DockButton extends StatelessWidget {
  const _DockButton({required this.item, required this.on, required this.onTap});

  final DockItem item;
  final bool on;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final color = on ? c.onBright : c.onDeep2;
    return Semantics(
      button: true,
      selected: on,
      label: item.label.tr,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: onTap,
        child: SizedBox(
          height: kTabBarHeight - 16,
          child: Stack(
            clipBehavior: Clip.none,
            alignment: Alignment.center,
            children: [
              Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Icon(on ? item.activeIcon : item.icon, size: 24, color: color),
                  const SizedBox(height: 4),
                  Text(
                    item.label.tr,
                    maxLines: 1,
                    overflow: TextOverflow.fade,
                    softWrap: false,
                    style: hueText(12, 600, height: 1.15, color: color),
                  ),
                ],
              ),
              if (item.badge > 0)
                // Pinned to the icon's top-right; sized by its digits, never by the tab.
                Align(
                  alignment: Alignment.topCenter,
                  child: Padding(
                    padding: const EdgeInsets.only(top: 10, left: 32),
                    child: _Badge(count: item.badge),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}

/// The tab bar on its side, from 840px wide (tablet): deep, the open tab a bright block.
class GlassRail extends StatefulWidget {
  const GlassRail({required this.items, required this.index, required this.onChanged, super.key});

  final List<DockItem> items;
  final int index;
  final ValueChanged<int> onChanged;

  @override
  State<GlassRail> createState() => _GlassRailState();
}

class _GlassRailState extends State<GlassRail> with SingleTickerProviderStateMixin {
  late final AnimationController _y = AnimationController.unbounded(
    vsync: this,
    value: widget.index.toDouble(),
  );

  @override
  void didUpdateWidget(GlassRail old) {
    super.didUpdateWidget(old);
    if (old.index != widget.index) _glide(widget.index);
  }

  @override
  void dispose() {
    _y.dispose();
    super.dispose();
  }

  void _glide(int index) {
    final target = index.toDouble();
    if (context.reduceMotion) {
      _y.value = target;
      return;
    }
    unawaited(_y.animateWith(SpringSimulation(_lensSpring, _y.value, target, _y.velocity)));
  }

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    const slot = 76.0;
    final height = slot * widget.items.length + 20;
    return AnimatedBuilder(
      animation: _y,
      builder: (context, _) {
        const pill = 60.0;
        final top = 10 + _y.value * slot + (slot - pill) / 2;
        return SizedBox(
          width: 76,
          height: height,
          child: Container(
            width: 76,
            height: height,
            decoration: BoxDecoration(color: c.deep, borderRadius: BorderRadius.circular(24)),
            child: Stack(
              children: [
                Positioned(
                  left: (76 - pill) / 2,
                  top: top,
                  width: pill,
                  height: pill,
                  child: IgnorePointer(
                    child: DecoratedBox(
                      decoration: BoxDecoration(color: c.bright, borderRadius: BorderRadius.circular(20)),
                    ),
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 10),
                  child: Column(
                    children: [
                      for (var i = 0; i < widget.items.length; i++)
                        Semantics(
                          button: true,
                          selected: i == widget.index,
                          label: widget.items[i].label.tr,
                          child: GestureDetector(
                            behavior: HitTestBehavior.opaque,
                            onTap: () {
                              if (i == widget.index) return;
                              Haptics.selection();
                              widget.onChanged(i);
                            },
                            child: SizedBox(
                              width: 76,
                              height: slot,
                              child: Icon(
                                i == widget.index ? widget.items[i].activeIcon : widget.items[i].icon,
                                size: 24,
                                color: i == widget.index ? c.onBright : c.onDeep2,
                              ),
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}

/// Round count pill: a circle for one digit, a short pill beyond that.
class _Badge extends StatelessWidget {
  const _Badge({required this.count});

  final int count;

  @override
  Widget build(BuildContext context) {
    final text = count > 99 ? '99+' : '$count';
    return DecoratedBox(
      decoration: BoxDecoration(
        color: AppColors.bad,
        borderRadius: BorderRadius.circular(7),
        border: Border.all(color: context.app.paper, width: 1.5),
      ),
      child: SizedBox(
        height: 16,
        width: text.length == 1 ? 16 : null,
        child: Center(
          widthFactor: text.length == 1 ? null : 1,
          child: Padding(
            padding: EdgeInsets.symmetric(horizontal: text.length == 1 ? 0 : 4),
            child: Text(text, style: AppText.tiny(color: AppColors.white, tabular: true)),
          ),
        ),
      ),
    );
  }
}
