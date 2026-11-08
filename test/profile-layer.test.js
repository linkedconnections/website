import { test } from 'node:test';
import assert from 'node:assert/strict';
import { profileCoordinates } from '../demo/profile-layer.js';

test('planner profile coordinates use longitude-first order and convert to Leaflet latitude-first order', () => {
  assert.deepEqual(profileCoordinates({ from: [3.71, 51.035], to: [5.566, 50.624] }), [[51.035, 3.71], [50.624, 5.566]]);
});

test('malformed, missing and identical endpoints do not reach the map renderer', () => {
  for (const edge of [null, {}, { from: [NaN, 50], to: [4, 51] }, { from: [4, 91], to: [4, 51] }, { from: [181, 50], to: [4, 51] }, { from: [4, 50], to: [4, 50] }]) {
    assert.equal(profileCoordinates(edge), null);
  }
});
