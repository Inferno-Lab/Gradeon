import 'dart:async';
import 'dart:convert';

import 'package:get/get.dart';
import 'package:gradeon/core/config/app_config.dart';
import 'package:gradeon/core/routes/app_routes.dart';
import 'package:gradeon/core/services/storage_service.dart';
import 'package:gradeon/core/theme/tokens.dart';
import 'package:gradeon/core/utils/app_exception.dart';
import 'package:gradeon/data/models/user.dart';

class AuthService extends GetxService {
  AuthService(this._storage);

  final StorageService _storage;
  final user = Rxn<AppUser>();
  final activeStudentId = RxnString();

  bool get isLoggedIn => user.value != null;

  UserRole? get role => user.value?.role;

  void restore() {
    final raw = _storage.read<String>(StorageKeys.sessionUser);
    if (raw == null) return;
    // A saved person without a saved token (an older build, or a token that was dropped) has to sign in again.
    if (AppConfig.live && _storage.read<String>(StorageKeys.accessToken) == null) return;
    final decoded = jsonDecode(raw);
    if (decoded is! Map<String, dynamic>) return;
    final next = AppUser.fromJson(decoded);
    // Student logins are retired. Drop a saved student session instead of opening the shell.
    if (next.role == UserRole.student) {
      unawaited(_storage.remove(StorageKeys.sessionUser));
      unawaited(_storage.remove(StorageKeys.activeStudent));
      unawaited(_storage.remove(StorageKeys.accessToken));
      unawaited(_storage.remove(StorageKeys.refreshToken));
      return;
    }
    user.value = next;
    activeStudentId.value =
        _storage.read<String>(StorageKeys.activeStudent) ?? user.value?.studentId ?? user.value?.childIds.firstOrNull;
  }

  Future<void> setSession(AppUser next, {String? studentId}) async {
    if (next.role == UserRole.student) throw const AppException('errors.student_login');
    user.value = next;
    final resolved = studentId ?? next.studentId ?? next.childIds.firstOrNull;
    activeStudentId.value = resolved;
    await _storage.write(StorageKeys.sessionUser, jsonEncode(next.toJson()));
    if (resolved == null) {
      await _storage.remove(StorageKeys.activeStudent);
    } else {
      await _storage.write(StorageKeys.activeStudent, resolved);
    }
  }

  Future<void> switchChild(String studentId) async {
    activeStudentId.value = studentId;
    await _storage.write(StorageKeys.activeStudent, studentId);
  }

  Future<void> updateAvatar(String url) async {
    final current = user.value;
    if (current == null) return;
    await setSession(current.copyWith(avatarUrl: url), studentId: activeStudentId.value);
  }

  /// Signs out: forgets the saved session, shows the sign-in screen and drops
  /// the session once the old screens have left, so none rebuild with no user.
  Future<void> signOut() async {
    await _storage.remove(StorageKeys.sessionUser);
    await _storage.remove(StorageKeys.activeStudent);
    await _storage.remove(StorageKeys.accessToken);
    await _storage.remove(StorageKeys.refreshToken);
    await _storage.clearCache();
    if (Get.testMode) {
      _clear();
      return;
    }
    unawaited(Get.offAllNamed<void>(AppRoutes.login));
    await Future<void>.delayed(AppMotion.t3);
    _clear();
  }

  void _clear() {
    user.value = null;
    activeStudentId.value = null;
  }
}
