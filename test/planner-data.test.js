import { test } from 'node:test';
import assert from 'node:assert/strict';
import { demoStations, demoDeparture, durationLabel } from '../demo/planner-data.js';

const start = Date.parse('2026-11-08T00:00:00Z') / 1000;
const end = start + 7 * 86400;
const sources = [{ manifest: { coverageStart: new Date(start * 1000).toISOString(), coverageEnd: new Date(end * 1000).toISOString() } }];

test('departures use now inside the timetable and remain within past or future coverage', () => {
  assert.equal(demoDeparture(sources, start + 42), start + 42);
  assert.equal(demoDeparture(sources, start - 10), start);
  assert.equal(demoDeparture(sources, end), end - 86400);
  assert.equal(demoDeparture(sources, end + 10), end - 86400);
  assert.equal(demoDeparture([{ manifest: { coverageStart: new Date(start * 1000).toISOString(), coverageEnd: new Date((start + 60) * 1000).toISOString() } }], end), start);
  assert.equal(demoDeparture([{ manifest: {} }], start), start);
});

test('pins find station names in each release, skip platforms and invalid coordinates', () => {
  const source = {
    id: 'belgium',
    stops: {
      name: ['Gent-Sint-Pieters', 'Liège-Guillemins', 'Gent-Sint-Pieters', 'Brugge', 'Arlon'],
      lat: [51, 50, 51, NaN, 49], lon: [3, 5, 3, 3, 5]
    },
    stopFamily: { searchable: [1, 2, 3, 4] }
  };
  const pins = demoStations([source]);
  assert.deepEqual(pins.map(pin => [pin.name, pin.stopIdx]), [['Gent-Sint-Pieters', 2], ['Liège-Guillemins', 1], ['Arlon', 4]]);
  assert.equal(pins[0].sourceId, 'belgium');
  // Reordering a release must not keep the old row indices.
  source.stops.name.reverse();
  source.stops.lat.reverse();
  source.stops.lon.reverse();
  source.stopFamily.searchable = [0, 1, 2, 3];
  assert.equal(demoStations([source]).find(pin => pin.name === 'Liège-Guillemins').stopIdx, 3);
});

test('compact journey durations include hours without treating epoch seconds as milliseconds', () => {
  assert.equal(durationLabel(0), '0 min');
  assert.equal(durationLabel(90), '2 min');
  assert.equal(durationLabel(7380), '2 h 3 min');
});
