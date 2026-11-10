import { Injectable } from '@nestjs/common';
import { istToday, type BusPosition, type BusRouteInput, type BusRouteRow, type RiderInput, type RiderRow, type TransportView } from '@gradeon/contracts';
import { newId } from '@gradeon/db';
import { ApiError, forbidden, notFound } from '@gradeon/nest-kit';
import type { AuthedUser, TenantCtx } from '../tenancy/tenant.js';
import { HubService } from './hub.service.js';
import { AuditService, Messenger, SettingsService } from './support.js';

type User = { id: string; name: string };
const iso = (d: Date | null) => (d ? d.toISOString() : '');
// A position older than this is not "live": the app says when the bus was last seen instead.
const STALE_MS = 10 * 60_000;

/** Routes with their stops and times, who rides which bus to which stop, the route fee, and the bus's live position. */
@Injectable()
export class TransportService {
  constructor(
    private readonly audit: AuditService,
    private readonly hubs: HubService,
    private readonly messenger: Messenger,
    private readonly settings: SettingsService,
  ) {}

  async view(t: TenantCtx): Promise<TransportView> {
    return { routes: await this.routes(t), riders: await this.riders(t) };
  }

  async routes(t: TenantCtx, ids?: string[]): Promise<BusRouteRow[]> {
    const [routes, stops, riders, bus] = await Promise.all([
      t.pool.query('select * from transport_routes where ($1::text[] is null or id = any($1)) order by name', [ids ?? null]),
      t.pool.query('select s.*, (select count(*) from transport_assignments a where a.stop_id = s.id)::int riders from transport_stops s order by route_id, position'),
      t.pool.query("select route_id, count(*)::int n from transport_assignments a join students s on s.id = a.student_id and s.status = 'active' where route_id is not null group by route_id"),
      t.pool.query('select * from bus_positions'),
    ]);
    const n = new Map(riders.rows.map((r) => [r.route_id, r.n]));
    const pos = new Map(bus.rows.map((b) => [b.route_id, b]));
    return routes.rows.map((r) => ({
      id: r.id, name: r.name, vehicle: r.vehicle, driverName: r.driver_name, driverPhone: r.driver_phone, fee: r.fee, riders: n.get(r.id) ?? 0,
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
    const clash = (await t.pool.query('select id from transport_routes where lower(name) = lower($1) and id <> coalesce($2, \'\')', [b.name, id ?? null])).rows[0];
    if (clash) throw new ApiError('validation', 'Another route has that name.', { fields: { name: 'Choose another name.' } });
    const client = await t.pool.connect();
    try {
      await client.query('begin');
      if (id) {
        const r = await client.query('update transport_routes set name = $2, vehicle = $3, driver_name = $4, driver_phone = $5, fee = $6 where id = $1', [id, b.name, b.vehicle, b.driverName, b.driverPhone, b.fee]);
        if (!r.rowCount) throw notFound('That route');
      } else {
        id = newId('rte');
        await client.query('insert into transport_routes (id, name, vehicle, driver_name, driver_phone, fee) values ($1,$2,$3,$4,$5,$6)', [id, b.name, b.vehicle, b.driverName, b.driverPhone, b.fee]);
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
  async position(t: TenantCtx, user: AuthedUser, routeId: string, p: BusPosition): Promise<{ ok: true; told: number }> {
    const r = (await t.pool.query<{ driver_phone: string }>('select driver_phone from transport_routes where id = $1', [routeId])).rows[0];
    if (!r) throw notFound('That route');
    const me = (await t.pool.query<{ phone: string | null; kind: string }>('select phone, kind from users where id = $1', [user.id])).rows[0];
    const digits = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '').slice(-10);
    const driver = !!r.driver_phone && digits(me?.phone) === digits(r.driver_phone);
    if (me?.kind !== 'staff' || (!driver && !user.permissions.includes('transport.write'))) throw forbidden('Only the route’s driver can share the bus’s position.');
    await t.pool.query('insert into bus_positions (route_id, lat, lng, by_user) values ($1,$2,$3,$4) on conflict (route_id) do update set lat = excluded.lat, lng = excluded.lng, at = now(), by_user = excluded.by_user',
      [routeId, p.lat, p.lng, user.id]);
    return { ok: true, told: await this.tellNear(t, routeId, p) };
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

  /** What the app shows a family for one child: the route, the stop, the driver, and the bus with an ETA when it is live. */
  async forStudent(t: TenantCtx, studentId: string) {
    const a = (await t.pool.query<{ route_id: string | null; stop_id: string | null; route: string }>('select route_id, stop_id, route from transport_assignments where student_id = $1', [studentId])).rows[0];
    if (!a) return null;
    const route = a.route_id ? (await this.routes(t, [a.route_id]))[0] : undefined;
    if (!route) return { studentId, routeName: a.route, busNumber: '', etaMinutes: 0, progress: 0, live: false, lastSeen: null, driver: { name: '', phone: '', avatarUrl: '' }, stops: [] };
    const mine = route.stops.find((s) => s.id === a.stop_id);
    const live = !!route.bus && Date.now() - Date.parse(route.bus.at) < STALE_MS;
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
      studentId, routeName: route.name, busNumber: route.vehicle, etaMinutes: eta, progress, live, lastSeen: route.bus?.at ?? null, stopId: mine?.id ?? null,
      driver: { name: route.driverName, phone: route.driverPhone, avatarUrl: '' },
      stops: route.stops.map((s) => ({ id: s.id, name: s.name, time: s.pickup, lat: s.lat, lng: s.lng, isMine: s.id === mine?.id })),
    };
  }

  /** Routes this staff member drives, for the teacher app's "share the bus position" screen. */
  async myRoutes(t: TenantCtx, user: AuthedUser): Promise<{ id: string; name: string; vehicle: string }[]> {
    const me = (await t.pool.query<{ phone: string | null }>('select phone from users where id = $1', [user.id])).rows[0];
    const digits = (me?.phone ?? '').replace(/\D/g, '').slice(-10);
    const { rows } = await t.pool.query<{ id: string; name: string; vehicle: string }>(
      "select id, name, vehicle from transport_routes where ($1 <> '' and right(regexp_replace(driver_phone, '\\D', '', 'g'), 10) = $1) or $2 order by name",
      [digits, user.permissions.includes('transport.write')]);
    return rows;
  }
}
