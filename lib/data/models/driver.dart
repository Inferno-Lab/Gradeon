/// A bus driver's day: their routes, each stop's riders, today's trips and the boarding marks (GET /v1/f/driver/day).
class DriverRoute {
  const DriverRoute({required this.id, required this.name, required this.vehicle, required this.stops, required this.trips, required this.marks});

  factory DriverRoute.fromJson(Map<String, dynamic> j) => DriverRoute(
    id: j['id'] as String,
    name: j['name'] as String? ?? '',
    vehicle: j['vehicle'] as String? ?? '',
    stops: [for (final s in (j['stops'] as List? ?? const [])) DriverStop.fromJson(Map<String, dynamic>.from(s as Map))],
    trips: [for (final t in (j['trips'] as List? ?? const [])) BusTrip.fromJson(Map<String, dynamic>.from(t as Map))],
    marks: [for (final m in (j['marks'] as List? ?? const [])) TripMark.fromJson(Map<String, dynamic>.from(m as Map))],
  );

  final String id;
  final String name;
  final String vehicle;
  final List<DriverStop> stops;
  final List<BusTrip> trips;
  final List<TripMark> marks;

  /// The trip under way now, if one is.
  BusTrip? get running => trips.where((t) => t.endedAt == null).firstOrNull;
}

class DriverStop {
  const DriverStop({required this.id, required this.name, required this.time, required this.riders});

  factory DriverStop.fromJson(Map<String, dynamic> j) => DriverStop(
    id: j['id'] as String,
    name: j['name'] as String? ?? '',
    time: j['pickup'] as String? ?? j['time'] as String? ?? '',
    riders: [for (final r in (j['riders'] is List ? j['riders'] as List : const [])) Rider.fromJson(Map<String, dynamic>.from(r as Map))],
  );

  final String id;
  final String name;
  final String time;
  final List<Rider> riders;
}

class Rider {
  const Rider({required this.id, required this.name, required this.className});

  factory Rider.fromJson(Map<String, dynamic> j) => Rider(id: j['id'] as String, name: j['name'] as String? ?? '', className: j['className'] as String? ?? '');

  final String id;
  final String name;
  final String className;
}

class BusTrip {
  const BusTrip({required this.id, required this.kind, required this.startedAt, this.endedAt, this.lateMinutes = 0});

  factory BusTrip.fromJson(Map<String, dynamic> j) => BusTrip(
    id: j['id'] as String,
    kind: j['kind'] as String? ?? 'morning',
    startedAt: DateTime.parse(j['startedAt'] as String),
    endedAt: j['endedAt'] == null ? null : DateTime.parse(j['endedAt'] as String),
    lateMinutes: (j['lateMinutes'] as num?)?.toInt() ?? 0,
  );

  final String id;
  final String kind;
  final DateTime startedAt;
  final DateTime? endedAt;
  final int lateMinutes;
}

/// A child boarded, was dropped, or did not come, on one trip.
class TripMark {
  const TripMark({required this.tripId, required this.studentId, required this.event});

  factory TripMark.fromJson(Map<String, dynamic> j) => TripMark(tripId: j['tripId'] as String, studentId: j['studentId'] as String, event: j['event'] as String);

  final String tripId;
  final String studentId;
  final String event;
}
