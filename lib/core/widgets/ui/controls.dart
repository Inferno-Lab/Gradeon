import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/theme/app_colors.dart';
import 'package:gradeon/core/theme/app_typography.dart';
import 'package:gradeon/core/theme/tokens.dart';
import 'package:gradeon/core/utils/extensions.dart';

/// Squash-on-press wrapper used by cards, rows and buttons.
class Pressable extends StatefulWidget {
  const Pressable({required this.child, this.onTap, this.scale = .97, this.label, super.key});

  final Widget child;
  final VoidCallback? onTap;
  final double scale;
  final String? label;

  @override
  State<Pressable> createState() => _PressableState();
}

class _PressableState extends State<Pressable> {
  var _down = false;

  @override
  Widget build(BuildContext context) {
    final enabled = widget.onTap != null;
    return Semantics(
      button: enabled,
      label: widget.label,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onTap: widget.onTap,
        onTapDown: enabled ? (_) => setState(() => _down = true) : null,
        onTapUp: enabled ? (_) => setState(() => _down = false) : null,
        onTapCancel: enabled ? () => setState(() => _down = false) : null,
        child: AnimatedScale(
          scale: _down && !context.reduceMotion ? widget.scale : 1,
          duration: _down ? const Duration(milliseconds: 90) : AppDurations.medium,
          curve: _down ? Curves.easeOut : kSpring,
          child: widget.child,
        ),
      ),
    );
  }
}

enum BtnKind { primary, ink, quiet, danger, plain }

class Btn extends StatelessWidget {
  const Btn(
    this.label, {
    required this.onPressed,
    this.kind = BtnKind.primary,
    this.small = false,
    this.icon,
    this.trailing,
    this.expand = false,
    this.loading = false,
    this.height,
    super.key,
  });

  final String label;
  final VoidCallback? onPressed;
  final BtnKind kind;
  final bool small;
  final IconData? icon;
  final IconData? trailing;
  final bool expand;
  final bool loading;
  final double? height;

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    final (bg, fg) = switch (kind) {
      BtnKind.primary => (AppColors.mari, AppColors.mariInk),
      BtnKind.ink => (c.ink, c.chalk),
      BtnKind.quiet => (Colors.transparent, c.ink),
      BtnKind.danger => (AppColors.bad, AppColors.white),
      BtnKind.plain => (Colors.transparent, c.ink),
    };
    final h = height ?? (small ? 40.0 : 52.0);
    final disabled = onPressed == null && !loading;
    final style = anek(small ? 14.5 : 16, 650, width: 108, height: 1, color: fg);
    final content = Row(
      mainAxisSize: expand ? MainAxisSize.max : MainAxisSize.min,
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        if (loading)
          SizedBox.square(dimension: 18, child: CircularProgressIndicator(strokeWidth: 2.2, color: fg))
        else ...[
          if (icon != null) ...[Icon(icon, size: 18, color: fg), const SizedBox(width: 8)],
          Flexible(
            child: Text(label.tr, style: style, maxLines: 1, overflow: TextOverflow.ellipsis),
          ),
          if (trailing != null) ...[const SizedBox(width: 8), Icon(trailing, size: 18, color: fg)],
        ],
      ],
    );
    return Opacity(
      opacity: disabled ? .4 : 1,
      child: Pressable(
        scale: .96,
        label: label.tr,
        onTap: loading ? null : onPressed,
        child: Container(
          height: h,
          padding: EdgeInsets.symmetric(horizontal: small ? 16 : 22),
          decoration: BoxDecoration(
            color: bg,
            borderRadius: BorderRadius.circular(h / 2),
            border: kind == BtnKind.quiet ? Border.all(color: c.line2, width: 1.5) : null,
          ),
          child: content,
        ),
      ),
    );
  }
}

/// Text field in the paper style: label above, ring, focus ring in ink.
class Field extends StatefulWidget {
  const Field({
    this.controller,
    this.label,
    this.hint,
    this.icon,
    this.trailing,
    this.obscure = false,
    this.keyboard,
    this.validator,
    this.maxLines = 1,
    this.minHeight = 56,
    this.onChanged,
    this.textInputAction,
    this.autofillHints,
    this.onSubmitted,
    this.inputFormatters,
    this.fill,
    this.borderless = false,
    super.key,
  });

  final TextEditingController? controller;
  final String? label;
  final String? hint;
  final IconData? icon;
  final Widget? trailing;
  final bool obscure;
  final TextInputType? keyboard;
  final String? Function(String?)? validator;
  final int maxLines;
  final double minHeight;
  final ValueChanged<String>? onChanged;
  final TextInputAction? textInputAction;
  final Iterable<String>? autofillHints;
  final ValueChanged<String>? onSubmitted;
  final List<dynamic>? inputFormatters;
  final Color? fill;

  /// No resting outline (search wells); focus and errors still draw one.
  final bool borderless;

  @override
  State<Field> createState() => _FieldState();
}

class _FieldState extends State<Field> {
  final _focus = FocusNode();

  @override
  void initState() {
    super.initState();
    _focus.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _focus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final c = context.app;
    return FormField<String>(
      initialValue: widget.controller?.text,
      validator: widget.validator == null ? null : (_) => widget.validator!(widget.controller?.text),
      builder: (state) {
        final error = state.errorText;
        final ringColor = error != null
            ? AppColors.bad
            : (_focus.hasFocus ? c.ink : (widget.borderless ? Colors.transparent : c.line2));
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            if (widget.label != null)
              Padding(
                padding: const EdgeInsets.only(left: 4, bottom: 8),
                child: Text(widget.label!.tr, style: anek(13, 620, height: 1.2, color: c.ink2)),
              ),
            AnimatedContainer(
              duration: AppDurations.fast,
              constraints: BoxConstraints(minHeight: widget.minHeight),
              padding: const EdgeInsets.symmetric(horizontal: 16),
              decoration: BoxDecoration(
                color: widget.fill ?? c.paper,
                borderRadius: BorderRadius.circular(AppRadius.field),
                border: Border.all(
                  color: ringColor,
                  width: error != null || _focus.hasFocus ? 2 : 1,
                ),
              ),
              child: Row(
                crossAxisAlignment: widget.maxLines > 1 ? CrossAxisAlignment.start : CrossAxisAlignment.center,
                children: [
                  if (widget.icon != null) ...[
                    Padding(
                      padding: EdgeInsets.only(top: widget.maxLines > 1 ? 16 : 0),
                      child: Icon(widget.icon, size: 18, color: c.ink3),
                    ),
                    const SizedBox(width: 10),
                  ],
                  Expanded(
                    child: TextField(
                      controller: widget.controller,
                      focusNode: _focus,
                      obscureText: widget.obscure,
                      keyboardType: widget.keyboard,
                      maxLines: widget.maxLines,
                      minLines: 1,
                      textInputAction: widget.textInputAction,
                      autofillHints: widget.autofillHints,
                      onSubmitted: widget.onSubmitted,
                      inputFormatters: widget.inputFormatters?.cast(),
                      onChanged: (value) {
                        state.didChange(value);
                        widget.onChanged?.call(value);
                      },
                      style: anek(16, 450, height: 1.35, color: c.ink),
                      cursorColor: c.ink,
                      decoration: InputDecoration(
                        isCollapsed: true,
                        border: InputBorder.none,
                        contentPadding: EdgeInsets.symmetric(vertical: widget.maxLines > 1 ? 14 : 16),
                        hintText: widget.hint?.tr,
                        hintStyle: anek(16, 450, height: 1.35, color: c.ink3),
                      ),
                    ),
                  ),
                  if (widget.trailing != null) widget.trailing!,
                ],
              ),
            ),
            if (error != null)
              Padding(
                padding: const EdgeInsets.only(top: 8, left: 4),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(Icons.error_outline_rounded, size: 15, color: c.badText),
                    const SizedBox(width: 6),
                    Expanded(
                      child: Text(error.tr, style: anek(13, 600, height: 1.3, color: c.badText)),
                    ),
                  ],
                ),
              ),
          ],
        );
      },
    );
  }
}
