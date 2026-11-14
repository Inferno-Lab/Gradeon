import 'dart:async';

import 'package:get/get.dart';
import 'package:tangent/core/services/live_stream.dart';
import 'package:tangent/core/services/auth_service.dart';
import 'package:tangent/core/utils/loadable.dart';
import 'package:tangent/data/models/campus.dart';
import 'package:tangent/data/repositories/campus_repository.dart';
import 'package:url_launcher/url_launcher.dart';

class TransportController extends GetxController with Loadable, LiveListen {
  @override
  void onInit() {
    super.onInit();
    // The bus moved, or a trip started or ended.
    listenLive('bus.', (_) => unawaited(load()));
  }

  TransportInfo? route;

  @override
  Future<void> load() async {
    final id = Get.find<AuthService>().activeStudentId.value;
    if (id == null) {
      await run(() async {}, isEmpty: () => true);
      return;
    }
    await run(() async {
      route = await Get.find<TransportRepository>().forStudent(id);
    }, isEmpty: () => route == null);
  }

  Future<void> callDriver() async {
    final phone = route?.call?.phone;
    if (phone == null) return;
    await launchUrl(Uri(scheme: 'tel', path: phone));
  }
}
