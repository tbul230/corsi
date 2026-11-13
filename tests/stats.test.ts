import { test } from 'node:test';
import assert from 'node:assert/strict';
import { completeCasesOnly, overall, participantMatrix, summariseByCondition, summariseByOrder } from '../src/lib/stats.ts';
import { toCsv } from '../src/lib/csv.ts';

const rows = [
  { participant: 'P01', condition: 'video_game', condition_order: 1, corsi_span: 6, accuracy: 70 },
  { participant: 'P01', condition: 'no_screen', condition_order: 2, corsi_span: 5, accuracy: 60 },
  { participant: 'P02', condition: 'video_game', condition_order: 2, corsi_span: 4, accuracy: 50 },
  { participant: 'P01', condition: 'youtube', condition_order: 3, corsi_span: 7, accuracy: 80 }
] as const;

test('averages per condition; missing conditions are null, not zero', () => {
  const s = summariseByCondition([...rows].filter((r) => r.condition !== 'youtube'));
  const vg = s.find((x) => x.condition === 'video_game')!;
  const yt = s.find((x) => x.condition === 'youtube')!;
  assert.equal(vg.n, 2);
  assert.equal(vg.meanSpan, 5);
  assert.equal(vg.meanAccuracy, 60);
  assert.equal(yt.n, 0);
  assert.equal(yt.meanSpan, null);
  assert.equal(yt.meanAccuracy, null);
});

test('participant matrix keeps missing conditions undefined', () => {
  const m = participantMatrix([...rows]);
  assert.deepEqual(m[1], { participant: 'P02', video_game: 4 });
  assert.equal(m[0].youtube, 7);
});

test('overall stats', () => {
  const o = overall([...rows]);
  assert.equal(o.completedTests, 4);
  assert.equal(o.maxSpan, 7);
  assert.equal(o.meanSpan, 5.5);
  assert.equal(o.participantsWithResults, 2);
  assert.equal(overall([]).meanSpan, null);
});

test('order summary and complete cases', () => {
  assert.deepEqual(summariseByOrder([...rows]).map((o) => o.n), [1, 2, 1]);
  assert.equal(completeCasesOnly([...rows]).length, 3);
});

test('csv escaping and formula-injection guard', () => {
  const csv = toCsv(['a', 'b'], [['x,y', '=SUM(A1)'], [null, -3]]);
  assert.equal(csv, 'a,b\r\n"x,y",\'=SUM(A1)\r\n,-3\r\n');
});
