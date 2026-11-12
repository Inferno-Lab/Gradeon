import 'package:flutter/material.dart';
import 'package:gradeon/core/theme/app_colors.dart';
import 'package:gradeon/core/theme/app_typography.dart';
import 'package:gradeon/core/theme/tokens.dart';
import 'package:gradeon/core/utils/extensions.dart';
import 'package:gradeon/core/widgets/app_icons.dart';
import 'package:gradeon/core/widgets/ui/labels.dart';

/// A subject's mark: in a row, the Hue tile (spectrum soft fill, icon); large, the notebook cover (shelves, heroes).
class Cover extends StatelessWidget {
  const Cover({
    required this.subject,
    this.label,
    this.large = false,
    this.width,
    this.height,
    super.key,
  });

  final String subject;
  final String? label;
  final bool large;
  final double? width;
  final double? height;

  @override
  Widget build(BuildContext context) {
    final pigment = AppColors.subject(subject);
    final tile = context.app.subjectFor(subject);
    // In a list row a subject is Gradeon Hue's tile: its spectrum soft fill with the homework icon in its ink.
    if (!large && width == null && height == null) {
      return Container(
        width: 40,
        height: 40,
        alignment: Alignment.center,
        decoration: BoxDecoration(color: tile.soft, borderRadius: BorderRadius.circular(AppRadius.md)),
        child: Icon(AppIcons.homework, size: 20, color: tile.ink),
      );
    }
    final w = width ?? (large ? 64.0 : 42.0);
    final h = height ?? (large ? 82.0 : 52.0);
    final r = large ? 14.0 : 11.0;
    return Container(
      width: w,
      height: h,
      padding: EdgeInsets.only(left: large ? 12 : 10, bottom: large ? 10 : 6),
      alignment: Alignment.bottomLeft,
      decoration: BoxDecoration(
        color: pigment.fill,
        borderRadius: BorderRadius.only(
          topLeft: Radius.circular(large ? 6 : 5),
          bottomLeft: Radius.circular(large ? 6 : 5),
          topRight: Radius.circular(r),
          bottomRight: Radius.circular(r),
        ),
      ),
      foregroundDecoration: const _SpineDecoration(),
      child: Text(
        label ?? subjectAbbr[subject] ?? subject.substring(0, 2).toUpperCase(),
        style: hueText(large ? 13 : 11, 760, width: 122, height: 1, em: .05, color: pigment.on),
        maxLines: 1,
      ),
    );
  }
}

/// The darker binding strip along the left edge of a cover.
class _SpineDecoration extends Decoration {
  const _SpineDecoration({this.width = 4});

  final double width;

  @override
  BoxPainter createBoxPainter([VoidCallback? onChanged]) => _SpinePainter(width);
}

class _SpinePainter extends BoxPainter {
  _SpinePainter(this.width);

  final double width;

  @override
  void paint(Canvas canvas, Offset offset, ImageConfiguration configuration) {
    final size = configuration.size!;
    final rect = offset & size;
    canvas
      ..save()
      ..clipRRect(
        RRect.fromRectAndCorners(rect, topLeft: const Radius.circular(7), bottomLeft: const Radius.circular(7)),
      )
      ..drawRect(Rect.fromLTWH(rect.left, rect.top, width, rect.height), Paint()..color = AppColors.amoled.chalk.withValues(alpha: 0.2))
      ..drawRect(Rect.fromLTWH(rect.right - 1, rect.top, 1, rect.height), Paint()..color = AppColors.white.withValues(alpha: 0.15))
      ..restore();
  }
}

/// Spine decoration usable on bigger custom covers (book shelf, hero bands).
const spineDecoration = _SpineDecoration(width: 6);

/// The SignIn board's cell art: rows of the deep colour's tints with a few cells in the bright colour. [reveal] (0 to 1)
/// brings the cells in one after another.
class CellArt extends StatelessWidget {
  const CellArt({this.rows = 3, this.reveal = 1, this.width, super.key});

  final int rows;
  final double reveal;

  /// A fixed width, for parents that measure intrinsic sizes (a LayoutBuilder cannot answer them).
  final double? width;

  static const _bright = {3, 15, 16, 27, 30};
  static const _mid = {1, 4, 8, 12, 14, 19, 22, 26, 28};

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    const cols = 11;
    final n = rows * cols;
    Widget grid(double width) {
        final size = (width - 6 * (cols - 1)) / cols;
        return Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            for (var r = 0; r < rows; r++) ...[
              if (r > 0) const SizedBox(height: 6),
              Row(
                children: [
                  for (var i = 0; i < cols; i++) ...[
                    if (i > 0) const SizedBox(width: 6),
                    Opacity(
                      opacity: ((reveal * (n + 8) - (r * cols + i)) / 8).clamp(0.0, 1.0),
                      child: Container(
                        width: size,
                        height: size,
                        decoration: BoxDecoration(
                          color: _bright.contains(r * cols + i)
                              ? c.bright
                              : _mid.contains(r * cols + i)
                              ? c.deep3
                              : c.deep2,
                          borderRadius: BorderRadius.circular(AppRadius.sm),
                        ),
                      ),
                    ),
                  ],
                ],
              ),
            ],
          ],
        );
    }

    return width != null ? grid(width!) : LayoutBuilder(builder: (context, box) => grid(box.maxWidth));
  }
}
