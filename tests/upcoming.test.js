import test from 'node:test';
import assert from 'node:assert/strict';

import { filterUpcomingMatches, isPlaylistStale } from '../js/time.js';

const now = new Date(2026, 10, 11, 12, 0, 0); // 11 nov 2026, hora local

const past = { displayTs: Date.UTC(2026, 10, 9, 18, 45) };
const today = { displayTs: Date.UTC(2026, 10, 11, 18, 45) };
const tomorrow = { displayTs: Date.UTC(2026, 10, 12, 18, 45) };

test('oculta eventos de días anteriores', () => {
  assert.deepEqual(filterUpcomingMatches([past, today, tomorrow], now), [today, tomorrow]);
});

test('mantiene eventos de hoy y de días posteriores', () => {
  assert.deepEqual(filterUpcomingMatches([today, tomorrow], now), [today, tomorrow]);
});

test('tolera listas vacías o inválidas', () => {
  assert.deepEqual(filterUpcomingMatches([], now), []);
  assert.deepEqual(filterUpcomingMatches(null, now), []);
});

test('detecta una lista desactualizada por su Last Updated', () => {
  assert.equal(
    isPlaylistStale({
      hasUpdatedAt: true,
      updatedAtDisplay: Date.UTC(2026, 10, 10, 4, 20),
    }, now),
    true,
  );

  assert.equal(
    isPlaylistStale({
      hasUpdatedAt: true,
      updatedAtDisplay: Date.UTC(2026, 10, 11, 4, 20),
    }, now),
    false,
  );
});

test('no marca como desactualizada una lista sin cabecera', () => {
  assert.equal(
    isPlaylistStale({
      hasUpdatedAt: false,
      updatedAtDisplay: Date.UTC(2026, 10, 10, 4, 20),
    }, now),
    false,
  );
});
