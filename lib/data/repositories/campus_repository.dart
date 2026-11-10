import 'package:gradeon/core/utils/app_exception.dart';
import 'package:gradeon/data/datasources/mock_json_datasource.dart';
import 'package:gradeon/data/datasources/mock_writes.dart';
import 'package:gradeon/data/datasources/remote_datasource.dart';
import 'package:gradeon/data/models/campus.dart';
import 'package:gradeon/data/models/student.dart';
import 'package:url_launcher/url_launcher.dart';

abstract class FeeRepository {
  Future<FeeAccount?> forStudent(String studentId);

  /// Pays an installment and returns the stored receipt.
  Future<Receipt?> pay({
    required String studentId,
    required String installmentId,
    required String method,
  });
}

class MockFeeRepository implements FeeRepository {
  MockFeeRepository(this._ds);

  final MockJsonDataSource _ds;

  @override
  Future<FeeAccount?> forStudent(String studentId) => _ds.guard(() {
    for (final account in _ds.fees) {
      if (account.studentId == studentId) return account;
    }
    return null;
  });

  @override
  Future<Receipt?> pay({
    required String studentId,
    required String installmentId,
    required String method,
  }) => _ds.guard(
    () => _ds.payInstallment(
      studentId: studentId,
      installmentId: installmentId,
      method: method,
    ),
  );
}

class RemoteFeeRepository implements FeeRepository {
  RemoteFeeRepository(this._remote);

  final RemoteDataSource _remote;

  @override
  Future<FeeAccount?> forStudent(String studentId) async {
    final json = await _remote.get('/students/$studentId/fees');
    return FeeAccount.fromJson(Map<String, dynamic>.from(json as Map));
  }

  /// Opens the provider's checkout in the browser (no payment SDK in the app), then waits for the provider to confirm:
  /// the receipt comes back once its webhook marks the order paid. Null when the family left without paying.
  @override
  Future<Receipt?> pay({
    required String studentId,
    required String installmentId,
    required String method,
  }) async {
    final order = Map<String, dynamic>.from(await _remote.post('/fees/$installmentId/order', {'studentId': studentId}) as Map);
    final opened = await launchUrl(Uri.parse(order['url'] as String), mode: LaunchMode.externalApplication);
    if (!opened) throw const AppException('fees.pay_open_failed');
    // ponytail: polls every 3 s for 5 minutes; the checkout's page links back with gradeon://open/fees.
    for (var i = 0; i < 100; i++) {
      await Future<void>.delayed(const Duration(seconds: 3));
      final status = Map<String, dynamic>.from(await _remote.get('/orders/${order['orderId']}') as Map);
      if (status['status'] == 'paid' && status['receipt'] is Map) {
        return Receipt.fromJson(Map<String, dynamic>.from(status['receipt'] as Map));
      }
      if (status['status'] == 'failed') throw const AppException('fees.pay_failed');
    }
    return null;
  }
}

abstract class NoticeRepository {
  Future<List<Notice>> all();

  Future<void> post(Notice notice);
}

class MockNoticeRepository implements NoticeRepository {
  MockNoticeRepository(this._ds);

  final MockJsonDataSource _ds;

  @override
  Future<List<Notice>> all() => _ds.guard(() => [..._ds.notices]);

  @override
  Future<void> post(Notice notice) => _ds.guard(() => _ds.addNotice(notice));
}

class RemoteNoticeRepository implements NoticeRepository {
  RemoteNoticeRepository(this._remote);

  final RemoteDataSource _remote;

  @override
  Future<List<Notice>> all() async {
    final json = await _remote.get('/notices');
    return [
      for (final item in json as List)
        Notice.fromJson(Map<String, dynamic>.from(item as Map)),
    ];
  }

  @override
  Future<void> post(Notice notice) => _remote.post('/notices', notice.toJson());
}

abstract class EventRepository {
  Future<List<SchoolEvent>> all();

  Future<void> rsvp({
    required String eventId,
    required String userId,
    required RsvpStatus status,
  });
}

class MockEventRepository implements EventRepository {
  MockEventRepository(this._ds);

  final MockJsonDataSource _ds;

  @override
  Future<List<SchoolEvent>> all() => _ds.guard(() => [..._ds.events]);

  @override
  Future<void> rsvp({
    required String eventId,
    required String userId,
    required RsvpStatus status,
  }) => _ds.guard(
    () => _ds.rsvp(eventId: eventId, userId: userId, status: status),
  );
}

class RemoteEventRepository implements EventRepository {
  RemoteEventRepository(this._remote);

  final RemoteDataSource _remote;

  @override
  Future<List<SchoolEvent>> all() async {
    final json = await _remote.get('/events');
    return [
      for (final item in json as List)
        SchoolEvent.fromJson(Map<String, dynamic>.from(item as Map)),
    ];
  }

  @override
  Future<void> rsvp({
    required String eventId,
    required String userId,
    required RsvpStatus status,
  }) => _remote.post('/events/$eventId/rsvp', {
    'userId': userId,
    'status': status.name,
  });
}

abstract class ChatRepository {
  Future<List<ChatThread>> threadsFor(String userId);

  Future<List<ChatMessage>> messages(String threadId);

  /// One round trip for the inbox, so the list does not wait per thread.
  Future<({List<ChatThread> threads, List<ChatMessage> messages})> inbox(
    String userId,
  );

  Future<void> send({
    required String threadId,
    required String senderId,
    required String text,
  });

  Future<void> markRead({required String threadId, required String userId});

  /// Opens (or finds) a one-to-one thread with [teacher]; returns its id.
  Future<String> start({required String userId, required Teacher teacher});
}

class MockChatRepository implements ChatRepository {
  MockChatRepository(this._ds);

  final MockJsonDataSource _ds;

  @override
  Future<List<ChatThread>> threadsFor(String userId) => _ds.guard(
    () => _ds.threads
        .where((thread) => thread.participantIds.contains(userId))
        .toList(),
  );

  @override
  Future<List<ChatMessage>> messages(String threadId) => _ds.guard(() {
    final items =
        _ds.messages.where((item) => item.threadId == threadId).toList()
          ..sort((a, b) => a.sentAt.compareTo(b.sentAt));
    return items;
  });

  @override
  Future<({List<ChatThread> threads, List<ChatMessage> messages})> inbox(
    String userId,
  ) => _ds.guard(() {
    final threads = _ds.threads
        .where((thread) => thread.participantIds.contains(userId))
        .toList();
    final ids = threads.map((thread) => thread.id).toSet();
    final messages = _ds.messages
        .where((item) => ids.contains(item.threadId))
        .toList();
    return (threads: threads, messages: messages);
  });

  @override
  Future<void> send({
    required String threadId,
    required String senderId,
    required String text,
  }) => _ds.guard(
    () => _ds.sendMessage(threadId: threadId, senderId: senderId, text: text),
  );

  @override
  Future<void> markRead({required String threadId, required String userId}) =>
      _ds.guard(() => _ds.markThreadRead(threadId: threadId, userId: userId));

  @override
  Future<String> start({required String userId, required Teacher teacher}) =>
      _ds.guard(() => _ds.startThread(userId: userId, teacher: teacher));
}

class RemoteChatRepository implements ChatRepository {
  RemoteChatRepository(this._remote);

  final RemoteDataSource _remote;

  @override
  Future<List<ChatThread>> threadsFor(String userId) async {
    final json = await _remote.get('/users/$userId/threads');
    return [
      for (final item in json as List)
        ChatThread.fromJson(Map<String, dynamic>.from(item as Map)),
    ];
  }

  @override
  Future<List<ChatMessage>> messages(String threadId) async {
    final json = await _remote.get('/threads/$threadId/messages');
    return [
      for (final item in json as List)
        ChatMessage.fromJson(Map<String, dynamic>.from(item as Map)),
    ];
  }

  @override
  Future<void> send({
    required String threadId,
    required String senderId,
    required String text,
  }) => _remote.post('/threads/$threadId/messages', {
    'senderId': senderId,
    'text': text,
  });

  @override
  Future<({List<ChatThread> threads, List<ChatMessage> messages})> inbox(
    String userId,
  ) async {
    final threads = await threadsFor(userId);
    final json = await _remote.get('/users/$userId/messages');
    return (
      threads: threads,
      messages: [
        for (final item in json as List)
          ChatMessage.fromJson(Map<String, dynamic>.from(item as Map)),
      ],
    );
  }

  @override
  Future<void> markRead({required String threadId, required String userId}) =>
      _remote.post('/threads/$threadId/read', {'userId': userId});

  @override
  Future<String> start({
    required String userId,
    required Teacher teacher,
  }) async {
    final json = await _remote.post('/threads', {
      'userId': userId,
      'teacherId': teacher.id,
    });
    return (json as Map)['id'] as String;
  }
}

abstract class LibraryRepository {
  Future<List<LibraryBook>> all();

  Future<void> reserve({required String bookId, required String studentId});

  Future<void> renew(String bookId);
}

class MockLibraryRepository implements LibraryRepository {
  MockLibraryRepository(this._ds);

  final MockJsonDataSource _ds;

  @override
  Future<List<LibraryBook>> all() => _ds.guard(() => [..._ds.books]);

  @override
  Future<void> reserve({required String bookId, required String studentId}) =>
      _ds.guard(() => _ds.reserveBook(bookId: bookId, studentId: studentId));

  @override
  Future<void> renew(String bookId) => _ds.guard(() => _ds.renewBook(bookId));
}

class RemoteLibraryRepository implements LibraryRepository {
  RemoteLibraryRepository(this._remote);

  final RemoteDataSource _remote;

  @override
  Future<List<LibraryBook>> all() async {
    final json = await _remote.get('/library/books');
    return [
      for (final item in json as List)
        LibraryBook.fromJson(Map<String, dynamic>.from(item as Map)),
    ];
  }

  @override
  Future<void> reserve({required String bookId, required String studentId}) =>
      _remote.post('/library/books/$bookId/reserve', {'studentId': studentId});

  @override
  Future<void> renew(String bookId) =>
      _remote.post('/library/books/$bookId/renew', const {});
}

abstract class TransportRepository {
  Future<TransportInfo?> forStudent(String studentId);
}

class MockTransportRepository implements TransportRepository {
  MockTransportRepository(this._ds);

  final MockJsonDataSource _ds;

  @override
  Future<TransportInfo?> forStudent(String studentId) => _ds.guard(() {
    for (final route in _ds.transport) {
      if (route.studentId == studentId) return route;
    }
    return null;
  });
}

class RemoteTransportRepository implements TransportRepository {
  RemoteTransportRepository(this._remote);

  final RemoteDataSource _remote;

  @override
  Future<TransportInfo?> forStudent(String studentId) async {
    final json = await _remote.get('/students/$studentId/transport');
    return json is Map ? TransportInfo.fromJson(Map<String, dynamic>.from(json)) : null;
  }
}

abstract class LeaveRepository {
  Future<List<LeaveRequest>> forStudent(String studentId);

  Future<void> apply(LeaveRequest request);

  /// A class teacher approves or declines a request.
  Future<void> review({
    required String id,
    required LeaveStatus status,
    required String reviewer,
    String? note,
  });
}

class MockLeaveRepository implements LeaveRepository {
  MockLeaveRepository(this._ds);

  final MockJsonDataSource _ds;

  @override
  Future<List<LeaveRequest>> forStudent(String studentId) => _ds.guard(
    () => _ds.leaves.where((item) => item.studentId == studentId).toList(),
  );

  @override
  Future<void> apply(LeaveRequest request) =>
      _ds.guard(() => _ds.applyLeave(request));

  @override
  Future<void> review({
    required String id,
    required LeaveStatus status,
    required String reviewer,
    String? note,
  }) => _ds.guard(
    () => _ds.reviewLeave(id: id, status: status, reviewer: reviewer, note: note),
  );
}

class RemoteLeaveRepository implements LeaveRepository {
  RemoteLeaveRepository(this._remote);

  final RemoteDataSource _remote;

  @override
  Future<List<LeaveRequest>> forStudent(String studentId) async {
    final json = await _remote.get('/students/$studentId/leave');
    return [
      for (final item in json as List)
        LeaveRequest.fromJson(Map<String, dynamic>.from(item as Map)),
    ];
  }

  @override
  Future<void> apply(LeaveRequest request) =>
      _remote.post('/leave', request.toJson());

  @override
  Future<void> review({
    required String id,
    required LeaveStatus status,
    required String reviewer,
    String? note,
  }) => _remote.post('/leave/$id/review', {
    'status': status.name,
    'reviewer': reviewer,
    'note': ?note,
  });
}

abstract class GalleryRepository {
  Future<List<GalleryAlbum>> all();
}

class MockGalleryRepository implements GalleryRepository {
  MockGalleryRepository(this._ds);

  final MockJsonDataSource _ds;

  @override
  Future<List<GalleryAlbum>> all() => _ds.guard(() => [..._ds.albums]);
}

class RemoteGalleryRepository implements GalleryRepository {
  RemoteGalleryRepository(this._remote);

  final RemoteDataSource _remote;

  @override
  Future<List<GalleryAlbum>> all() async {
    final json = await _remote.get('/gallery');
    return [
      for (final item in json as List)
        GalleryAlbum.fromJson(Map<String, dynamic>.from(item as Map)),
    ];
  }
}

abstract class NotificationRepository {
  Future<List<AppNotification>> forUser(String userId);

  Future<void> dismiss(String id);

  Future<void> markAllRead(String userId);
}

class MockNotificationRepository implements NotificationRepository {
  MockNotificationRepository(this._ds);

  final MockJsonDataSource _ds;

  @override
  Future<List<AppNotification>> forUser(String userId) => _ds.guard(() {
    final items =
        _ds.notifications.where((item) => item.userId == userId).toList()
          ..sort((a, b) => b.date.compareTo(a.date));
    return items;
  });

  @override
  Future<void> dismiss(String id) =>
      _ds.guard(() => _ds.dismissNotification(id));

  @override
  Future<void> markAllRead(String userId) =>
      _ds.guard(() => _ds.markNotificationsRead(userId));
}

class RemoteNotificationRepository implements NotificationRepository {
  RemoteNotificationRepository(this._remote);

  final RemoteDataSource _remote;

  @override
  Future<List<AppNotification>> forUser(String userId) async {
    final json = await _remote.get('/users/$userId/notifications');
    return [
      for (final item in json as List)
        AppNotification.fromJson(Map<String, dynamic>.from(item as Map)),
    ];
  }

  @override
  Future<void> dismiss(String id) =>
      _remote.post('/notifications/$id/dismiss', {});

  @override
  Future<void> markAllRead(String userId) =>
      _remote.post('/users/$userId/notifications/read', {});
}
