import 'dart:async';

import 'package:flutter/material.dart';
import 'package:geolocator/geolocator.dart';
import 'package:get/get.dart';
import 'package:tangent/core/config/app_config.dart';
import 'package:tangent/core/utils/app_exception.dart';
import 'package:tangent/core/utils/loadable.dart';
import 'package:tangent/core/widgets/toast.dart';
import 'package:tangent/data/models/driver.dart';
import 'package:tangent/data/repositories/driver_repository.dart';
import 'package:tangent/core/utils/clock.dart';

/// The bus driver's day: start a trip, the phone shares where the bus is until it ends, each child is marked on and off.
class DriverController extends GetxController with Loadable {
  final routes = <DriverRoute>[].obs;
  final busy = false.obs;
  StreamSubscription<Position>? _gps;
  DateTime _sent = DateTime(2000);

  DriverRepository get _repo => Get.find<DriverRepository>();

  @override
  void onInit() {
    super.onInit();
    watchSession();
    unawaited(load());
  }

  @override
  void onClose() {
    unawaited(_gps?.cancel());
    super.onClose();
  }

  @override
  Future<void> load() => run(() async {
    routes.assignAll(await _repo.day());
    // A trip still running (the app was closed mid-trip) keeps sharing where the bus is.
    final running = routes.map((r) => r.running).whereType<BusTrip>().firstOrNull;
    if (running != null) unawaited(_share(running.id));
  }, isEmpty: () => routes.isEmpty);

  /// Morning before noon, afternoon after.
  String get kindNow => Clock.now().hour < 12 ? 'morning' : 'afternoon';

  String? markOf(DriverRoute route, String tripId, String studentId) =>
      route.marks.where((m) => m.tripId == tripId && m.studentId == studentId).firstOrNull?.event;

  Future<void> start(DriverRoute route) => _act(() async {
    final id = await _repo.start(routeId: route.id, kind: kindNow);
    await load();
    await _share(id);
  }, 'driver.started');

  Future<void> end(String tripId) => _act(() async {
    await _repo.end(tripId);
    await _gps?.cancel();
    _gps = null;
    await load();
  }, 'driver.ended');

  Future<void> mark(DriverRoute route, String tripId, Rider rider, String event, String stopId) => _act(() async {
    await _repo.mark(tripId, studentId: rider.id, event: event, stopId: stopId);
    await load();
  }, null);

  Future<void> late(String tripId, int minutes, String reason) => _act(() async {
    await _repo.delay(tripId, minutes: minutes, reason: reason);
    await load();
  }, 'driver.late_sent');

  /// Sends the bus's position at most every 20 seconds while the trip runs. Without permission the trip still runs; families
  /// then see the bus from its tracker, or not at all, and the driver is told.
  Future<void> _share(String tripId) async {
    if (!AppConfig.live || _gps != null) return;
    var allowed = await Geolocator.checkPermission();
    if (allowed == LocationPermission.denied) allowed = await Geolocator.requestPermission();
    if (allowed == LocationPermission.denied || allowed == LocationPermission.deniedForever || !await Geolocator.isLocationServiceEnabled()) {
      ToastHelper.show('driver.no_location', kind: ToastKind.error);
      return;
    }
    _gps = Geolocator.getPositionStream(locationSettings: const LocationSettings(distanceFilter: 25)).listen((p) {
      if (Clock.now().difference(_sent) < const Duration(seconds: 20)) return;
      _sent = Clock.now();
      unawaited(_repo.position(tripId, lat: p.latitude, lng: p.longitude).catchError((Object _) {}));
    });
  }

  Future<void> _act(Future<void> Function() body, String? done) async {
    if (busy.value) return;
    busy.value = true;
    try {
      await body();
      if (done != null) ToastHelper.show(done);
    } on AppException catch (e) {
      ToastHelper.show(e.message, kind: ToastKind.error);
    } finally {
      busy.value = false;
    }
  }

  final reason = TextEditingController();
}
