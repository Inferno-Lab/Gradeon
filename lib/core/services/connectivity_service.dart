import 'dart:async';

import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:get/get.dart';

class ConnectivityService extends GetxService {
  final isOnline = true.obs;

  /// When the school data on screen was last fresh: set while the app shows saved data because the network is down.
  final lastSynced = Rxn<DateTime>();

  /// Called when the network comes back (the API client sends what was queued offline).
  final List<Future<void> Function()> onBackOnline = [];

  StreamSubscription<List<ConnectivityResult>>? _sub;

  @override
  void onInit() {
    super.onInit();
    _sub = Connectivity().onConnectivityChanged.listen(_apply);
    unawaited(_prime());
  }

  Future<void> _prime() async {
    final current = await Connectivity().checkConnectivity();
    _apply(current);
  }

  void _apply(List<ConnectivityResult> results) {
    final was = isOnline.value;
    isOnline.value = results.any((result) => result != ConnectivityResult.none);
    if (!was && isOnline.value) {
      for (final fn in onBackOnline) {
        unawaited(fn());
      }
    }
  }

  @override
  void onClose() {
    unawaited(_sub?.cancel());
    super.onClose();
  }
}
