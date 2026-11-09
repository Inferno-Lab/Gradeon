// The Chalk & Glass rules, checked over the app's screens and shared widgets so they cannot drift back. Each failure names
// the token to use instead. The theme itself (lib/core/theme) defines the tokens and is not checked.
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';

const _space = [0, 1, 2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 56];
const _radii = [2, 6, 10, 14, 18, 24, 34, 999];

/// Screens, sheets and shared widgets: where things are drawn. Controllers, data and the theme are not.
final _ui = Directory('lib')
    .listSync(recursive: true)
    .whereType<File>()
    .map((f) => f.path.replaceAll(r'\', '/'))
    .where((p) => p.endsWith('.dart') && !p.startsWith('lib/core/theme/'))
    .where((p) => !RegExp('/(controllers|datasources|repositories|models|translations)/').hasMatch(p))
    .toList();

/// The illustrations are drawings with their own colours and geometry.
bool _art(String p) => p.endsWith('empty_art.dart');

List<String> _hits(Iterable<String> files, RegExp re, [bool Function(RegExpMatch m)? bad]) => [
  for (final f in files)
    for (final (i, line) in File(f).readAsLinesSync().indexed)
      if (!line.trimLeft().startsWith('//'))
        for (final m in re.allMatches(line))
          if (bad?.call(m) ?? true) '$f:${i + 1}  ${line.trim()}',
];

/// The text of a call's arguments, from the "(" at [open] to its matching ")".
String _call(String s, int open) {
  var depth = 0;
  for (var i = open; i < s.length; i++) {
    if (s[i] == '(') depth++;
    if (s[i] == ')' && --depth == 0) return s.substring(open, i + 1);
  }
  return s.substring(open);
}

bool _off(String numbers, List<int> scale, {int max = 1 << 30}) => RegExp(r'-?\d+(\.\d+)?').allMatches(numbers).any((m) {
  final v = double.parse(m[0]!).abs();
  return v <= max && !scale.contains(v);
});

void main() {
  final features = _ui.where((p) => p.startsWith('lib/features/'));
  final drawn = _ui.where((p) => !_art(p));

  test('every colour comes from the palette', () {
    expect(_hits(drawn, RegExp(r'\bColor\(0x(?!00000000)|(?<![A-Za-z])Colors\.(?!transparent)\w+')), isEmpty,
        reason: 'use context.app (paper, ink, mariSoft…) or AppColors (mari, ok, subject(id)); the console can change each');
  });

  test('text is set from the type roles', () {
    expect(_hits(features, RegExp(r'\banek\(')), isEmpty, reason: 'use context.type.<role> or AppText.<role>');
    expect(_hits(drawn, RegExp(r'fontSize:\s*\d|fontWeight:|FontVariation\(')), isEmpty,
        reason: 'pick another role instead of changing its size or weight');
  });

  test('motion is timed with AppMotion and the curve tokens', () {
    expect(_hits(_ui, RegExp(r'Duration\(milliseconds:|AppDurations\.')), isEmpty, reason: 'use AppMotion.press, t1–t4, spring, loop…');
    expect(_hits(_ui, RegExp(r'Curves\.(?!linear\b)\w+')), isEmpty, reason: 'use kEase (arriving), kEaseIn (leaving), kSpring (under the finger), kLoop');
  });

  test('corners and spacing come from the scales', () {
    expect(_hits(drawn, RegExp(r'(?:BorderRadius|Radius)\.circular\((\d+(?:\.\d+)?)\)'), (m) => _off(m[1]!, _radii)), isEmpty,
        reason: 'radii are $_radii (AppRadius)');
    expect(_hits(drawn, RegExp(r'EdgeInsets(?:Directional)?\.\w+\(([^()]*)\)'), (m) => _off(m[1]!, _space, max: 56)), isEmpty,
        reason: 'spacing up to 56 is $_space');
    expect(_hits(drawn, RegExp(r'SizedBox\((?:width|height):\s*(\d+(?:\.\d+)?)\)|\b(?:spacing|runSpacing):\s*(\d+(?:\.\d+)?)'),
        (m) => _off(m[1] ?? m[2]!, _space, max: 56)), isEmpty, reason: 'gaps up to 56 are $_space');
  });

  test('screens take taps through Pressable', () {
    // Swipes and long presses keep their GestureDetector; a tap does not.
    final taps = <String>[
      for (final f in features)
        for (final m in RegExp(r'\b(GestureDetector|InkWell)\(').allMatches(File(f).readAsStringSync()))
          // Only its own arguments count: the ones before `child:` (a tap inside the child belongs to the child).
          if (_call(File(f).readAsStringSync(), m.end - 1).split(RegExp(r'\bchild:')).first.contains(RegExp(r'\bonTap:')))
            '$f: ${m[1]}',
    ];
    expect(taps, isEmpty, reason: 'Pressable gives every tap the same press feedback and a semantics label');
  });
}
