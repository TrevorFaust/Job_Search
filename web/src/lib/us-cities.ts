export type CityPoint = { label: string; lat: number; lng: number; city: string; state: string };

/** Major US job-market cities — instant fallback when remote geocoders rate-limit. */
export const US_CITIES: CityPoint[] = [
  { city: 'New York', state: 'NY', label: 'New York, NY', lat: 40.7128, lng: -74.006 },
  { city: 'Los Angeles', state: 'CA', label: 'Los Angeles, CA', lat: 34.0522, lng: -118.2437 },
  { city: 'Chicago', state: 'IL', label: 'Chicago, IL', lat: 41.8781, lng: -87.6298 },
  { city: 'Houston', state: 'TX', label: 'Houston, TX', lat: 29.7604, lng: -95.3698 },
  { city: 'Phoenix', state: 'AZ', label: 'Phoenix, AZ', lat: 33.4484, lng: -112.074 },
  { city: 'Philadelphia', state: 'PA', label: 'Philadelphia, PA', lat: 39.9526, lng: -75.1652 },
  { city: 'San Antonio', state: 'TX', label: 'San Antonio, TX', lat: 29.4241, lng: -98.4936 },
  { city: 'San Diego', state: 'CA', label: 'San Diego, CA', lat: 32.7157, lng: -117.1611 },
  { city: 'Dallas', state: 'TX', label: 'Dallas, TX', lat: 32.7767, lng: -96.797 },
  { city: 'San Jose', state: 'CA', label: 'San Jose, CA', lat: 37.3382, lng: -121.8863 },
  { city: 'Austin', state: 'TX', label: 'Austin, TX', lat: 30.2672, lng: -97.7431 },
  { city: 'Jacksonville', state: 'FL', label: 'Jacksonville, FL', lat: 30.3322, lng: -81.6557 },
  { city: 'Fort Worth', state: 'TX', label: 'Fort Worth, TX', lat: 32.7555, lng: -97.3308 },
  { city: 'Columbus', state: 'OH', label: 'Columbus, OH', lat: 39.9612, lng: -82.9988 },
  { city: 'Charlotte', state: 'NC', label: 'Charlotte, NC', lat: 35.2271, lng: -80.8431 },
  { city: 'San Francisco', state: 'CA', label: 'San Francisco, CA', lat: 37.7749, lng: -122.4194 },
  { city: 'Indianapolis', state: 'IN', label: 'Indianapolis, IN', lat: 39.7684, lng: -86.1581 },
  { city: 'Seattle', state: 'WA', label: 'Seattle, WA', lat: 47.6062, lng: -122.3321 },
  { city: 'Denver', state: 'CO', label: 'Denver, CO', lat: 39.7392, lng: -104.9903 },
  { city: 'Boston', state: 'MA', label: 'Boston, MA', lat: 42.3601, lng: -71.0589 },
  { city: 'Nashville', state: 'TN', label: 'Nashville, TN', lat: 36.1627, lng: -86.7816 },
  { city: 'Detroit', state: 'MI', label: 'Detroit, MI', lat: 42.3314, lng: -83.0458 },
  { city: 'Portland', state: 'OR', label: 'Portland, OR', lat: 45.5152, lng: -122.6784 },
  { city: 'Memphis', state: 'TN', label: 'Memphis, TN', lat: 35.1495, lng: -90.049 },
  { city: 'Louisville', state: 'KY', label: 'Louisville, KY', lat: 38.2527, lng: -85.7585 },
  { city: 'Baltimore', state: 'MD', label: 'Baltimore, MD', lat: 39.2904, lng: -76.6122 },
  { city: 'Milwaukee', state: 'WI', label: 'Milwaukee, WI', lat: 43.0389, lng: -87.9065 },
  { city: 'Albuquerque', state: 'NM', label: 'Albuquerque, NM', lat: 35.0844, lng: -106.6504 },
  { city: 'Tucson', state: 'AZ', label: 'Tucson, AZ', lat: 32.2226, lng: -110.9747 },
  { city: 'Fresno', state: 'CA', label: 'Fresno, CA', lat: 36.7378, lng: -119.7871 },
  { city: 'Sacramento', state: 'CA', label: 'Sacramento, CA', lat: 38.5816, lng: -121.4944 },
  { city: 'Atlanta', state: 'GA', label: 'Atlanta, GA', lat: 33.749, lng: -84.388 },
  { city: 'Miami', state: 'FL', label: 'Miami, FL', lat: 25.7617, lng: -80.1918 },
  { city: 'Oakland', state: 'CA', label: 'Oakland, CA', lat: 37.8044, lng: -122.2712 },
  { city: 'Minneapolis', state: 'MN', label: 'Minneapolis, MN', lat: 44.9778, lng: -93.265 },
  { city: 'Cleveland', state: 'OH', label: 'Cleveland, OH', lat: 41.4993, lng: -81.6944 },
  { city: 'Tampa', state: 'FL', label: 'Tampa, FL', lat: 27.9506, lng: -82.4572 },
  { city: 'New Orleans', state: 'LA', label: 'New Orleans, LA', lat: 29.9511, lng: -90.0715 },
  { city: 'Honolulu', state: 'HI', label: 'Honolulu, HI', lat: 21.3069, lng: -157.8583 },
  { city: 'Salt Lake City', state: 'UT', label: 'Salt Lake City, UT', lat: 40.7608, lng: -111.891 },
  { city: 'Raleigh', state: 'NC', label: 'Raleigh, NC', lat: 35.7796, lng: -78.6382 },
  { city: 'Omaha', state: 'NE', label: 'Omaha, NE', lat: 41.2565, lng: -95.9345 },
  { city: 'Pittsburgh', state: 'PA', label: 'Pittsburgh, PA', lat: 40.4406, lng: -79.9959 },
  { city: 'Cincinnati', state: 'OH', label: 'Cincinnati, OH', lat: 39.1031, lng: -84.512 },
  { city: 'St. Louis', state: 'MO', label: 'St. Louis, MO', lat: 38.627, lng: -90.1994 },
  { city: 'Kansas City', state: 'MO', label: 'Kansas City, MO', lat: 39.0997, lng: -94.5786 },
  { city: 'Las Vegas', state: 'NV', label: 'Las Vegas, NV', lat: 36.1699, lng: -115.1398 },
  { city: 'Orlando', state: 'FL', label: 'Orlando, FL', lat: 28.5383, lng: -81.3792 },
  { city: 'Richmond', state: 'VA', label: 'Richmond, VA', lat: 37.5407, lng: -77.436 },
  { city: 'Boise', state: 'ID', label: 'Boise, ID', lat: 43.615, lng: -116.2023 },
  { city: 'Birmingham', state: 'AL', label: 'Birmingham, AL', lat: 33.5186, lng: -86.8104 },
  { city: 'Buffalo', state: 'NY', label: 'Buffalo, NY', lat: 42.8864, lng: -78.8784 },
  { city: 'Rochester', state: 'NY', label: 'Rochester, NY', lat: 43.1566, lng: -77.6088 },
  { city: 'Hartford', state: 'CT', label: 'Hartford, CT', lat: 41.7658, lng: -72.6734 },
  { city: 'Providence', state: 'RI', label: 'Providence, RI', lat: 41.824, lng: -71.4128 },
  { city: 'Des Moines', state: 'IA', label: 'Des Moines, IA', lat: 41.5868, lng: -93.625 },
  { city: 'Madison', state: 'WI', label: 'Madison, WI', lat: 43.0731, lng: -89.4012 },
  { city: 'Anchorage', state: 'AK', label: 'Anchorage, AK', lat: 61.2181, lng: -149.9003 },
  { city: 'Washington', state: 'DC', label: 'Washington, DC', lat: 38.9072, lng: -77.0369 },
  { city: 'Arlington', state: 'VA', label: 'Arlington, VA', lat: 38.8816, lng: -77.091 },
  { city: 'Alexandria', state: 'VA', label: 'Alexandria, VA', lat: 38.8048, lng: -77.0469 },
  { city: 'Cambridge', state: 'MA', label: 'Cambridge, MA', lat: 42.3736, lng: -71.1097 },
  { city: 'Ann Arbor', state: 'MI', label: 'Ann Arbor, MI', lat: 42.2808, lng: -83.743 },
  { city: 'Boulder', state: 'CO', label: 'Boulder, CO', lat: 40.015, lng: -105.2705 },
  { city: 'Durham', state: 'NC', label: 'Durham, NC', lat: 35.994, lng: -78.8986 },
  { city: 'Chattanooga', state: 'TN', label: 'Chattanooga, TN', lat: 35.0456, lng: -85.3097 },
  { city: 'Greenville', state: 'SC', label: 'Greenville, SC', lat: 34.8526, lng: -82.394 },
  { city: 'Knoxville', state: 'TN', label: 'Knoxville, TN', lat: 35.9606, lng: -83.9207 },
  { city: 'Lexington', state: 'KY', label: 'Lexington, KY', lat: 38.0406, lng: -84.5037 },
  { city: 'Little Rock', state: 'AR', label: 'Little Rock, AR', lat: 34.7465, lng: -92.2896 },
  { city: 'Oklahoma City', state: 'OK', label: 'Oklahoma City, OK', lat: 35.4676, lng: -97.5164 },
  { city: 'Tulsa', state: 'OK', label: 'Tulsa, OK', lat: 36.1539, lng: -95.9928 },
  { city: 'Wichita', state: 'KS', label: 'Wichita, KS', lat: 37.6872, lng: -97.3301 },
  { city: 'Spokane', state: 'WA', label: 'Spokane, WA', lat: 47.6588, lng: -117.426 },
  { city: 'Tacoma', state: 'WA', label: 'Tacoma, WA', lat: 47.2529, lng: -122.4443 },
  { city: 'Reno', state: 'NV', label: 'Reno, NV', lat: 39.5296, lng: -119.8138 },
  { city: 'Charleston', state: 'SC', label: 'Charleston, SC', lat: 32.7765, lng: -79.9311 },
  { city: 'Savannah', state: 'GA', label: 'Savannah, GA', lat: 32.0809, lng: -81.0912 },
  { city: 'Columbia', state: 'SC', label: 'Columbia, SC', lat: 34.0007, lng: -81.0348 },
  { city: 'Grand Rapids', state: 'MI', label: 'Grand Rapids, MI', lat: 42.9634, lng: -85.6681 },
  { city: 'Akron', state: 'OH', label: 'Akron, OH', lat: 41.0814, lng: -81.519 },
  { city: 'Dayton', state: 'OH', label: 'Dayton, OH', lat: 39.7589, lng: -84.1916 },
  { city: 'Toledo', state: 'OH', label: 'Toledo, OH', lat: 41.6528, lng: -83.5379 },
  { city: 'Youngstown', state: 'OH', label: 'Youngstown, OH', lat: 41.0998, lng: -80.6495 },
  { city: 'Kent', state: 'OH', label: 'Kent, OH', lat: 41.1537, lng: -81.3579 },
  { city: 'Canton', state: 'OH', label: 'Canton, OH', lat: 40.7989, lng: -81.3784 },
  { city: 'Irvine', state: 'CA', label: 'Irvine, CA', lat: 33.6846, lng: -117.8265 },
  { city: 'Santa Monica', state: 'CA', label: 'Santa Monica, CA', lat: 34.0195, lng: -118.4912 },
  { city: 'Pasadena', state: 'CA', label: 'Pasadena, CA', lat: 34.1478, lng: -118.1445 },
  { city: 'Berkeley', state: 'CA', label: 'Berkeley, CA', lat: 37.8715, lng: -122.273 },
  { city: 'Plano', state: 'TX', label: 'Plano, TX', lat: 33.0198, lng: -96.6989 },
  { city: 'Irving', state: 'TX', label: 'Irving, TX', lat: 32.814, lng: -96.9489 },
  { city: 'Scottsdale', state: 'AZ', label: 'Scottsdale, AZ', lat: 33.4942, lng: -111.9261 },
  { city: 'Mesa', state: 'AZ', label: 'Mesa, AZ', lat: 33.4152, lng: -111.8315 },
  { city: 'Colorado Springs', state: 'CO', label: 'Colorado Springs, CO', lat: 38.8339, lng: -104.8214 },
  { city: 'Fort Collins', state: 'CO', label: 'Fort Collins, CO', lat: 40.5853, lng: -105.0844 },
  { city: 'Provo', state: 'UT', label: 'Provo, UT', lat: 40.2338, lng: -111.6585 },
  { city: 'Sioux Falls', state: 'SD', label: 'Sioux Falls, SD', lat: 43.546, lng: -96.7313 },
  { city: 'Fargo', state: 'ND', label: 'Fargo, ND', lat: 46.8772, lng: -96.7898 },
  { city: 'Lincoln', state: 'NE', label: 'Lincoln, NE', lat: 40.8136, lng: -96.7026 },
  { city: 'Springfield', state: 'MO', label: 'Springfield, MO', lat: 37.209, lng: -93.2923 },
  { city: 'Mobile', state: 'AL', label: 'Mobile, AL', lat: 30.6954, lng: -88.0399 },
  { city: 'Huntsville', state: 'AL', label: 'Huntsville, AL', lat: 34.7304, lng: -86.5861 },
  { city: 'Jackson', state: 'MS', label: 'Jackson, MS', lat: 32.2988, lng: -90.1848 },
  { city: 'Shreveport', state: 'LA', label: 'Shreveport, LA', lat: 32.5252, lng: -93.7502 },
  { city: 'Baton Rouge', state: 'LA', label: 'Baton Rouge, LA', lat: 30.4515, lng: -91.1871 },
  { city: 'Lubbock', state: 'TX', label: 'Lubbock, TX', lat: 33.5779, lng: -101.8552 },
  { city: 'El Paso', state: 'TX', label: 'El Paso, TX', lat: 31.7619, lng: -106.485 },
  { city: 'Corpus Christi', state: 'TX', label: 'Corpus Christi, TX', lat: 27.8006, lng: -97.3964 },
  { city: 'McAllen', state: 'TX', label: 'McAllen, TX', lat: 26.2034, lng: -98.23 },
  { city: 'Wilmington', state: 'DE', label: 'Wilmington, DE', lat: 39.7391, lng: -75.5398 },
  { city: 'Newark', state: 'NJ', label: 'Newark, NJ', lat: 40.7357, lng: -74.1724 },
  { city: 'Jersey City', state: 'NJ', label: 'Jersey City, NJ', lat: 40.7178, lng: -74.0431 },
  { city: 'Stamford', state: 'CT', label: 'Stamford, CT', lat: 41.0534, lng: -73.5387 },
  { city: 'New Haven', state: 'CT', label: 'New Haven, CT', lat: 41.3083, lng: -72.9279 },
];

function scoreCity(query: string, city: CityPoint): number {
  const needle = query.toLowerCase().split(',')[0].trim();
  if (!needle) return 0;

  const name = city.city.toLowerCase();
  if (name === needle) return 100;
  if (name.startsWith(needle)) return 80;
  if (name.includes(needle)) return 60;
  if (city.label.toLowerCase().includes(needle)) return 40;
  return 0;
}

export function searchLocalCities(query: string, limit = 8): CityPoint[] {
  const q = query.trim();
  if (q.length < 2) return [];

  return US_CITIES.filter((city) => scoreCity(q, city) > 0)
    .sort((a, b) => scoreCity(q, b) - scoreCity(q, a))
    .slice(0, limit);
}

export const STATE_NAME_TO_ABBREV: Record<string, string> = {
  Alabama: 'AL',
  Alaska: 'AK',
  Arizona: 'AZ',
  Arkansas: 'AR',
  California: 'CA',
  Colorado: 'CO',
  Connecticut: 'CT',
  Delaware: 'DE',
  'District of Columbia': 'DC',
  Florida: 'FL',
  Georgia: 'GA',
  Hawaii: 'HI',
  Idaho: 'ID',
  Illinois: 'IL',
  Indiana: 'IN',
  Iowa: 'IA',
  Kansas: 'KS',
  Kentucky: 'KY',
  Louisiana: 'LA',
  Maine: 'ME',
  Maryland: 'MD',
  Massachusetts: 'MA',
  Michigan: 'MI',
  Minnesota: 'MN',
  Mississippi: 'MS',
  Missouri: 'MO',
  Montana: 'MT',
  Nebraska: 'NE',
  Nevada: 'NV',
  'New Hampshire': 'NH',
  'New Jersey': 'NJ',
  'New Mexico': 'NM',
  'New York': 'NY',
  'North Carolina': 'NC',
  'North Dakota': 'ND',
  Ohio: 'OH',
  Oklahoma: 'OK',
  Oregon: 'OR',
  Pennsylvania: 'PA',
  'Rhode Island': 'RI',
  'South Carolina': 'SC',
  'South Dakota': 'SD',
  Tennessee: 'TN',
  Texas: 'TX',
  Utah: 'UT',
  Vermont: 'VT',
  Virginia: 'VA',
  Washington: 'WA',
  'West Virginia': 'WV',
  Wisconsin: 'WI',
  Wyoming: 'WY',
};

export function toStateAbbrev(state: string | undefined): string | null {
  if (!state) return null;
  const trimmed = state.trim();
  if (trimmed.length === 2) return trimmed.toUpperCase();
  return STATE_NAME_TO_ABBREV[trimmed] ?? null;
}

export function formatCityState(city: string, state: string | undefined): string {
  const abbrev = toStateAbbrev(state);
  return abbrev ? `${city}, ${abbrev}` : city;
}

/** Resolve coordinates from a job's location string using the local city list only. */
export function lookupCityFromLocation(location: string): CityPoint | null {
  const loc = location.trim();
  if (!loc || /\bremote\b/i.test(loc)) return null;

  const parts = loc.split(/[,|/]/).map((p) => p.trim()).filter(Boolean);
  const cityPart = parts[0] ?? '';
  if (!cityPart) return null;

  const stateHint = parts.slice(1).find((p) => toStateAbbrev(p) || p.length === 2)?.trim();
  const stateAbbrev = stateHint ? toStateAbbrev(stateHint) ?? (stateHint.length === 2 ? stateHint.toUpperCase() : null) : null;

  if (stateAbbrev) {
    const exact = US_CITIES.find(
      (c) => c.city.toLowerCase() === cityPart.toLowerCase() && c.state === stateAbbrev
    );
    if (exact) return exact;
  }

  const cityLower = cityPart.toLowerCase();
  const candidates = US_CITIES.filter((c) => {
    const name = c.city.toLowerCase();
    return name === cityLower || name.startsWith(`${cityLower} `) || cityLower.startsWith(name);
  });

  if (stateAbbrev) {
    const withState = candidates.find((c) => c.state === stateAbbrev);
    if (withState) return withState;
  }

  if (candidates.length === 1) return candidates[0];

  return searchLocalCities(cityPart, 1)[0] ?? null;
}
