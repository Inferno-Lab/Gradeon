import 'dart:async';

import 'package:get/get.dart';
import 'package:gradeon/core/services/auth_service.dart';
import 'package:gradeon/core/services/session_bus.dart';
import 'package:gradeon/core/utils/app_exception.dart';
import 'package:gradeon/core/utils/view_state.dart';

mixin Loadable on GetxController {
  final state = ViewState.loading.obs;
  final errorMessage = 'errors.generic'.obs;

  bool get watchRevision => true;

  Future<void> load();

  void watchSession() {
    if (watchRevision && Get.isRegistered<SessionBus>()) {
      ever(Get.find<SessionBus>().revision, (_) => load());
    }
    if (Get.isRegistered<AuthService>()) {
      ever(Get.find<AuthService>().activeStudentId, (_) => load());
    }
  }

  Future<void> run(
    Future<void> Function() body, {
    bool Function()? isEmpty,
  }) async {
    if (state.value != ViewState.success) state.value = ViewState.loading;
    try {
      await body();
      state.value = (isEmpty?.call() ?? false)
          ? ViewState.empty
          : ViewState.success;
    } on AppException catch (error) {
      errorMessage.value = error.message;
      state.value = ViewState.error;
    }
  }

  @override
  void onInit() {
    super.onInit();
    watchSession();
    unawaited(load());
  }
}
