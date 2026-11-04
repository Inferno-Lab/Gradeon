import 'dart:async';

import 'package:flutter/material.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/config/app_config.dart';
import 'package:gradeon/core/services/storage_service.dart';
import 'package:gradeon/core/theme/app_theme.dart';

class ThemeService extends GetxService {
  ThemeService(this._storage);

  final StorageService _storage;

  final mode = AppThemeMode.system.obs;
  final textScale = 1.0.obs;
  final reduceMotion = false.obs;
  final reduceTransparency = false.obs;
  final locale = const Locale('en').obs;
  final notifyHomework = true.obs;
  final notifyFees = true.obs;

  void load() {
    mode.value = AppThemeMode.values.firstWhere(
      (item) => item.name == _storage.read<String>(StorageKeys.themeMode),
      orElse: () => AppThemeMode.system,
    );
    textScale.value = (_storage.read<num>(StorageKeys.textScale) ?? 1).toDouble();
    reduceMotion.value = _storage.read<bool>(StorageKeys.reduceMotion) ?? false;
    reduceTransparency.value =
        _storage.read<bool>(StorageKeys.reduceTransparency) ?? false;
    final code = _storage.read<String>(StorageKeys.locale) ?? 'en';
    locale.value = Locale(code);
    notifyHomework.value = _storage.read<bool>(StorageKeys.notifyHomework) ?? true;
    notifyFees.value = _storage.read<bool>(StorageKeys.notifyFees) ?? true;
    AppConfig.simulateErrors.value =
        _storage.read<bool>(StorageKeys.simulateErrors) ?? false;
  }

  Future<void> setMode(AppThemeMode value) async {
    mode.value = value;
    await _storage.write(StorageKeys.themeMode, value.name);
  }

  Future<void> setTextScale(double value) async {
    textScale.value = value;
    await _storage.write(StorageKeys.textScale, value);
  }

  Future<void> setReduceMotion({required bool value}) async {
    reduceMotion.value = value;
    await _storage.write(StorageKeys.reduceMotion, value);
  }

  Future<void> setReduceTransparency({required bool value}) async {
    reduceTransparency.value = value;
    await _storage.write(StorageKeys.reduceTransparency, value);
  }

  Future<void> setLocale(Locale value) async {
    locale.value = value;
    await _storage.write(StorageKeys.locale, value.languageCode);
    if (!Get.testMode) unawaited(Get.updateLocale(value));
  }

  Future<void> setNotify({bool? homework, bool? fees}) async {
    if (homework != null) {
      notifyHomework.value = homework;
      await _storage.write(StorageKeys.notifyHomework, homework);
    }
    if (fees != null) {
      notifyFees.value = fees;
      await _storage.write(StorageKeys.notifyFees, fees);
    }
  }

  Future<void> setSimulateErrors({required bool value}) async {
    AppConfig.simulateErrors.value = value;
    await _storage.write(StorageKeys.simulateErrors, value);
  }
}
