import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:gradeon/core/utils/extensions.dart';
import 'package:gradeon/core/widgets/ui.dart';

/// The board's action bar (design/hue/src/RollCall.html): the school's deep colour along the bottom edge, a line of
/// text and one action in its bright colour. Teacher tools put it on their PageFrame with `edgeBar: true`.
class TeacherActionBar extends StatelessWidget {
  const TeacherActionBar({
    required this.text,
    required this.action,
    this.sub,
    this.kind = BtnKind.bright,
    this.onPressed,
    this.loading = false,
    this.icon,
  });

  final Widget text;
  final String? sub;
  final String action;
  final BtnKind kind;
  final VoidCallback? onPressed;
  final bool loading;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    return Theme(
      data: Theme.of(context).copyWith(extensions: [c.onDeepSide]),
      child: Builder(
        builder: (context) => Container(
          color: c.deep,
          padding: EdgeInsets.fromLTRB(20, 12, 20, 12 + MediaQuery.paddingOf(context).bottom),
          child: Row(
            children: [
              Expanded(
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    DefaultTextStyle.merge(style: context.type.t, maxLines: 1, overflow: TextOverflow.ellipsis, child: text),
                    if (sub != null) Text(sub!, maxLines: 1, overflow: TextOverflow.ellipsis, style: context.type.s),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Btn(action, kind: kind == BtnKind.danger ? kind : BtnKind.bright, loading: loading, onPressed: onPressed, trailing: icon),
            ],
          ),
        ),
      ),
    );
  }
}

// ───────────────────────────── Mark attendance ─────────────────────────────
