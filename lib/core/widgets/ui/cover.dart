import 'package:flutter/material.dart';
import 'package:gradeon/core/theme/app_colors.dart';
import 'package:gradeon/core/theme/app_typography.dart';
import 'package:gradeon/core/widgets/ui/labels.dart';

/// Notebook cover: bound on the left, subject pigment, short label at the bottom.
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
        RRect.fromRectAndCorners(rect, topLeft: const Radius.circular(6), bottomLeft: const Radius.circular(6)),
      )
      ..drawRect(Rect.fromLTWH(rect.left, rect.top, width, rect.height), Paint()..color = AppColors.amoled.chalk.withValues(alpha: 0.2))
      ..drawRect(Rect.fromLTWH(rect.right - 1, rect.top, 1, rect.height), Paint()..color = AppColors.white.withValues(alpha: 0.15))
      ..restore();
  }
}

/// Spine decoration usable on bigger custom covers (book shelf, hero bands).
const spineDecoration = _SpineDecoration(width: 6);
