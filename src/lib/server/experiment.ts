import 'server-only';
import { randomInt } from 'node:crypto';
import { FieldValue, type DocumentReference, type Transaction } from 'firebase-admin/firestore';
import { db } from './firebase-admin';
import { randomCode } from './pseudonym';
import { CONDITIONS, type Condition } from '../constants';

/**
 * All experiment rules live here and run only on the server (Firebase Admin SDK).
 * Firestore security rules deny every client read/write, so the browser can never
 * touch the database directly. Each state change is a Firestore transaction.
 *
 * ANONYMITY: participant data is keyed by pid = HMAC-SHA256(firebaseUid, PARTICIPANT_ID_SECRET)
 * (see pseudonym.ts). No Firebase UID, email, name or photo is ever written to Firestore;
 * people are shown only as a short random code such as P-7F3K.
 *
 * Collections
 *   participants/{pid}            pid = HMAC of the Google uid, or test_<adminHmacPrefix>_<id> for admin test runs
 *   codes/{code}                  uniqueness index for the short anonymous codes
 *   sessions/{pid}__{condition}   one document per participant per condition (the doc id
 *                                 itself makes repeating a condition impossible)
 *   sessions/{sid}/trials/{nnn}   trial-by-trial records (create-only)
 *   sessions/{sid}/events/{auto}  break page events
 *   deletion_log/{auto}           admin deletions with a JSON snapshot
 *   meta/counters                 counterbalancing + test-run counters
 */

export class ExperimentError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export const BREAK_SECONDS = 900;
const BREAK_MS = BREAK_SECONDS * 1000;
const MAX_LENGTH = 9;
const BREAK_EVENTS = ['page_opened', 'page_closed', 'tab_hidden', 'tab_visible'] as const;
const ORDERS: Condition[][] = [
  ['video_game', 'youtube', 'no_screen'],
  ['video_game', 'no_screen', 'youtube'],
  ['youtube', 'video_game', 'no_screen'],
  ['youtube', 'no_screen', 'video_game'],
  ['no_screen', 'video_game', 'youtube'],
  ['no_screen', 'youtube', 'video_game']
];

type Status = 'break_in_progress' | 'awaiting_test' | 'test_in_progress' | 'completed';

interface ParticipantDoc {
  /** Short random anonymous code shown to admins and to the participant, e.g. "P-7F3K". */
  code: string;
  is_test: boolean;
  consent_participation: boolean;
  consent_quiet_environment: boolean;
  consent_guidelines: boolean;
  consented_at: string;
  assigned_order: Condition[];
  experiment_completed: boolean;
  experiment_completed_at: string | null;
  created_at: string;
  started: Partial<Record<Condition, string>>;
  completed: Partial<Record<Condition, boolean>>;
  active_session_id: string | null;
  next_order: number;
}

export interface SessionDoc {
  participant_id: string;
  condition: Condition;
  condition_order: number;
  status: Status;
  is_test: boolean;
  break_skipped: boolean;
  expected_break_seconds: number;
  break_started_at: string;
  break_ends_at: string;
  break_completed_at: string | null;
  actual_break_seconds: number | null;
  break_interruptions: number;
  test_started_at: string | null;
  test_completed_at: string | null;
  test_duration_seconds: number | null;
  test_interruptions: number;
  current_length: number | null;
  failures_at_length: number;
  pending_sequence: number[] | null;
  pending_issued_at: string | null;
  /** Coarse input device used for the test ('touch' | 'mouse' | 'unknown'): a covariate for the analysis. */
  input_type: string | null;
  trial_count: number;
  correct_count: number;
  incorrect_count: number;
  max_correct: number;
  corsi_span: number | null;
  max_length_correct: number | null;
  total_score: number | null;
  correct_trials: number | null;
  incorrect_trials: number | null;
  total_attempts: number | null;
  accuracy: number | null;
  created_at: string;
}

export interface TrialDoc {
  session_id: string;
  participant_id: string;
  trial_number: number;
  sequence_length: number;
  attempt_at_length: number;
  sequence: number[];
  response: number[];
  is_correct: boolean;
  response_time_ms: number | null;
  presented_at: string;
  responded_at: string;
}

// ---------------------------------------------------------------- helpers
const iso = (ms = Date.now()) => new Date(ms).toISOString();
const secondsBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a))) / 1000;
const participants = () => db().collection('participants');
const sessions = () => db().collection('sessions');
const pad = (n: number) => String(n).padStart(3, '0');

/** n distinct blocks (0–8) in random order — no block is ever repeated within a sequence. */
export function randomSequence(n: number): number[] {
  const blocks = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  for (let i = blocks.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
  }
  return blocks.slice(0, n);
}

function sessionJson(id: string, s: SessionDoc) {
  return {
    id,
    condition: s.condition,
    condition_order: s.condition_order,
    status: s.status,
    is_test: s.is_test,
    break_skipped: s.break_skipped,
    input_type: s.input_type ?? null,
    expected_break_seconds: s.expected_break_seconds,
    break_started_at: s.break_started_at,
    break_ends_at: s.break_ends_at,
    break_completed_at: s.break_completed_at,
    actual_break_seconds: s.actual_break_seconds,
    break_interruptions: s.break_interruptions,
    test_started_at: s.test_started_at,
    test_completed_at: s.test_completed_at,
    test_duration_seconds: s.test_duration_seconds,
    corsi_span: s.corsi_span,
    max_length_correct: s.max_length_correct,
    total_score: s.total_score,
    correct_trials: s.correct_trials,
    incorrect_trials: s.incorrect_trials,
    total_attempts: s.total_attempts,
    accuracy: s.accuracy,
    trials_done: s.trial_count
  };
}

function participantJson(id: string, p: ParticipantDoc) {
  return {
    id,
    code: p.code,
    assigned_order: p.assigned_order,
    is_test: p.is_test,
    experiment_completed: p.experiment_completed,
    experiment_completed_at: p.experiment_completed_at,
    created_at: p.created_at
  };
}

async function ownedSession(tx: Transaction | null, pid: string, sid: string) {
  const ref = sessions().doc(sid);
  const snap = tx ? await tx.get(ref) : await ref.get();
  if (!snap.exists) throw new ExperimentError('SESSION_NOT_FOUND');
  const s = snap.data() as SessionDoc;
  if (s.participant_id !== pid) throw new ExperimentError('SESSION_NOT_FOUND');
  return { ref, s };
}

/** Moves a finished break to "awaiting_test" (only once the 15 minutes have passed). */
function finishBreakFields(s: SessionDoc, nowMs: number): Partial<SessionDoc> {
  if (nowMs < Date.parse(s.break_ends_at)) throw new ExperimentError('BREAK_NOT_FINISHED');
  const now = iso(nowMs);
  return { status: 'awaiting_test', break_completed_at: now, actual_break_seconds: secondsBetween(s.break_started_at, now) };
}

function issueTrial(s: SessionDoc, sid: string) {
  const sequence = randomSequence(s.current_length!);
  const update: Partial<SessionDoc> = { pending_sequence: sequence, pending_issued_at: iso() };
  return {
    update,
    trial: {
      trial_number: s.trial_count + 1,
      sequence_length: s.current_length!,
      attempt_at_length: s.failures_at_length + 1,
      sequence,
      session_id: sid
    }
  };
}

// ---------------------------------------------------------------- participant API
export async function getParticipantState(pid: string) {
  const snap = await participants().doc(pid).get();
  if (!snap.exists) return null;
  const p = snap.data() as ParticipantDoc;
  const ss = await sessions().where('participant_id', '==', pid).get();
  const list = ss.docs
    .map((d) => sessionJson(d.id, d.data() as SessionDoc))
    .sort((a, b) => a.condition_order - b.condition_order);
  return { participant: participantJson(pid, p), sessions: list, server_now: iso() };
}

/** Reserve a unique short code inside a transaction (retries with a fresh code on collision). */
async function reserveCode(tx: Transaction, prefix: 'P' | 'T', pid: string) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = randomCode(prefix, attempt < 5 ? 4 : 5);
    const ref = db().collection('codes').doc(code);
    if (!(await tx.get(ref)).exists) return { code, ref, pid };
  }
  throw new Error('Could not allocate an anonymous code');
}

export async function registerParticipant(
  pid: string,
  input: { consent: { participation?: unknown; quiet?: unknown; guidelines?: unknown }; loginCode?: string }
) {
  if (!(input.consent.participation === true && input.consent.quiet === true && input.consent.guidelines === true)) {
    throw new ExperimentError('CONSENT_REQUIRED');
  }
  const pRef = participants().doc(pid);
  const cRef = db().collection('meta').doc('counters');

  await db().runTransaction(async (tx) => {
    const [pSnap, cSnap] = await Promise.all([tx.get(pRef), tx.get(cRef)]);
    if (pSnap.exists) throw new ExperimentError('ALREADY_REGISTERED');
    // Participants who signed up with a code keep that code (it was reserved for them at sign-up).
    const own = input.loginCode ? db().collection('codes').doc(input.loginCode) : null;
    const ownSnap = own ? await tx.get(own) : null;
    const reserved =
      own && ownSnap?.exists && ownSnap.get('participant_id') === pid
        ? { code: input.loginCode!, ref: own, pid, existing: true }
        : { ...(await reserveCode(tx, 'P', pid)), existing: false };
    // Counterbalancing: pick the least-used of the six condition orders (ties broken randomly).
    const counts = (cSnap.data()?.order_counts ?? {}) as Record<string, number>;
    const min = Math.min(...ORDERS.map((o) => counts[o.join('>')] ?? 0));
    const candidates = ORDERS.filter((o) => (counts[o.join('>')] ?? 0) === min);
    const order = candidates[randomInt(candidates.length)];
    const now = iso();
    const doc: ParticipantDoc = {
      code: reserved.code,
      is_test: false,
      consent_participation: true,
      consent_quiet_environment: true,
      consent_guidelines: true,
      consented_at: now,
      assigned_order: order,
      experiment_completed: false,
      experiment_completed_at: null,
      created_at: now,
      started: {},
      completed: {},
      active_session_id: null,
      next_order: 1
    };
    tx.create(pRef, doc);
    if (!reserved.existing) tx.create(reserved.ref, { participant_id: pid, created_at: now });
    tx.set(cRef, { order_counts: { [order.join('>')]: FieldValue.increment(1) } }, { merge: true });
  });
  return getParticipantState(pid);
}

/** Admin test mode: a throw-away participant whose results never count. Stores no admin identity. */
export async function createTestParticipant(testPrefix: string) {
  const pid = `${testPrefix}${Date.now().toString(36)}`;
  await db().runTransaction(async (tx) => {
    const reserved = await reserveCode(tx, 'T', pid);
    const now = iso();
    const doc: ParticipantDoc = {
      code: reserved.code,
      is_test: true,
      consent_participation: true,
      consent_quiet_environment: true,
      consent_guidelines: true,
      consented_at: now,
      assigned_order: ['video_game', 'youtube', 'no_screen'],
      experiment_completed: false,
      experiment_completed_at: null,
      created_at: now,
      started: {},
      completed: {},
      active_session_id: null,
      next_order: 1
    };
    tx.create(participants().doc(pid), doc);
    tx.create(reserved.ref, { participant_id: pid, created_at: now });
  });
  return pid;
}

export async function startBreak(pid: string, condition: Condition) {
  if (!CONDITIONS.includes(condition)) throw new ExperimentError('INVALID_CONDITION');
  const pRef = participants().doc(pid);
  const sid = `${pid}__${condition}`;
  const sRef = sessions().doc(sid);
  const result = await db().runTransaction(async (tx) => {
    const [pSnap, sSnap] = await Promise.all([tx.get(pRef), tx.get(sRef)]);
    if (!pSnap.exists) throw new ExperimentError('NOT_REGISTERED');
    const p = pSnap.data() as ParticipantDoc;
    if (p.started?.[condition] || sSnap.exists) throw new ExperimentError('CONDITION_ALREADY_DONE');
    if (p.active_session_id) throw new ExperimentError('SESSION_IN_PROGRESS');
    const nowMs = Date.now();
    const s: SessionDoc = {
      participant_id: pid,
      condition,
      condition_order: p.next_order ?? Object.keys(p.started ?? {}).length + 1,
      status: 'break_in_progress',
      is_test: p.is_test,
      break_skipped: false,
      expected_break_seconds: BREAK_SECONDS,
      break_started_at: iso(nowMs),
      break_ends_at: iso(nowMs + BREAK_MS),
      break_completed_at: null,
      actual_break_seconds: null,
      break_interruptions: 0,
      test_started_at: null,
      test_completed_at: null,
      test_duration_seconds: null,
      test_interruptions: 0,
      current_length: null,
      failures_at_length: 0,
      pending_sequence: null,
      pending_issued_at: null,
      input_type: null,
      trial_count: 0,
      correct_count: 0,
      incorrect_count: 0,
      max_correct: 0,
      corsi_span: null,
      max_length_correct: null,
      total_score: null,
      correct_trials: null,
      incorrect_trials: null,
      total_attempts: null,
      accuracy: null,
      created_at: iso(nowMs)
    };
    if (!p.is_test && s.condition_order > 3) throw new ExperimentError('CONDITION_ALREADY_DONE');
    tx.create(sRef, s);
    tx.set(sRef.collection('events').doc(), {
      session_id: sid,
      event_type: 'page_opened',
      client_remaining_seconds: BREAK_SECONDS,
      occurred_at: iso(nowMs)
    });
    tx.update(pRef, { [`started.${condition}`]: sid, active_session_id: sid, next_order: s.condition_order + 1 });
    return s;
  });
  return { session: sessionJson(sid, result), server_now: iso() };
}

export async function getSessionDetail(pid: string, sid: string) {
  const { s } = await ownedSession(null, pid, sid);
  const p = (await participants().doc(pid).get()).data() as ParticipantDoc | undefined;
  let trials = null;
  if (s.status === 'completed') {
    const t = await sessions().doc(sid).collection('trials').orderBy('trial_number').get();
    trials = t.docs.map((d) => {
      const x = d.data() as TrialDoc;
      return {
        trial_number: x.trial_number,
        sequence_length: x.sequence_length,
        attempt_at_length: x.attempt_at_length,
        sequence: x.sequence,
        response: x.response,
        is_correct: x.is_correct,
        response_time_ms: x.response_time_ms
      };
    });
  }
  return {
    session: sessionJson(sid, s),
    trials,
    participant: { code: p?.code ?? '', is_test: Boolean(p?.is_test) },
    server_now: iso()
  };
}

export async function recordBreakEvent(pid: string, sid: string, event: string, remaining: number | null) {
  if (!(BREAK_EVENTS as readonly string[]).includes(event)) throw new ExperimentError('INVALID_EVENT');
  await db().runTransaction(async (tx) => {
    const { ref, s } = await ownedSession(tx, pid, sid);
    if (s.status !== 'break_in_progress') return; // only logged during the break
    tx.set(ref.collection('events').doc(), {
      session_id: sid,
      event_type: event,
      client_remaining_seconds: remaining == null ? null : Math.max(0, Math.min(BREAK_SECONDS, Math.round(remaining))),
      occurred_at: iso()
    });
    if (event === 'page_closed') tx.update(ref, { break_interruptions: FieldValue.increment(1) });
  });
}

export async function completeBreak(pid: string, sid: string) {
  const s = await db().runTransaction(async (tx) => {
    const { ref, s } = await ownedSession(tx, pid, sid);
    if (s.status !== 'break_in_progress') return s;
    const update = finishBreakFields(s, Date.now());
    tx.update(ref, update);
    return { ...s, ...update } as SessionDoc;
  });
  return { session: sessionJson(sid, s), server_now: iso() };
}

export async function skipBreak(pid: string, sid: string) {
  const s = await db().runTransaction(async (tx) => {
    const { ref, s } = await ownedSession(tx, pid, sid);
    if (!s.is_test) throw new ExperimentError('TEST_MODE_ONLY');
    if (s.status !== 'break_in_progress') return s;
    const now = iso();
    const update: Partial<SessionDoc> = {
      status: 'awaiting_test',
      break_completed_at: now,
      break_skipped: true,
      actual_break_seconds: secondsBetween(s.break_started_at, now)
    };
    tx.update(ref, update);
    return { ...s, ...update } as SessionDoc;
  });
  return { session: sessionJson(sid, s), server_now: iso() };
}

/** Starts the test (first call) or resumes it after an interruption; returns the trial to present. */
export async function nextTrial(pid: string, sid: string, inputType?: unknown) {
  return db().runTransaction(async (tx) => {
    const { ref, s: current } = await ownedSession(tx, pid, sid);
    let s = { ...current };
    if (s.status === 'completed') throw new ExperimentError('TEST_ALREADY_COMPLETED');
    let update: Partial<SessionDoc> = {};
    if (s.status === 'break_in_progress') {
      update = finishBreakFields(s, Date.now());
      s = { ...s, ...update } as SessionDoc;
    }
    if (s.status === 'awaiting_test') {
      const input = inputType === 'touch' || inputType === 'mouse' ? inputType : 'unknown';
      const u: Partial<SessionDoc> = { status: 'test_in_progress', test_started_at: iso(), current_length: 2, failures_at_length: 0, input_type: input };
      update = { ...update, ...u };
      s = { ...s, ...u } as SessionDoc;
    } else if (s.pending_sequence) {
      // A trial was shown but never answered (reload / tab closed): log it, draw a fresh sequence.
      update.test_interruptions = s.test_interruptions + 1;
    }
    const issued = issueTrial(s, sid);
    tx.update(ref, { ...update, ...issued.update });
    return { finished: false as const, trial: issued.trial, test_started_at: s.test_started_at };
  });
}

export async function submitTrial(pid: string, sid: string, response: unknown, responseTimeMs: unknown) {
  return db().runTransaction(async (tx) => {
    const { ref, s } = await ownedSession(tx, pid, sid);
    const pRef = participants().doc(pid);
    const pSnap = await tx.get(pRef);
    if (s.status === 'completed') throw new ExperimentError('TEST_ALREADY_COMPLETED');
    if (s.status !== 'test_in_progress' || !s.pending_sequence) throw new ExperimentError('NO_PENDING_TRIAL');
    const seq = s.pending_sequence;
    if (
      !Array.isArray(response) ||
      response.length !== seq.length ||
      !response.every((n) => Number.isInteger(n) && n >= 0 && n <= 8)
    ) {
      throw new ExperimentError('INVALID_RESPONSE');
    }
    const resp = response as number[];
    const correct = resp.every((b, i) => b === seq[i]);
    const trialNumber = s.trial_count + 1;
    const rt = typeof responseTimeMs === 'number' && responseTimeMs >= 0 && responseTimeMs <= 600000 ? Math.round(responseTimeMs) : null;
    const now = iso();
    const trial: TrialDoc = {
      session_id: sid,
      participant_id: pid,
      trial_number: trialNumber,
      sequence_length: s.current_length!,
      attempt_at_length: s.failures_at_length + 1,
      sequence: seq,
      response: resp,
      is_correct: correct,
      response_time_ms: rt,
      presented_at: s.pending_issued_at ?? now,
      responded_at: now
    };
    tx.create(ref.collection('trials').doc(pad(trialNumber)), trial);

    const next: SessionDoc = {
      ...s,
      trial_count: trialNumber,
      correct_count: s.correct_count + (correct ? 1 : 0),
      incorrect_count: s.incorrect_count + (correct ? 0 : 1),
      max_correct: correct ? Math.max(s.max_correct, s.current_length!) : s.max_correct,
      pending_sequence: null,
      pending_issued_at: null
    };
    let finished = false;
    if (correct) {
      if (s.current_length! >= MAX_LENGTH) finished = true;
      else {
        next.current_length = s.current_length! + 1;
        next.failures_at_length = 0;
      }
    } else if (s.failures_at_length + 1 >= 2) {
      finished = true; // stopping rule: two failed attempts at the same length
    } else {
      next.failures_at_length = s.failures_at_length + 1;
    }

    if (finished) {
      const total = next.correct_count + next.incorrect_count;
      Object.assign(next, {
        status: 'completed',
        test_completed_at: now,
        test_duration_seconds: next.test_started_at ? secondsBetween(next.test_started_at, now) : null,
        corsi_span: next.max_correct,
        max_length_correct: next.max_correct,
        total_score: next.max_correct * next.correct_count,
        correct_trials: next.correct_count,
        incorrect_trials: next.incorrect_count,
        total_attempts: total,
        accuracy: total ? Math.round((10000 * next.correct_count) / total) / 100 : null,
        current_length: null
      } satisfies Partial<SessionDoc>);
      tx.set(ref, next);
      const p = pSnap.data() as ParticipantDoc | undefined;
      if (p) {
        const completed = { ...(p.completed ?? {}), [s.condition]: true };
        const allDone = CONDITIONS.every((c) => completed[c]);
        tx.update(pRef, {
          [`completed.${s.condition}`]: true,
          active_session_id: null,
          ...(allDone && !p.experiment_completed ? { experiment_completed: true, experiment_completed_at: now } : {})
        });
      }
      return { correct, finished: true as const, session: sessionJson(sid, next) };
    }
    const issued = issueTrial(next, sid);
    tx.set(ref, { ...next, ...issued.update });
    return { correct, finished: false as const, trial: issued.trial };
  });
}

async function deleteSessionTree(ref: DocumentReference) {
  for (const sub of ['trials', 'events']) {
    const docs = await ref.collection(sub).listDocuments();
    for (let i = 0; i < docs.length; i += 400) {
      const batch = db().batch();
      docs.slice(i, i + 400).forEach((d) => batch.delete(d));
      await batch.commit();
    }
  }
  await ref.delete();
}

/** Test mode only: remove a test condition so it can be done again. */
export async function resetTestCondition(pid: string, condition: Condition) {
  if (!CONDITIONS.includes(condition)) throw new ExperimentError('INVALID_CONDITION');
  const pRef = participants().doc(pid);
  const p = (await pRef.get()).data() as ParticipantDoc | undefined;
  if (!p) throw new ExperimentError('NOT_REGISTERED');
  if (!p.is_test) throw new ExperimentError('TEST_MODE_ONLY');
  const sid = `${pid}__${condition}`;
  await deleteSessionTree(sessions().doc(sid));
  await pRef.update({
    [`started.${condition}`]: FieldValue.delete(),
    [`completed.${condition}`]: FieldValue.delete(),
    ...(p.active_session_id === sid ? { active_session_id: null } : {}),
    experiment_completed: false,
    experiment_completed_at: null
  });
  return getParticipantState(pid);
}

// ---------------------------------------------------------------- results
export async function getPublicResults() {
  const [ps, ss] = await Promise.all([participants().get(), sessions().where('status', '==', 'completed').get()]);
  const real = ps.docs
    .map((d) => ({ id: d.id, ...(d.data() as ParticipantDoc) }))
    .filter((p) => !p.is_test)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const label = new Map(real.map((p) => [p.id, p.code]));
  const rows = ss.docs
    .map((d) => d.data() as SessionDoc)
    .filter((s) => !s.is_test && label.has(s.participant_id))
    .map((s) => ({
      participant: label.get(s.participant_id)!,
      condition: s.condition,
      condition_order: s.condition_order,
      corsi_span: s.corsi_span ?? 0,
      accuracy: s.accuracy,
      correct_trials: s.correct_trials ?? 0,
      total_attempts: s.total_attempts ?? 0,
      completed_at: s.test_completed_at ?? ''
    }))
    .sort((a, b) => a.participant.localeCompare(b.participant) || a.condition_order - b.condition_order);
  return { total_participants: real.length, sessions: rows, generated_at: iso() };
}

// ---------------------------------------------------------------- admin
export async function getAdminData() {
  const [ps, ss, ts, es, dl] = await Promise.all([
    participants().get(),
    sessions().get(),
    db().collectionGroup('trials').get(),
    db().collectionGroup('events').get(),
    db().collection('deletion_log').orderBy('deleted_at').get()
  ]);
  const participantsList = ps.docs
    .map((d) => {
      const p = d.data() as ParticipantDoc;
      return {
        id: d.id,
        code: p.code,
        consent_participation: p.consent_participation,
        consent_quiet_environment: p.consent_quiet_environment,
        consent_guidelines: p.consent_guidelines,
        consented_at: p.consented_at,
        assigned_order: p.assigned_order as string[],
        is_test: p.is_test,
        experiment_completed: p.experiment_completed,
        experiment_completed_at: p.experiment_completed_at,
        created_at: p.created_at
      };
    })
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const sessionsList = ss.docs
    .map((d) => {
      const s = d.data() as SessionDoc;
      return {
        id: d.id,
        participant_id: s.participant_id,
        condition: s.condition,
        condition_order: s.condition_order,
        status: s.status as string,
        is_test: s.is_test,
        break_skipped: s.break_skipped,
        input_type: s.input_type ?? null,
        expected_break_seconds: s.expected_break_seconds,
        break_started_at: s.break_started_at,
        break_ends_at: s.break_ends_at,
        break_completed_at: s.break_completed_at,
        actual_break_seconds: s.actual_break_seconds,
        break_interruptions: s.break_interruptions,
        test_started_at: s.test_started_at,
        test_completed_at: s.test_completed_at,
        test_duration_seconds: s.test_duration_seconds,
        test_interruptions: s.test_interruptions,
        corsi_span: s.corsi_span,
        max_length_correct: s.max_length_correct,
        total_score: s.total_score,
        correct_trials: s.correct_trials,
        incorrect_trials: s.incorrect_trials,
        total_attempts: s.total_attempts,
        accuracy: s.accuracy,
        created_at: s.created_at
      };
    })
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const trials = ts.docs
    .map((d) => {
      const t = d.data() as TrialDoc;
      return { id: `${t.session_id}/${d.id}`, ...t };
    })
    .sort((a, b) => a.responded_at.localeCompare(b.responded_at));
  const events = es.docs
    .map((d, i) => {
      const e = d.data() as { session_id: string; event_type: string; client_remaining_seconds: number | null; occurred_at: string };
      return { id: i + 1, ...e };
    })
    .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));
  const deletions = dl.docs.map((d, i) => {
    const x = d.data() as { deleted_at: string; deleted_by_email: string | null; kind: 'participant' | 'session'; summary: string | null };
    return { id: i + 1, deleted_at: x.deleted_at, deleted_by_email: x.deleted_by_email, kind: x.kind, summary: x.summary };
  });
  return { participants: participantsList, sessions: sessionsList, trials, events, deletions };
}

async function snapshotSession(ref: DocumentReference) {
  const [s, t] = await Promise.all([ref.get(), ref.collection('trials').get()]);
  return { id: ref.id, session: s.data() ?? null, trials: t.docs.map((d) => d.data()) };
}

export async function adminDeleteSession(adminEmail: string, sid: string) {
  const ref = sessions().doc(sid);
  const snap = await ref.get();
  if (!snap.exists) throw new ExperimentError('SESSION_NOT_FOUND');
  const s = snap.data() as SessionDoc;
  const pRef = participants().doc(s.participant_id);
  const p = (await pRef.get()).data() as ParticipantDoc | undefined;
  const snapshot = await snapshotSession(ref);
  await db().collection('deletion_log').add({
    deleted_at: iso(),
    deleted_by_email: adminEmail,
    kind: 'session',
    target_id: sid,
    summary: `${p?.code ?? '?'} · ${s.condition} · span ${s.corsi_span ?? '—'}`,
    snapshot: JSON.stringify(snapshot)
  });
  await deleteSessionTree(ref);
  if (p) {
    await pRef.update({
      [`started.${s.condition}`]: FieldValue.delete(),
      [`completed.${s.condition}`]: FieldValue.delete(),
      ...(p.active_session_id === sid ? { active_session_id: null } : {}),
      experiment_completed: false,
      experiment_completed_at: null
    });
  }
}

export async function adminDeleteParticipant(adminEmail: string, pid: string) {
  const pRef = participants().doc(pid);
  const pSnap = await pRef.get();
  if (!pSnap.exists) throw new ExperimentError('PARTICIPANT_NOT_FOUND');
  const p = pSnap.data() as ParticipantDoc;
  const ss = await sessions().where('participant_id', '==', pid).get();
  const snaps = await Promise.all(ss.docs.map((d) => snapshotSession(d.ref)));
  await db().collection('deletion_log').add({
    deleted_at: iso(),
    deleted_by_email: adminEmail,
    kind: 'participant',
    target_id: pid,
    summary: `${p.code}${p.is_test ? ' (test)' : ''}`,
    snapshot: JSON.stringify({ participant: p, sessions: snaps })
  });
  for (const d of ss.docs) await deleteSessionTree(d.ref);
  if (p.code) await db().collection('codes').doc(p.code).delete();
  await pRef.delete();
}
