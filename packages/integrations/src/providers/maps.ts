import { call } from '../http.js';
import type { Adapter } from '../types.js';

// Two points in Pune for the connection test: Shivajinagar to Swargate.
const A: [number, number] = [18.5308, 73.8475];
const B: [number, number] = [18.5018, 73.8636];

export const googleMaps: Adapter = {
  maps: {
    async eta(c, from, to) {
      const q = new URLSearchParams({ origins: from.join(','), destinations: to.join(','), mode: 'driving', departure_time: 'now', key: c.secrets.apiKey! });
      const r = await call(`https://maps.googleapis.com/maps/api/distancematrix/json?${q}`);
      const el = r.json?.rows?.[0]?.elements?.[0];
      if (r.json?.status !== 'OK' || el?.status !== 'OK') throw new Error(`Google Maps: ${r.json?.error_message ?? el?.status ?? r.json?.status}`);
      return { meters: el.distance.value, minutes: Math.max(1, Math.round((el.duration_in_traffic ?? el.duration).value / 60)) };
    },
    async staticMap(c, points) {
      if (!points.length) return null;
      const q = new URLSearchParams({ size: '640x320', scale: '2', key: c.secrets.apiKey! });
      for (const p of points) q.append('markers', p.join(','));
      return `https://maps.googleapis.com/maps/api/staticmap?${q}`;
    },
  },
  async test(c) {
    try {
      const r = await googleMaps.maps!.eta(c, A, B);
      return { ok: true, detail: `Shivajinagar to Swargate: ${r.minutes} minutes, ${(r.meters / 1000).toFixed(1)} km.` };
    } catch (e) {
      return { ok: false, detail: (e as Error).message };
    }
  },
};

export const mapbox: Adapter = {
  maps: {
    async eta(c, from, to) {
      const r = await call(`https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${from[1]},${from[0]};${to[1]},${to[0]}?overview=false&access_token=${c.secrets.accessToken}`);
      const route = r.json?.routes?.[0];
      if (!route) throw new Error(`Mapbox: ${r.json?.message ?? 'no route'}`);
      return { meters: Math.round(route.distance), minutes: Math.max(1, Math.round(route.duration / 60)) };
    },
    async staticMap(c, points) {
      if (!points.length) return null;
      const pins = points.map((p) => `pin-s(${p[1]},${p[0]})`).join(',');
      return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${pins}/auto/640x320@2x?access_token=${c.secrets.accessToken}`;
    },
  },
  async test(c) {
    try {
      const r = await mapbox.maps!.eta(c, A, B);
      return { ok: true, detail: `Shivajinagar to Swargate: ${r.minutes} minutes, ${(r.meters / 1000).toFixed(1)} km.` };
    } catch (e) {
      return { ok: false, detail: (e as Error).message };
    }
  },
};
