import 'package:flutter/animation.dart';

/// Things arriving: cubic-bezier(.2,.8,.2,1).
const kEase = Cubic(.2, .8, .2, 1);

/// Things leaving: cubic-bezier(.4,0,1,1), the web's --ei.
const kEaseIn = Cubic(.4, 0, 1, 1);

/// Under the finger only (dock pill, segmented knob, switch, slider, press release): a gentle ~6% overshoot.
const kSpring = Cubic(.3, 1.45, .45, 1);

/// Endless loops that breathe (pulse, scan line).
const kLoop = Curves.easeInOut;

/// Every timing in the app. Leaving uses the step below arriving; nothing a person waits on takes longer than [t4].
abstract final class AppMotion {
  /// Finger down.
  static const press = Duration(milliseconds: 90);

  /// Colour changes, fades of small things.
  static const t1 = Duration(milliseconds: 120);

  /// Chips, stamps, crossfades, skeleton to content.
  static const t2 = Duration(milliseconds: 200);

  /// Screens, theme changes, sheets and toasts leaving.
  static const t3 = Duration(milliseconds: 300);

  /// Sheets and toasts arriving, the Rise entrance.
  static const t4 = Duration(milliseconds: 420);

  /// Between neighbours arriving together (the first few only).
  static const stagger = Duration(milliseconds: 35);

  /// With [kSpring]: what the finger moves settles in this.
  static const spring = Duration(milliseconds: 280);

  /// A one-off moment the person caused (the paid stamp on a receipt).
  static const celebrate = Duration(milliseconds: 900);

  /// Fast loops (a spinner turning once).
  static const loopFast = Duration(milliseconds: 1000);

  /// Breathing loops (live dot, skeleton shimmer, scan line).
  static const loop = Duration(milliseconds: 1600);

  /// One step of the opening sequence (splash, first welcome).
  static const introStep = Duration(milliseconds: 1800);

  /// The whole opening sequence.
  static const intro = Duration(milliseconds: 2400);

  /// How long a toast stays; one with an action stays longer.
  static const toastHold = Duration(milliseconds: 3200);
  static const toastAction = Duration(milliseconds: 5000);
}

abstract final class AppBreakpoints {
  static const tablet = 840.0;
}

/// Corner radii. A pill is [pill]; nothing else is rounder than [sheet].
abstract final class AppRadius {
  static const hair = 2.0;
  static const xs = 6.0;
  static const sm = 10.0;
  static const md = 14.0;
  static const field = 18.0;
  static const card = 24.0;
  static const sheet = 34.0;
  static const pill = 999.0;
}
