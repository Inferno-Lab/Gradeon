import 'package:gradeon/data/datasources/mock_json_datasource.dart';
import 'package:gradeon/data/datasources/remote_datasource.dart';
import 'package:gradeon/data/models/driver.dart';

/// A bus driver's trips: start, share where the bus is, mark each child, say it is running late, end.
abstract class DriverRepository {
  Future<List<DriverRoute>> day();

  /// Starts a trip on a route and returns its id.
  Future<String> start({required String routeId, required String kind});

  Future<void> end(String tripId);

  Future<void> position(String tripId, {required double lat, required double lng});

  Future<void> mark(String tripId, {required String studentId, required String event, String? stopId});

  Future<void> delay(String tripId, {required int minutes, required String reason});
}

/// The sample day: the first sample route, its stops, and the sample students riding it.
class MockDriverRepository implements DriverRepository {
  MockDriverRepository(this._ds);

  final MockJsonDataSource _ds;
  final _trips = <BusTrip>[];
  final _marks = <TripMark>[];

  @override
  Future<List<DriverRoute>> day() => _ds.guard(() {
    final route = _ds.transport.firstOrNull;
    if (route == null) return <DriverRoute>[];
    final riders = [for (final t in _ds.transport) ..._ds.students.where((s) => s.id == t.studentId)];
    return [
      DriverRoute(
        id: 'rte_mock',
        name: route.routeName,
        vehicle: route.busNumber,
        stops: [
          for (var i = 0; i < route.stops.length; i++)
            DriverStop(
              id: 'stop_$i',
              name: route.stops[i].name,
              time: route.stops[i].time,
              riders: [for (final s in riders.skip(i).take(i == route.stops.length - 1 ? riders.length : 1)) Rider(id: s.id, name: s.name, className: s.classId)],
            ),
        ],
        trips: List.of(_trips),
        marks: List.of(_marks),
      ),
    ];
  });

  @override
  Future<String> start({required String routeId, required String kind}) => _ds.guard(() {
    final id = 'trip_${_trips.length + 1}';
    _trips.add(BusTrip(id: id, kind: kind, startedAt: DateTime.now()));
    return id;
  });

  @override
  Future<void> end(String tripId) => _ds.guard(() {
    final i = _trips.indexWhere((t) => t.id == tripId);
    if (i >= 0) _trips[i] = BusTrip(id: tripId, kind: _trips[i].kind, startedAt: _trips[i].startedAt, endedAt: DateTime.now(), lateMinutes: _trips[i].lateMinutes);
  });

  @override
  Future<void> position(String tripId, {required double lat, required double lng}) => _ds.guard(() {});

  @override
  Future<void> mark(String tripId, {required String studentId, required String event, String? stopId}) => _ds.guard(() {
    _marks
      ..removeWhere((m) => m.tripId == tripId && m.studentId == studentId)
      ..add(TripMark(tripId: tripId, studentId: studentId, event: event));
  });

  @override
  Future<void> delay(String tripId, {required int minutes, required String reason}) => _ds.guard(() {
    final i = _trips.indexWhere((t) => t.id == tripId);
    if (i >= 0) _trips[i] = BusTrip(id: tripId, kind: _trips[i].kind, startedAt: _trips[i].startedAt, lateMinutes: minutes);
  });
}

class RemoteDriverRepository implements DriverRepository {
  RemoteDriverRepository(this._remote);

  final RemoteDataSource _remote;

  @override
  Future<List<DriverRoute>> day() async {
    final json = Map<String, dynamic>.from(await _remote.get('/driver/day') as Map);
    return [for (final r in (json['routes'] as List? ?? const [])) DriverRoute.fromJson(Map<String, dynamic>.from(r as Map))];
  }

  @override
  Future<String> start({required String routeId, required String kind}) async {
    final json = Map<String, dynamic>.from(await _remote.post('/driver/trips', {'routeId': routeId, 'kind': kind}) as Map);
    return json['id'] as String;
  }

  @override
  Future<void> end(String tripId) => _remote.post('/driver/trips/$tripId/end', const {});

  @override
  Future<void> position(String tripId, {required double lat, required double lng}) => _remote.post('/driver/trips/$tripId/position', {'lat': lat, 'lng': lng});

  @override
  Future<void> mark(String tripId, {required String studentId, required String event, String? stopId}) =>
      _remote.post('/driver/trips/$tripId/marks', {'studentId': studentId, 'event': event, 'stopId': stopId});

  @override
  Future<void> delay(String tripId, {required int minutes, required String reason}) =>
      _remote.post('/driver/trips/$tripId/delay', {'minutes': minutes, 'reason': reason});
}
