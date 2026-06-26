import {
  formatCityState,
  lookupCityFromLocation,
  searchLocalCities,
  type CityPoint,
} from './us-cities';

export type GeoPoint = { lat: number; lng: number; label: string };

const cache = new Map<string, GeoPoint | null>();
const suggestCache = new Map<string, GeoPoint[]>();

const PHOTON_TYPES = new Set([
  'city',
  'town',
  'village',
  'locality',
  'district',
  'county',
  'street',
  'house',
]);

function cityPointToGeo(city: CityPoint): GeoPoint {
  return { lat: city.lat, lng: city.lng, label: city.label };
}

function mergeSuggestions(query: string, lists: GeoPoint[][]): GeoPoint[] {
  const seen = new Set<string>();
  const merged: GeoPoint[] = [];

  for (const list of lists) {
    for (const hit of list) {
      const key = hit.label.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(hit);
    }
  }

  return rankSuggestions(query, merged);
}

function suggestionScore(query: string, hit: GeoPoint): number {
  const needle = query.toLowerCase().split(',')[0].trim();
  if (!needle) return 0;

  const city = hit.label.split(',')[0].trim().toLowerCase();
  if (city === needle) return 100;
  if (city.startsWith(needle)) return 80;
  if (city.includes(needle)) return 60;
  if (hit.label.toLowerCase().includes(needle)) return 40;
  return 0;
}

function rankSuggestions(query: string, hits: GeoPoint[]): GeoPoint[] {
  return [...hits]
    .filter((hit) => suggestionScore(query, hit) > 0)
    .sort((a, b) => suggestionScore(query, b) - suggestionScore(query, a));
}

async function photonSearch(input: string, limit = 8): Promise<GeoPoint[]> {
  const q = input.trim();
  if (q.length < 2) return [];

  try {
    const params = new URLSearchParams({
      q,
      limit: String(limit),
      lang: 'en',
    });

    const res = await fetch(`https://photon.komoot.io/api/?${params}`, {
      next: { revalidate: 60 * 60 * 24 },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];

    const data = (await res.json()) as {
      features: Array<{
        geometry: { coordinates: [number, number] };
        properties: {
          name?: string;
          city?: string;
          state?: string;
          countrycode?: string;
          type?: string;
        };
      }>;
    };

    const results: GeoPoint[] = [];

    for (const feature of data.features ?? []) {
      const props = feature.properties;
      if (props.countrycode !== 'US') continue;

      const type = props.type ?? '';
      if (type && !PHOTON_TYPES.has(type)) continue;

      const cityName = props.name ?? props.city;
      if (!cityName) continue;

      const label = formatCityState(cityName, props.state);
      if (!label.includes(',')) continue;

      results.push({
        lat: feature.geometry.coordinates[1],
        lng: feature.geometry.coordinates[0],
        label,
      });
    }

    return results;
  } catch {
    return [];
  }
}

export async function suggestUS(input: string, limit = 8): Promise<GeoPoint[]> {
  const q = input.trim();
  if (q.length < 2) return [];

  const cacheKey = `${q.toLowerCase()}|${limit}`;
  if (suggestCache.has(cacheKey)) return suggestCache.get(cacheKey)!;

  const local = searchLocalCities(q, limit).map(cityPointToGeo);
  const remote = await photonSearch(q, limit);
  const results = mergeSuggestions(q, [local, remote]).slice(0, limit);
  suggestCache.set(cacheKey, results);
  return results;
}

export async function geocodeUS(input: string): Promise<GeoPoint | null> {
  const key = input.trim().toLowerCase();
  if (!key) return null;
  if (cache.has(key)) return cache.get(key) ?? null;

  const local = searchLocalCities(input, 1).map(cityPointToGeo);
  if (local[0]) {
    cache.set(key, local[0]);
    return local[0];
  }

  const fromLabel = lookupCityFromLocation(input);
  if (fromLabel) {
    const point = cityPointToGeo(fromLabel);
    cache.set(key, point);
    return point;
  }

  const remote = await photonSearch(input, 1);
  const point = remote[0] ?? null;
  cache.set(key, point);
  return point;
}

/** Local-only lookup — safe to call thousands of times during job filtering. */
export function geocodeJobLocationLocal(location: string): GeoPoint | null {
  const loc = location.trim();
  if (!loc || /\bremote\b/i.test(loc)) return null;

  const key = `job:${loc.toLowerCase()}`;
  if (cache.has(key)) return cache.get(key) ?? null;

  const city = lookupCityFromLocation(loc);
  const point = city ? cityPointToGeo(city) : null;
  cache.set(key, point);
  return point;
}

/** @deprecated Use geocodeJobLocationLocal — avoids external API calls during filtering. */
export async function geocodeJobLocation(location: string): Promise<GeoPoint | null> {
  return geocodeJobLocationLocal(location);
}

export function milesBetween(a: GeoPoint, b: GeoPoint): number {
  const R = 3958.8;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}
