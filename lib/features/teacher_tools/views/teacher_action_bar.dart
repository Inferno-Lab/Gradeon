import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:gradeon/core/utils/extensions.dart';
import 'package:gradeon/core/widgets/glass.dart';
import 'package:gradeon/core/widgets/ui.dart';

/// Glass bar with a line of text and one action, used across teacher tools.
class TeacherActionBar extends StatelessWidget {
  const TeacherActionBar({
    required this.text,
    required this.action,
    this.sub,
    this.kind = BtnKind.primary,
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
  Widget build(BuildContext context) => Glass(
    height: 64,
    radius: 32,
    padding: const EdgeInsets.only(left: 20, right: 8),
    child: Row(
      children: [
        Expanded(
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              if (sub != null) Text(sub!, style: context.type.cap.copyWith(fontSize: 11.5)),
              DefaultTextStyle.merge(maxLines: 1, overflow: TextOverflow.ellipsis, child: text),
            ],
          ),
        ),
        const SizedBox(width: 8),
        Btn(action, kind: kind, height: 48, loading: loading, onPressed: onPressed, trailing: icon),
      ],
    ),
  );
}

// ───────────────────────────── Mark attendance ─────────────────────────────
