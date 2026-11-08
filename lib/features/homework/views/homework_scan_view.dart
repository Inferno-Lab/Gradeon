import 'dart:async';
import 'dart:io';

import 'package:camera/camera.dart';
import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/theme/app_colors.dart';
import 'package:gradeon/core/theme/app_theme.dart';
import 'package:gradeon/core/theme/app_typography.dart';
import 'package:gradeon/core/utils/extensions.dart';
import 'package:gradeon/core/utils/haptics.dart';
import 'package:gradeon/core/widgets/glass.dart';
import 'package:gradeon/core/widgets/toast.dart';
import 'package:gradeon/core/widgets/ui.dart';
import 'package:gradeon/data/models/academics.dart';
import 'package:gradeon/features/homework/controllers/homework_controller.dart';
import 'package:phosphor_flutter/phosphor_flutter.dart';

/// Multi-page homework scanner: live camera, glass controls, a lens shutter.
class HomeworkScanView extends StatefulWidget {
  const HomeworkScanView({super.key});

  @override
  State<HomeworkScanView> createState() => _HomeworkScanViewState();
}

class _HomeworkScanViewState extends State<HomeworkScanView> with WidgetsBindingObserver {
  CameraController? _camera;
  final _pages = <XFile>[];
  var _flash = false;
  var _busy = false;
  String? _error;

  Homework? get _homework => Get.arguments is Homework ? Get.arguments as Homework : null;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    unawaited(_start());
  }

  Future<void> _start() async {
    try {
      final cameras = await availableCameras();
      final back = cameras.where((c) => c.lensDirection == CameraLensDirection.back).firstOrNull ?? cameras.firstOrNull;
      if (back == null) {
        setState(() => _error = 'scan.no_camera');
        return;
      }
      final camera = CameraController(back, ResolutionPreset.high, enableAudio: false);
      await camera.initialize();
      await camera.setFlashMode(FlashMode.off);
      if (!mounted) {
        await camera.dispose();
        return;
      }
      setState(() => _camera = camera);
    } on CameraException catch (e) {
      if (mounted) setState(() => _error = e.code == 'CameraAccessDenied' ? 'scan.denied' : 'scan.no_camera');
    }
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    final camera = _camera;
    if (camera == null || !camera.value.isInitialized) return;
    if (state == AppLifecycleState.inactive) {
      _camera = null;
      unawaited(camera.dispose());
    } else if (state == AppLifecycleState.resumed) {
      unawaited(_start());
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    unawaited(_camera?.dispose());
    super.dispose();
  }

  Future<void> _capture() async {
    final camera = _camera;
    if (camera == null || _busy) return;
    setState(() => _busy = true);
    try {
      Haptics.medium();
      final file = await camera.takePicture();
      setState(() => _pages.add(file));
    } on CameraException {
      ToastHelper.show('errors.generic', kind: ToastKind.error);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _toggleFlash() async {
    final camera = _camera;
    if (camera == null) return;
    _flash = !_flash;
    await camera.setFlashMode(_flash ? FlashMode.torch : FlashMode.off);
    setState(() {});
  }

  Future<void> _done() async {
    final hw = _homework;
    if (_pages.isEmpty || hw == null) {
      Get.back<void>();
      return;
    }
    final controller = Get.isRegistered<HomeworkController>()
        ? Get.find<HomeworkController>()
        : Get.put(HomeworkController());
    await controller.sendScan(hw, _pages.length);
    Get.back<void>();
  }

  @override
  Widget build(BuildContext context) {
    // The scanner is always dark, whatever the app theme.
    return Theme(
      data: AppTheme.build(AppColors.blackboard),
      child: Builder(builder: _build),
    );
  }

  Widget _build(BuildContext context) {
    final inset = MediaQuery.paddingOf(context);
    final camera = _camera;
    final next = _pages.length + 1;
    const white = AppColors.white;
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        children: [
          Positioned.fill(
            child: camera != null && camera.value.isInitialized
                ? FittedBox(
                    fit: BoxFit.cover,
                    child: SizedBox(
                      width: camera.value.previewSize?.height ?? 1080,
                      height: camera.value.previewSize?.width ?? 1920,
                      child: CameraPreview(camera),
                    ),
                  )
                : Center(
                    child: _error == null
                        ? const CircularProgressIndicator(color: white)
                        : Padding(
                            padding: const EdgeInsets.all(32),
                            child: Text(
                              _error!.tr,
                              textAlign: TextAlign.center,
                              style: context.type.b.copyWith(color: white),
                            ),
                          ),
                  ),
          ),
          // Page guide: four marigold corners and a sweeping line.
          if (camera != null) const Positioned.fill(child: IgnorePointer(child: _Guide())),
          Positioned(
            left: 16,
            right: 16,
            top: inset.top + 8,
            child: Row(
              children: [
                GlassIconButton(
                  icon: PhosphorIconsRegular.x,
                  label: 'scan.close'.tr,
                  color: white,
                  onTap: () => Get.back<void>(),
                ),
                const Spacer(),
                Glass(
                  height: 44,
                  onPigment: true,
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      PulseDot(AppColors.mari),
                      const SizedBox(width: 8),
                      Text(
                        (camera == null ? 'scan.starting' : 'scan.hold_still').tr,
                        style: anek(14, 650, height: 1, color: white),
                      ),
                    ],
                  ),
                ),
                const Spacer(),
                GlassIconButton(
                  icon: _flash ? PhosphorIconsFill.lightning : PhosphorIconsRegular.lightning,
                  label: (_flash ? 'scan.flash_on' : 'scan.flash_off').tr,
                  color: white,
                  onTap: () => unawaited(_toggleFlash()),
                ),
              ],
            ),
          ),
          Positioned(
            left: 24,
            right: 24,
            bottom: 46 + inset.bottom,
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                SizedBox(
                  width: 64,
                  height: 74,
                  child: _pages.isEmpty
                      ? null
                      : Stack(
                          clipBehavior: Clip.none,
                          children: [
                            Transform.rotate(
                              angle: -.1,
                              child: ClipRRect(
                                borderRadius: BorderRadius.circular(6),
                                child: Image.file(File(_pages.last.path), width: 56, height: 70, fit: BoxFit.cover),
                              ),
                            ),
                            Positioned(
                              right: -4,
                              top: -8,
                              child: Container(
                                constraints: const BoxConstraints(minWidth: 22),
                                height: 22,
                                alignment: Alignment.center,
                                decoration: BoxDecoration(color: AppColors.mari, shape: BoxShape.circle),
                                child: Text(
                                  '${_pages.length}',
                                  style: anek(12, 760, height: 1, color: AppColors.mariInk),
                                ),
                              ),
                            ),
                          ],
                        ),
                ),
                Semantics(
                  button: true,
                  label: 'scan.capture'.trp({'n': '$next'}),
                  child: GlassPress(
                    onTap: camera == null ? null : () => unawaited(_capture()),
                    child: Container(
                      width: 84,
                      height: 84,
                      decoration: BoxDecoration(
                        shape: BoxShape.circle,
                        border: Border.all(color: const Color(0xE6FFFFFF), width: 4),
                      ),
                      child: const Glass(kind: GlassKind.lens, radius: 42, tint: Color(0x1AFFFFFF), shadow: false),
                    ),
                  ),
                ),
                GlassPress(
                  onTap: () => unawaited(_done()),
                  child: Glass(
                    width: 96,
                    height: 48,
                    radius: 24,
                    onPigment: true,
                    child: Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text('common.done'.tr, style: anek(16, 700, height: 1, color: white)),
                        const SizedBox(width: 6),
                        const Icon(PhosphorIconsBold.caretRight, size: 14, color: white),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
          Positioned(
            left: 0,
            right: 0,
            bottom: 12 + inset.bottom,
            child: Text(
              'scan.footer'.trp({'n': '$next'}),
              textAlign: TextAlign.center,
              style: anek(12, 520, height: 1.3, color: const Color(0xB3FFFFFF)),
            ),
          ),
        ],
      ),
    );
  }
}

class _Guide extends StatefulWidget {
  const _Guide();

  @override
  State<_Guide> createState() => _GuideState();
}

class _GuideState extends State<_Guide> with SingleTickerProviderStateMixin {
  late final _c = AnimationController(vsync: this, duration: const Duration(milliseconds: 1800))..repeat(reverse: true);

  @override
  void dispose() {
    _c.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, box) {
        final w = box.maxWidth * .78;
        final h = w * 1.33;
        final left = (box.maxWidth - w) / 2;
        final top = (box.maxHeight - h) / 2 - 20;
        return Stack(
          children: [
            Positioned(
              left: left,
              top: top,
              width: w,
              height: h,
              child: Transform.rotate(angle: -.07, child: const CustomPaint(painter: _CornersPainter())),
            ),
            if (!context.reduceMotion)
              AnimatedBuilder(
                animation: _c,
                builder: (context, _) => Positioned(
                  left: left - 12,
                  width: w + 24,
                  top: top + h * Curves.easeInOut.transform(_c.value),
                  height: 2,
                  child: DecoratedBox(
                    decoration: BoxDecoration(
                      gradient: LinearGradient(colors: [Colors.transparent, AppColors.mari, Colors.transparent]),
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

class _CornersPainter extends CustomPainter {
  const _CornersPainter();

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = AppColors.mari
      ..strokeWidth = 3.5
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;
    const l = 26.0;
    final w = size.width;
    final h = size.height;
    final path = Path()
      ..moveTo(0, l)
      ..lineTo(0, 8)
      ..quadraticBezierTo(0, 0, 8, 0)
      ..lineTo(l, 0)
      ..moveTo(w - l, 0)
      ..lineTo(w - 8, 0)
      ..quadraticBezierTo(w, 0, w, 8)
      ..lineTo(w, l)
      ..moveTo(0, h - l)
      ..lineTo(0, h - 8)
      ..quadraticBezierTo(0, h, 8, h)
      ..lineTo(l, h)
      ..moveTo(w - l, h)
      ..lineTo(w - 8, h)
      ..quadraticBezierTo(w, h, w, h - 8)
      ..lineTo(w, h - l);
    canvas.drawPath(path, paint);
  }

  @override
  bool shouldRepaint(_CornersPainter oldDelegate) => false;
}
