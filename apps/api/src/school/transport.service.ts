import { Injectable, type OnModuleInit } from '@nestjs/common';
import { istToday, type BusPosition, type BusRouteInput, type BusRouteRow, type RiderInput, type RiderRow, type TransportView } from '@gradeon/contracts';
import { enqueue, newId, type Job } from '@gradeon/db';
import { ApiError, forbidden, notFound } from '@gradeon/nest-kit';
import { TenantService, type AuthedUser, type TenantCtx } from '../tenancy/tenant.js';
import { HubService } from './hub.service.js';
import { StreamService } from './stream.service.js';
import { AuditService, Messenger, SettingsService } from './support.js';

type User = { id: string; name: string };
const iso = (d: Date | null) => (d ? d.toISOString() : '');
// A position older than this is not "live": the app says when the bus was last seen instead.
const STALE_MS = 10 * 60_000;

/** Routes with their stops and times, who rides which bus to which stop, the route fee, and the bus's live position. */
@Injectable()
export class TransportService implements OnModuleInit {
  constructor(
    private readonly audit: AuditService,
    private readonly hubs: HubService,
    private readonly messenger: Messenger,
    private readonly settings: SettingsService,
    private readonly stream: StreamService,
    private readonly tenants: TenantService,
  ) {}

  onModuleInit(): void {
    // While a trip with a GPS tracker runs, positions are read every 30 seconds; the job stops renewing itself when none runs.
    this.hubs.handle('transport.poll', async (job: Job) => {
      const s = await this.hubs.schoolPool(job.schoolId ?? '');
      if (!s) return 'School not found.';
      const t = await this.tenants.resolve(s.slug);
      const moved = await this.pollTrackers(t);
      const still = (await t.pool.query("select 1 from bus_trips b join transport_routes r on r.id = b.route_id where b.day = $1 and b.ended_at is null and r.tracker_id <> '' limit 1", [istToday()])).rowCount;
      if (still) await enqueue(this.hubs.hub.o.pool as never, 'transport.poll', s.id, { at: Date.now() }, new Date(Date.now() + 30_000));
      return `${moved} buses moved.`;
    });
  }

  async view(t: TenantCtx): Promise<TransportView> {
    return { routes: await this.routes(t), riders: await this.riders(t) };
  }

  async routes(t: TenantCtx, ids?: string[]): Promise<BusRouteRow[]> {
    const [routes, stops, riders, bus, trips] = await Promise.all([
      t.pool.query('select r.*, u.name driver_user_name, u.phone driver_user_phone from transport_routes r left join users u on u.id = r.driver_user_id where ($1::text[] is null or r.id = any($1)) order by r.name', [ids ?? null]),
      t.pool.query('select s.*, (select count(*) from transport_assignments a where a.stop_id = s.id)::int riders from transport_stops s order by route_id, position'),
      t.pool.query("select route_id, count(*)::int n from transport_assignments a join students s on s.id = a.student_id and s.status = 'active' where route_id is not null group by route_id"),
      t.pool.query('select * from bus_positions'),
      t.pool.query(`select b.*, (select count(*) filter (where m.event = 'boarded') from bus_trip_marks m where m.trip_id = b.id)::int boarded,
        (select count(*) filter (where m.event = 'dropped') from bus_trip_marks m where m.trip_id = b.id)::int dropped,
        (select count(*) filter (where m.event = 'absent') from bus_trip_marks m where m.trip_id = b.id)::int absent from bus_trips b where b.day = $1 order by b.started_at`, [istToday()]),
    ]);
    const n = new Map(riders.rows.map((r) => [r.route_id, r.n]));
    const pos = new Map(bus.rows.map((b) => [b.route_id, b]));
    return routes.rows.map((r) => ({
      id: r.id, name: r.name, vehicle: r.vehicle, driverUserId: r.driver_user_id, driverName: r.driver_user_name ?? r.driver_name, driverPhone: r.driver_user_phone ?? r.driver_phone,
      attendantName: r.attendant_name, attendantPhone: r.attendant_phone, trackerId: r.tracker_id, fee: r.fee, riders: n.get(r.id) ?? 0,
      trips: trips.rows.filter((x) => x.route_id === r.id).map((x) => ({ id: x.id, kind: x.kind, startedAt: x.started_at.toISOString(), endedAt: x.ended_at?.toISOString() ?? null, lateMinutes: x.late_minutes, lateReason: x.late_reason, boarded: x.boarded, dropped: x.dropped, absent: x.absent })),
      stops: stops.rows.filter((s) => s.route_id === r.id).map((s) => ({ id: s.id, name: s.name, position: s.position, pickup: s.pickup, dropTime: s.drop_time, lat: s.lat, lng: s.lng, riders: s.riders })),
      bus: pos.get(r.id) ? { lat: pos.get(r.id).lat, lng: pos.get(r.id).lng, at: iso(pos.get(r.id).at) } : null,
    }));
  }

  async riders(t: TenantCtx): Promise<RiderRow[]> {
    const { rows } = await t.pool.query(
      `select s.id, s.name, c.name class_name, a.route_id, a.stop_id from students s join classes c on c.id = s.class_id left join transport_assignments a on a.student_id = s.id
       where s.status = 'active' order by c.grade, c.section, s.roll_no, s.name`);
    return rows.map((r) => ({ studentId: r.id, student: r.name, className: r.class_name, routeId: r.route_id, stopId: r.stop_id }));
  }

  async saveRoute(t: TenantCtx, user: User, b: BusRouteInput, id?: string): Promise<BusRouteRow> {
    if (b.driverUserId && !(await t.pool.query("select 1 from users where id = $1 and kind = 'staff' and status = 'active'", [b.driverUserId])).rowCount) throw new ApiError('validation', 'Choose the driver from the staff list.', { fields: { driverUserId: 'Choose a member of staff.' } });
    const clash = (await t.pool.query('select id from transport_routes where lower(name) = lower($1) and id <> coalesce($2, \'\')', [b.name, id ?? null])).rows[0];
    if (clash) throw new ApiError('validation', 'Another route has that name.', { fields: { name: 'Choose another name.' } });
    const client = await t.pool.connect();
    try {
      await client.query('begin');
      if (id) {
        const r = await client.query('update transport_routes set name = $2, vehicle = $3, driver_user_id = $4, attendant_name = $5, attendant_phone = $6, tracker_id = $7, fee = $8 where id = $1',
          [id, b.name, b.vehicle, b.driverUserId, b.attendantName, b.attendantPhone, b.trackerId, b.fee]);
        if (!r.rowCount) throw notFound('That route');
      } else {
        id = newId('rte');
        await client.query('insert into transport_routes (id, name, vehicle, driver_user_id, attendant_name, attendant_phone, tracker_id, fee) values ($1,$2,$3,$4,$5,$6,$7,$8)',
          [id, b.name, b.vehicle, b.driverUserId, b.attendantName, b.attendantPhone, b.trackerId, b.fee]);
      }
      // Stops are replaced in order; a stop kept by its ID keeps its riders.
      const keep = b.stops.map((s) => s.id).filter((x): x is string => !!x);
      await client.query('delete from transport_stops where route_id = $1 and not (id = any($2))', [id, keep]);
      for (const [i, s] of b.stops.entries()) {
        await client.query(
          `insert into transport_stops (id, route_id, name, position, pickup, drop_time, lat, lng) values ($1,$2,$3,$4,$5,$6,$7,$8)
           on conflict (id) do update set name = excluded.name, position = excluded.position, pickup = excluded.pickup, drop_time = excluded.drop_time, lat = excluded.lat, lng = excluded.lng`,
          [s.id ?? newId('stp'), id, s.name, i + 1, s.pickup, s.dropTime, s.lat, s.lng]);
      }
      await client.query('update transport_assignments set route = $2 where route_id = $1', [id, b.name]);
      await client.query('commit');
    } catch (e) {
      await client.query('rollback').catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'transport.route.saved', entity: 'route', entityId: id, detail: { name: b.name, stops: b.stops.length } });
    return (await this.routes(t, [id!]))[0]!;
  }

  async deleteRoute(t: TenantCtx, user: User, id: string): Promise<void> {
    const n = Number((await t.pool.query<{ n: string }>('select count(*) n from transport_assignments where route_id = $1', [id])).rows[0]!.n);
    if (n) throw new ApiError('conflict', `${n} students ride this route. Move them to another route first.`);
    const r = await t.pool.query('delete from transport_routes where id = $1 returning name', [id]);
    if (!r.rowCount) throw notFound('That route');
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'transport.route.deleted', entity: 'route', entityId: id, detail: { name: r.rows[0].name } });
  }

  /** Puts a student on a route and stop, or takes them off (routeId null). */
  async setRider(t: TenantCtx, user: User, b: RiderInput): Promise<void> {
    if (!b.routeId) {
      await t.pool.query('delete from transport_assignments where student_id = $1', [b.studentId]);
    } else {
      const r = (await t.pool.query<{ name: string }>('select name from transport_routes where id = $1', [b.routeId])).rows[0];
      if (!r) throw notFound('That route');
      if (b.stopId && !(await t.pool.query('select 1 from transport_stops where id = $1 and route_id = $2', [b.stopId, b.routeId])).rowCount) throw new ApiError('validation', 'That stop is not on this route.');
      await t.pool.query(
        `insert into transport_assignments (student_id, route, route_id, stop_id) values ($1,$2,$3,$4)
         on conflict (student_id) do update set route = excluded.route, route_id = excluded.route_id, stop_id = excluded.stop_id`, [b.studentId, r.name, b.routeId, b.stopId]);
    }
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'transport.rider', entity: 'student', entityId: b.studentId, detail: { routeId: b.routeId, stopId: b.stopId } });
  }

  /**
   * The bus's position, from the driver's phone (the teacher app, a staff member who drives the route or may manage transport).
   * Families at stops the bus is now near are told once a day.
   */
  /** Places for a stop, from the school's maps connection; none on the test track (stops are placed once maps are set up). */
  async places(t: TenantCtx, q: string): Promise<{ label: string; lat: number; lng: number }[]> {
    const maps = await this.hubs.hub.resolve('maps', t.info.id, t.info.slug).catch(() => null);
    if (!maps?.adapter.maps || maps.sandbox) return [];
    return maps.adapter.maps.geocode(maps.ctx, q);
  }

  /** A picture of a route: its stops and, while a trip runs, the bus. Null without a maps connection. */
  async routeMap(t: TenantCtx, routeId: string): Promise<{ url: string | null }> {
    const maps = await this.hubs.hub.resolve('maps', t.info.id, t.info.slug).catch(() => null);
    if (!maps?.adapter.maps || maps.sandbox) return { url: null };
    const stops = (await t.pool.query<{ lat: number; lng: number }>('select lat, lng from transport_stops where route_id = $1 and lat is not null order by position', [routeId])).rows;
    const bus = (await this.view(t)).routes.find((r) => r.id === routeId)?.bus;
    return { url: await maps.adapter.maps.staticMap(maps.ctx, [...(bus ? [[bus.lat, bus.lng] as [number, number]] : []), ...stops.map((p) => [p.lat, p.lng] as [number, number])]) };
  }

  /**
   * Bills every rider of a route its fee, as a Transport fee (the route is the one home of what transport costs). A rider who
   * already has a fee with the same name is skipped, so billing twice adds nothing.
   */
  async billRiders(t: TenantCtx, user: { id: string; name: string }, routeId: string, b: { title: string; dueOn: string }): Promise<{ created: number; skipped: number }> {
    const r = (await t.pool.query<{ name: string; fee: number }>('select name, fee from transport_routes where id = $1', [routeId])).rows[0];
    if (!r) throw notFound('That route');
    if (!r.fee) throw new ApiError('validation', 'This route has no fee. Set it on the route first.');
    await t.pool.query("insert into fee_heads (key, name, sort, concession) values ('transport', 'Transport', 800, false) on conflict (key) do nothing");
    const riders = (await t.pool.query<{ student_id: string }>("select a.student_id from transport_assignments a join students s on s.id = a.student_id and s.status = 'active' where a.route_id = $1", [routeId])).rows.map((x) => x.student_id);
    let created = 0;
    for (const sid of riders) {
      if ((await t.pool.query('select 1 from fee_invoices where student_id = $1 and title = $2', [sid, b.title])).rowCount) continue;
      await t.pool.query("insert into fee_invoices (id, student_id, head, title, amount, due_on) values ($1,$2,'transport',$3,$4,$5)", [newId('inv'), sid, b.title, r.fee, b.dueOn]);
      created++;
    }
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'transport.billed', entity: 'route', entityId: routeId, detail: { title: b.title, created } });
    return { created, skipped: riders.length - created };
  }

  /** The driver of a route (or someone who may change transport) may run its trips. */
  private async mayDrive(t: TenantCtx, user: AuthedUser, routeId: string): Promise<void> {
    const r = (await t.pool.query<{ driver_user_id: string | null }>('select driver_user_id from transport_routes where id = $1', [routeId])).rows[0];
    if (!r) throw notFound('That route');
    if (r.driver_user_id !== user.id && !user.permissions.includes('transport.write')) throw forbidden('Only the route’s driver can run its trips.');
  }

  /** The families of the children who ride a route: their accounts (for the live stream) and phones (for messages). */
  private async families(t: TenantCtx, routeId: string, studentId?: string): Promise<{ user_id: string | null; phone: string | null; student: string; stop: string | null }[]> {
    return (await t.pool.query(
      `select g.user_id, g.phone, st.name student, sp.name stop from transport_assignments a join students st on st.id = a.student_id and st.status = 'active'
       join student_guardians sg on sg.student_id = st.id join guardians g on g.id = sg.guardian_id left join transport_stops sp on sp.id = a.stop_id
       where a.route_id = $1 and ($2::text is null or st.id = $2)`, [routeId, studentId ?? null])).rows;
  }

  /** The driver's day: the routes they drive, today's trips, and each stop with who gets on or off there. */
  async driverDay(t: TenantCtx, user: AuthedUser) {
    const routes = (await t.pool.query<{ id: string }>('select id from transport_routes where driver_user_id = $1 order by name', [user.id])).rows.map((r) => r.id);
    if (!routes.length) return { routes: [] };
    const [rows, riders, marks] = await Promise.all([
      this.routes(t, routes),
      t.pool.query<{ route_id: string; stop_id: string | null; id: string; name: string; class_name: string }>(
        "select a.route_id, a.stop_id, s.id, s.name, c.name class_name from transport_assignments a join students s on s.id = a.student_id and s.status = 'active' join classes c on c.id = s.class_id where a.route_id = any($1) order by s.name", [routes]),
      t.pool.query<{ trip_id: string; student_id: string; event: string }>('select m.trip_id, m.student_id, m.event from bus_trip_marks m join bus_trips b on b.id = m.trip_id where b.day = $1 and b.route_id = any($2)', [istToday(), routes]),
    ]);
    return {
      routes: rows.map((r) => ({
        ...r,
        stops: r.stops.map((s) => ({ ...s, riders: riders.rows.filter((x) => x.route_id === r.id && x.stop_id === s.id).map((x) => ({ id: x.id, name: x.name, className: x.class_name })) })),
        marks: marks.rows.filter((m) => r.trips.some((tr) => tr.id === m.trip_id)).map((m) => ({ tripId: m.trip_id, studentId: m.student_id, event: m.event })),
      })),
    };
  }

  async startTrip(t: TenantCtx, user: AuthedUser, routeId: string, kind: 'morning' | 'afternoon') {
    await this.mayDrive(t, user, routeId);
    const day = istToday();
    const open = (await t.pool.query<{ id: string }>('select id from bus_trips where route_id = $1 and day = $2 and kind = $3', [routeId, day, kind])).rows[0];
    const id = open?.id ?? newId('trp');
    if (!open) await t.pool.query('insert into bus_trips (id, route_id, day, kind, driver_id) values ($1,$2,$3,$4,$5)', [id, routeId, day, kind, user.id]);
    else await t.pool.query('update bus_trips set ended_at = null where id = $1', [id]);
    const tracked = (await t.pool.query("select 1 from transport_routes where id = $1 and tracker_id <> ''", [routeId])).rowCount;
    if (tracked) await enqueue(this.hubs.hub.o.pool as never, 'transport.poll', t.info.id, { at: Date.now() }, new Date(Date.now() + 5_000));
    const fam = await this.families(t, routeId);
    await this.stream.emit(t, fam.map((f) => f.user_id).filter((x): x is string => !!x), { type: 'bus.trip', data: { routeId, tripId: id, kind, running: true } });
    return { id };
  }

  async endTrip(t: TenantCtx, user: AuthedUser, tripId: string) {
    const trip = await this.trip(t, user, tripId);
    await t.pool.query('update bus_trips set ended_at = now() where id = $1', [tripId]);
    const fam = await this.families(t, trip.route_id);
    await this.stream.emit(t, fam.map((f) => f.user_id).filter((x): x is string => !!x), { type: 'bus.trip', data: { routeId: trip.route_id, tripId, running: false } });
    return { ok: true };
  }

  private async trip(t: TenantCtx, user: AuthedUser, tripId: string): Promise<{ route_id: string; kind: string; ended_at: Date | null }> {
    const trip = (await t.pool.query<{ route_id: string; kind: string; ended_at: Date | null }>('select route_id, kind, ended_at from bus_trips where id = $1', [tripId])).rows[0];
    if (!trip) throw notFound('That trip');
    await this.mayDrive(t, user, trip.route_id);
    return trip;
  }

  /** The bus's position while a trip runs: families see it move, and those whose stop is near are told. */
  async tripPosition(t: TenantCtx, user: AuthedUser, tripId: string, p: BusPosition): Promise<{ ok: true; told: number }> {
    const trip = await this.trip(t, user, tripId);
    if (trip.ended_at) throw new ApiError('conflict', 'This trip has ended.');
    return this.savePosition(t, trip.route_id, p, user.id);
  }

  private async savePosition(t: TenantCtx, routeId: string, p: BusPosition, by: string | null): Promise<{ ok: true; told: number }> {
    await t.pool.query('insert into bus_positions (route_id, lat, lng, by_user) values ($1,$2,$3,$4) on conflict (route_id) do update set lat = excluded.lat, lng = excluded.lng, at = now(), by_user = excluded.by_user',
      [routeId, p.lat, p.lng, by]);
    const fam = await this.families(t, routeId);
    await this.stream.emit(t, fam.map((f) => f.user_id).filter((x): x is string => !!x), { type: 'bus.position', data: { routeId, lat: p.lat, lng: p.lng, at: new Date().toISOString() } });
    return { ok: true, told: await this.tellNear(t, routeId, p) };
  }

  /** The driver marks a child on or off the bus (or not there): the child's family is told at once. */
  async mark(t: TenantCtx, user: AuthedUser, tripId: string, m: { studentId: string; event: 'boarded' | 'dropped' | 'absent'; stopId: string | null }) {
    const trip = await this.trip(t, user, tripId);
    const rides = await t.pool.query('select 1 from transport_assignments where route_id = $1 and student_id = $2', [trip.route_id, m.studentId]);
    if (!rides.rowCount) throw new ApiError('validation', 'That child does not ride this bus.');
    await t.pool.query('insert into bus_trip_marks (trip_id, student_id, event, stop_id) values ($1,$2,$3,$4) on conflict (trip_id, student_id) do update set event = excluded.event, stop_id = excluded.stop_id, at = now()',
      [tripId, m.studentId, m.event, m.stopId]);
    const fam = await this.families(t, trip.route_id, m.studentId);
    const time = new Date().toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
    const event = m.event === 'boarded' ? 'got on' : m.event === 'dropped' ? 'got off' : 'was not at';
    await this.messenger.notify(t, 'bus.dropped', fam.filter((f) => f.phone).map((f) => ({ to: f.phone!, vars: { student: f.student, stop: f.stop ?? 'the stop', event, time } })));
    await this.stream.emit(t, fam.map((f) => f.user_id).filter((x): x is string => !!x), { type: 'bus.trip', data: { routeId: trip.route_id, tripId, studentId: m.studentId, event: m.event } });
    return { ok: true };
  }

  /** "Running late" or "broken down": every family on the route is told, and the office sees it on the route. */
  async delay(t: TenantCtx, user: AuthedUser, tripId: string, d: { minutes: number; reason: string }) {
    const trip = await this.trip(t, user, tripId);
    await t.pool.query('update bus_trips set late_minutes = $2, late_reason = $3 where id = $1', [tripId, d.minutes, d.reason]);
    const route = (await t.pool.query<{ name: string }>('select name from transport_routes where id = $1', [trip.route_id])).rows[0]!;
    const fam = await this.families(t, trip.route_id);
    const phones = [...new Set(fam.map((f) => f.phone).filter((x): x is string => !!x))];
    await this.messenger.notify(t, 'bus.late', phones.map((to) => ({ to, vars: { route: route.name, minutes: String(d.minutes), reason: d.reason } })));
    await this.audit.record(t, { actorId: user.id, actorName: user.name, action: 'transport.delay', entity: 'route', entityId: trip.route_id, detail: { ...d } });
    return { ok: true, told: phones.length };
  }

  /**
   * Buses with GPS trackers: while a trip runs, the tracker company's positions (Integrations → Bus trackers) stand in for the
   * driver's phone, matched by the bus's tracker number. Run every 30 seconds by the school API's worker.
   */
  async pollTrackers(t: TenantCtx): Promise<number> {
    const running = (await t.pool.query<{ route_id: string; tracker_id: string }>(
      "select b.route_id, r.tracker_id from bus_trips b join transport_routes r on r.id = b.route_id where b.day = $1 and b.ended_at is null and r.tracker_id <> ''", [istToday()])).rows;
    if (!running.length) return 0;
    const r = await this.hubs.hub.resolve('tracking', t.info.id, t.info.slug).catch(() => null);
    if (!r?.adapter.tracking) return 0;
    const positions = await r.adapter.tracking.positions(r.ctx);
    let moved = 0;
    for (const run of running) {
      const p = positions.find((x) => x.vehicle.replace(/\s/g, '').toLowerCase() === run.tracker_id.replace(/\s/g, '').toLowerCase());
      if (p) { await this.savePosition(t, run.route_id, { lat: p.lat, lng: p.lng }, null); moved++; }
    }
    return moved;
  }

  private async tellNear(t: TenantCtx, routeId: string, p: BusPosition): Promise<number> {
    const cfg = await this.settings.effective(t);
    if (!cfg.features.includes('transport.liveBus')) return 0;
    const near = await this.settings.value<number>(t, 'transport.nearMinutes', 10);
    const today = istToday();
    const stops = (await t.pool.query<{ id: string; name: string; lat: number; lng: number }>(
      'select id, name, lat, lng from transport_stops s where route_id = $1 and lat is not null and not exists (select 1 from bus_near_sent n where n.stop_id = s.id and n.day = $2)', [routeId, today])).rows;
    const maps = await this.hubs.hub.resolve('maps', t.info.id, t.info.slug).catch(() => null);
    let told = 0;
    for (const s of stops) {
      const eta = await maps?.adapter.maps?.eta(maps.ctx, [p.lat, p.lng], [s.lat, s.lng]).catch(() => null);
      if (!eta || eta.minutes > near) continue;
      const claimed = await t.pool.query('insert into bus_near_sent (stop_id, day) values ($1,$2) on conflict do nothing', [s.id, today]);
      if (!claimed.rowCount) continue;
      const fams = (await t.pool.query<{ phone: string | null; student: string }>(
        `select g.phone, st.name student from transport_assignments a join students st on st.id = a.student_id and st.status = 'active'
         join student_guardians sg on sg.student_id = st.id and sg.is_primary join guardians g on g.id = sg.guardian_id where a.stop_id = $1`, [s.id])).rows;
      told += await this.messenger.notify(t, 'bus.near', fams.filter((f) => f.phone).map((f) => ({ to: f.phone!, vars: { student: f.student, stop: s.name, minutes: String(eta.minutes) } })));
    }
    return told;
  }

  /**
   * What the app shows a family for one child: the route, the child's own stop, today's trips (running or not, late or not),
   * whether the child got on and off, the bus with an ETA while a trip runs, and whom to call (never the driver).
   */
  async forStudent(t: TenantCtx, studentId: string) {
    const a = (await t.pool.query<{ route_id: string | null; stop_id: string | null; route: string }>('select route_id, stop_id, route from transport_assignments where student_id = $1', [studentId])).rows[0];
    if (!a) return null;
    const route = a.route_id ? (await this.routes(t, [a.route_id]))[0] : undefined;
    const calls = await this.settings.value<string>(t, 'transport.familyCalls', 'office');
    const office = await this.settings.value<string>(t, 'school.phone', '');
    if (!route) return { studentId, routeName: a.route, busNumber: '', etaMinutes: 0, progress: 0, live: false, running: false, lastSeen: null, trips: [], marks: [], call: null, stops: [] };
    const marks = (await t.pool.query<{ trip_id: string; event: string; at: Date }>('select trip_id, event, at from bus_trip_marks where student_id = $1 and trip_id = any($2)', [studentId, route.trips.map((x) => x.id)])).rows;
    const running = route.trips.some((x) => !x.endedAt);
    const mine = route.stops.find((s) => s.id === a.stop_id);
    const live = running && !!route.bus && Date.now() - Date.parse(route.bus.at) < STALE_MS;
    let eta = 0;
    let progress = 0;
    if (live && mine?.lat != null && mine.lng != null) {
      const maps = await this.hubs.hub.resolve('maps', t.info.id, t.info.slug).catch(() => null);
      const r = await maps?.adapter.maps?.eta(maps.ctx, [route.bus!.lat, route.bus!.lng], [mine.lat, mine.lng]).catch(() => null);
      eta = r?.minutes ?? 0;
      // How far along the route the bus is: the stop nearest the bus, out of all of them.
      const located = route.stops.filter((s) => s.lat != null && s.lng != null);
      const nearest = located.reduce<{ i: number; d: number }>((best, s, i) => {
        const d = (s.lat! - route.bus!.lat) ** 2 + (s.lng! - route.bus!.lng) ** 2;
        return d < best.d ? { i, d } : best;
      }, { i: 0, d: Infinity });
      progress = located.length > 1 ? nearest.i / (located.length - 1) : 0;
    }
    return {
      studentId, routeName: route.name, busNumber: route.vehicle, etaMinutes: eta, progress, live, running, lastSeen: route.bus?.at ?? null, stopId: mine?.id ?? null,
      trips: route.trips, marks: marks.map((m) => ({ tripId: m.trip_id, event: m.event, at: m.at.toISOString() })),
      bus: live ? route.bus : null,
      driverName: route.driverName,
      // Whom to call about the bus: the attendant or the office, as the school chose; never the driver, who is driving.
      call: calls === 'attendant' && route.attendantPhone ? { name: route.attendantName || 'Bus attendant', phone: route.attendantPhone } : calls === 'none' || !office ? null : { name: 'School office', phone: office },
      stops: route.stops.map((s) => ({ id: s.id, name: s.name, time: s.pickup, lat: s.lat, lng: s.lng, isMine: s.id === mine?.id })),
    };
  }
}
