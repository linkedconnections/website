// The same small set of Belgian stations as the original map demo. Match names
// rather than row numbers: indices and identifiers can change between releases.
const stationNames = [
  /^(gent-sint-pieters|gand-saint-pierre|ghent-sint-pieters)$/,
  /^liege-guillemins$/,
  /^(brugge|bruges)$/,
  /^(antwerpen-centraal|anvers-central|antwerp-central)$/,
  /^(namur|namen)$/,
  /^spa$/,
  /^neufchateau$/,
  /^(arlon|aarlen)$/,
  /^(brussel-noord|bruxelles-nord|brussels-north)$/
];

export function demoStations(sources) {
  const stations = [];
  for (const pattern of stationNames) {
    for (const source of sources) {
      const stopIdx = source.stopFamily.searchable.find(index => {
        const name = (source.stops.name[index] || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        return pattern.test(name);
      });
      if (stopIdx === undefined) continue;
      const lat = source.stops.lat[stopIdx];
      const lon = source.stops.lon[stopIdx];
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
      stations.push({ sourceId: source.id, stopIdx, name: source.stops.name[stopIdx], lat, lon });
      break;
    }
  }
  return stations;
}

export function demoDeparture(sources, now = Date.now() / 1000) {
  const starts = sources.map(source => Date.parse(source.manifest.coverageStart) / 1000).filter(Number.isFinite);
  const ends = sources.map(source => Date.parse(source.manifest.coverageEnd) / 1000).filter(Number.isFinite);
  const start = starts.length ? Math.min(...starts) : -Infinity;
  const end = ends.length ? Math.max(...ends) : Infinity;
  if (now < start) return start;
  // Keep a useful departure within an old feed, and disclose its date in the UI.
  if (now >= end) return Math.max(start, end - 86400);
  return now;
}

export function durationLabel(seconds) {
  const minutes = Math.max(0, Math.round(seconds / 60));
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours} h ${minutes % 60} min` : `${minutes} min`;
}
