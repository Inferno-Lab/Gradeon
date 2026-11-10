import 'package:flutter_secure_storage/flutter_secure_storage.dart' show AndroidOptions, FlutterSecureStorage;
import 'package:get/get.dart';
import 'package:get_storage/get_storage.dart';

abstract final class StorageKeys {
  static const themeMode = 'themeMode';
  static const palette = 'palette';
  static const textScale = 'textScale';
  static const onboardingSeen = 'onboardingSeen';
  static const welcomeSeen = 'welcomeSeen';
  static const sessionUser = 'sessionUser';
  static const activeStudent = 'activeStudent';
  static const accessToken = 'accessToken';
  static const refreshToken = 'refreshToken';
  static const reduceMotion = 'reduceMotion';
  static const simulateErrors = 'simulateErrors';
  static const locale = 'locale';
  static const notifyHomework = 'notifyHomework';
  static const notifyFees = 'notifyFees';
  static const readNotices = 'readNotices';
  static const recentSearches = 'recentSearches';
}

class StorageService extends GetxService {
  StorageService({Map<String, dynamic>? memory}) : _memory = memory;

  GetStorage? _box;
  FlutterSecureStorage? _secure;
  final Map<String, dynamic>? _memory;
  String? _accessToken;
  String? _refreshToken;

  static bool _isSecret(String key) => key == StorageKeys.accessToken || key == StorageKeys.refreshToken;

  Future<StorageService> init() async {
    final memory = _memory;
    if (memory == null) {
      await GetStorage.init();
      _box = GetStorage();
      _secure = const FlutterSecureStorage(
        aOptions: AndroidOptions(encryptedSharedPreferences: true),
      );
      await _migrateAndLoadTokens();
    } else {
      _accessToken = memory[StorageKeys.accessToken] as String?;
      _refreshToken = memory[StorageKeys.refreshToken] as String?;
    }
    return this;
  }

  Future<void> _migrateAndLoadTokens() async {
    final secure = _secure;
    final box = _box;
    if (secure == null || box == null) return;
    final oldAccess = box.read<String>(StorageKeys.accessToken);
    final oldRefresh = box.read<String>(StorageKeys.refreshToken);
    if (oldAccess != null || oldRefresh != null) {
      if (oldAccess != null) await secure.write(key: StorageKeys.accessToken, value: oldAccess);
      if (oldRefresh != null) await secure.write(key: StorageKeys.refreshToken, value: oldRefresh);
      await box.remove(StorageKeys.accessToken);
      await box.remove(StorageKeys.refreshToken);
    }
    _accessToken = await secure.read(key: StorageKeys.accessToken);
    _refreshToken = await secure.read(key: StorageKeys.refreshToken);
  }

  T? read<T>(String key) {
    if (key == StorageKeys.accessToken) return _accessToken as T?;
    if (key == StorageKeys.refreshToken) return _refreshToken as T?;
    final memory = _memory;
    if (memory != null) return memory[key] as T?;
    return _box?.read<T>(key);
  }

  Future<void> write(String key, dynamic value) async {
    if (key == StorageKeys.accessToken || key == StorageKeys.refreshToken) {
      if (key == StorageKeys.accessToken) _accessToken = value as String?;
      if (key == StorageKeys.refreshToken) _refreshToken = value as String?;
      final secure = _secure;
      final memory = _memory;
      if (secure != null) {
        if (value == null) {
          await secure.delete(key: key);
        } else {
          await secure.write(key: key, value: value as String);
        }
      } else if (memory != null) {
        memory[key] = value;
      }
      return;
    }
    final memory = _memory;
    if (memory != null) {
      memory[key] = value;
      return;
    }
    await _box?.write(key, value);
  }

  // The last school data the app loaded, kept encrypted (it names children) so Home works without a network.
  static const _cachePrefix = 'cache:';

  Future<void> writeCache(String key, String json) async {
    final memory = _memory;
    if (memory != null) {
      memory['$_cachePrefix$key'] = json;
      return;
    }
    await _secure?.write(key: '$_cachePrefix$key', value: json);
  }

  Future<String?> readCache(String key) async {
    final memory = _memory;
    if (memory != null) return memory['$_cachePrefix$key'] as String?;
    return _secure?.read(key: '$_cachePrefix$key');
  }

  /// On sign-out: the next person on this phone must not see the last one's data.
  Future<void> clearCache() async {
    final memory = _memory;
    if (memory != null) {
      memory.removeWhere((k, _) => k.startsWith(_cachePrefix));
      return;
    }
    final secure = _secure;
    if (secure == null) return;
    for (final key in (await secure.readAll()).keys.where((k) => k.startsWith(_cachePrefix))) {
      await secure.delete(key: key);
    }
  }

  Future<void> remove(String key) async {
    if (_isSecret(key)) {
      if (key == StorageKeys.accessToken) _accessToken = null;
      if (key == StorageKeys.refreshToken) _refreshToken = null;
      await _secure?.delete(key: key);
      _memory?.remove(key);
      return;
    }
    final memory = _memory;
    if (memory != null) {
      memory.remove(key);
      return;
    }
    await _box?.remove(key);
  }
}
