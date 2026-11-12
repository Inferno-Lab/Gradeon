import 'dart:async';
import 'dart:convert';

import 'package:flutter/widgets.dart';
import 'package:get/get.dart';
import 'package:gradeon/core/config/app_config.dart';
import 'package:gradeon/data/datasources/remote_datasource.dart';

/// One event from the school, by its type (chat.message, chat.typing, chat.read, notification, bus.position, bus.trip).
class LiveEvent {
  const LiveEvent(this.type, this.data);

  final String type;
  final Map<String, dynamic> data;
}

/// Live updates while the app is in front: one stream from the school per signed-in phone. Screens listen for the events they
/// show and reload what an event names; the stream reconnects by itself and closes when the app goes to the background.
class LiveStream extends GetxService {
  final _events = StreamController<LiveEvent>.broadcast();
  StreamSubscription<String>? _lines;
  AppLifecycleListener? _life;
  Timer? _retry;
  var _wanted = false;
  var _backoff = 2;

  Stream<LiveEvent> on(String prefix) => _events.stream.where((e) => e.type.startsWith(prefix));

  @override
  void onInit() {
    super.onInit();
    _life = AppLifecycleListener(onResume: () => _wanted ? unawaited(_open()) : null, onPause: _close);
  }

  /// Called once the person has signed in (the shell), and stopped at sign-out.
  void start() {
    if (!AppConfig.live || _wanted) return;
    _wanted = true;
    unawaited(_open());
  }

  void stop() {
    _wanted = false;
    _close();
  }

  Future<void> _open() async {
    if (!_wanted || _lines != null) return;
    try {
      final res = await Get.find<RemoteDataSource>().client.openStream();
      _backoff = 2;
      var type = 'message';
      _lines = res.transform(utf8.decoder).transform(const LineSplitter()).listen(
        (line) {
          if (line.startsWith('event: ')) {
            type = line.substring(7).trim();
          } else if (line.startsWith('data: ')) {
            final data = jsonDecode(line.substring(6));
            _events.add(LiveEvent(type, data is Map ? Map<String, dynamic>.from(data) : const {}));
            type = 'message';
          }
        },
        onDone: _again,
        onError: (Object _) => _again(),
        cancelOnError: true,
      );
    } on Object {
      _again();
    }
  }

  void _close() {
    _retry?.cancel();
    unawaited(_lines?.cancel());
    _lines = null;
  }

  /// A dropped stream comes back after 2, 4, 8… seconds, at most a minute.
  void _again() {
    _lines = null;
    if (!_wanted) return;
    _retry?.cancel();
    _retry = Timer(Duration(seconds: _backoff), () => unawaited(_open()));
    _backoff = (_backoff * 2).clamp(2, 60);
  }

  @override
  void onClose() {
    _life?.dispose();
    _close();
    unawaited(_events.close());
    super.onClose();
  }
}

/// A controller that reloads when the school says something it shows has changed; the listeners go when it does.
mixin LiveListen on GetxController {
  final _subs = <StreamSubscription<LiveEvent>>[];

  void listenLive(String prefix, void Function(LiveEvent e) on) {
    if (Get.isRegistered<LiveStream>()) _subs.add(Get.find<LiveStream>().on(prefix).listen(on));
  }

  @override
  void onClose() {
    for (final s in _subs) {
      unawaited(s.cancel());
    }
    super.onClose();
  }
}
