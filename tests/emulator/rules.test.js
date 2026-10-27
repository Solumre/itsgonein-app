import { readFileSync } from 'node:fs';
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, getDocs, collection, query, where, serverTimestamp, Timestamp, deleteDoc } from 'firebase/firestore';

let env;
const future = Timestamp.fromMillis(Date.now() + 3600_000);
const past = Timestamp.fromMillis(Date.now() - 600_000);

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-itgonein',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});
afterAll(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'matches/m1'), { competition: 'PL', matchday: 9, kickoff: future, status: 'upcoming' });
    await setDoc(doc(db, 'matches/m2'), { competition: 'PL', matchday: 9, kickoff: past, status: 'live' });
    await setDoc(doc(db, 'matches/c1'), { competition: 'CL', matchday: 4, kickoff: future, status: 'upcoming' });
    await setDoc(doc(db, 'predictions/bob_m2'), { uid: 'bob', matchId: 'm2', home: 1, away: 0, double: false, kickoff: past, matchday: 9 });
    await setDoc(doc(db, 'users/bob'), { nickname: 'Bob' });
    await setDoc(doc(db, 'private/bob'), { birthYear: 2013 });
    await setDoc(doc(db, 'leagues/ABC123'), { name: 'Mates', members: ['bob'] });
    await setDoc(doc(db, 'leagues/ABC123/messages/x'), { text: 'hi' });
  });
});

const alice = () => env.authenticatedContext('alice').firestore();
const pick = (over = {}) => ({
  uid: 'alice', matchId: 'm1', home: 2, away: 1, double: false, kickoff: future, matchday: 9, updatedAt: serverTimestamp(), ...over,
});

describe('predictions', () => {
  it('lets you pick before kickoff', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'predictions/alice_m1'), pick()));
    await assertSucceeds(setDoc(doc(alice(), 'predictions/alice_m1'), pick({ home: 3, double: true })));
    await assertSucceeds(getDoc(doc(alice(), 'predictions/alice_m1')));
    await assertSucceeds(deleteDoc(doc(alice(), 'predictions/alice_m1')));
  });
  it('takes Champions League picks with the right competition', async () => {
    const cl = pick({ matchId: 'c1', matchday: 4, competition: 'CL' });
    await assertSucceeds(setDoc(doc(alice(), 'predictions/alice_c1'), cl));
    await assertFails(setDoc(doc(alice(), 'predictions/alice_c1'), { ...cl, competition: 'PL' }));
    await assertFails(setDoc(doc(alice(), 'predictions/alice_c1'), pick({ matchId: 'c1', matchday: 4 }))); // no competition = PL
    await assertSucceeds(setDoc(doc(alice(), 'predictions/alice_m1'), pick({ competition: 'PL' })));
  });
  it('locks picks once a game has kicked off', async () => {
    await assertFails(setDoc(doc(alice(), 'predictions/alice_m2'), pick({ matchId: 'm2', kickoff: past })));
  });
  it('rejects forged or bad picks', async () => {
    await assertFails(setDoc(doc(alice(), 'predictions/alice_m1'), pick({ points: 99 })));
    await assertFails(setDoc(doc(alice(), 'predictions/bob_m1'), pick({ uid: 'bob' })));
    await assertFails(setDoc(doc(alice(), 'predictions/alice_m1'), pick({ home: 99 })));
    await assertFails(setDoc(doc(alice(), 'predictions/alice_m1'), pick({ home: 1.5 })));
    await assertFails(setDoc(doc(alice(), 'predictions/alice_m1'), pick({ kickoff: Timestamp.fromMillis(Date.now() + 9e9) })));
    await assertFails(setDoc(doc(alice(), 'predictions/alice_mX'), pick({ matchId: 'mX' })));
    await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(), 'predictions/alice_m1'), pick()));
  });
  it("hides other players' picks", async () => {
    await assertFails(getDoc(doc(alice(), 'predictions/bob_m2')));
    await assertFails(getDocs(query(collection(alice(), 'predictions'), where('matchId', '==', 'm2'))));
    await assertSucceeds(getDocs(query(collection(alice(), 'predictions'), where('uid', '==', 'alice'))));
  });
});

describe('head-to-heads', () => {
  it('only the two players can read a challenge or rivalry', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'challenges/c1'), { players: ['alice', 'bob'], to: 'bob', status: 'pending' });
      await setDoc(doc(ctx.firestore(), 'rivalries/alice_bob'), { players: ['alice', 'bob'] });
    });
    await assertSucceeds(getDoc(doc(alice(), 'challenges/c1')));
    await assertSucceeds(getDocs(query(collection(alice(), 'challenges'), where('players', 'array-contains', 'alice'), where('status', '==', 'pending'))));
    await assertSucceeds(getDoc(doc(alice(), 'rivalries/alice_bob')));
    const carol = env.authenticatedContext('carol').firestore();
    await assertFails(getDoc(doc(carol, 'challenges/c1')));
    await assertFails(getDoc(doc(carol, 'rivalries/alice_bob')));
    await assertFails(setDoc(doc(alice(), 'challenges/c2'), { players: ['alice', 'bob'] }));
  });
});

describe('everything else is read-only from the app', () => {
  it('profiles are readable but not writable', async () => {
    await assertSucceeds(getDoc(doc(alice(), 'users/bob')));
    await assertFails(setDoc(doc(alice(), 'users/alice'), { nickname: 'x', stats: { points: 999 } }));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'users/bob')));
  });
  it('private data is only yours', async () => {
    await assertFails(getDoc(doc(alice(), 'private/bob')));
    await assertSucceeds(getDoc(doc(env.authenticatedContext('bob').firestore(), 'private/bob')));
  });
  it('leagues and chat are members only', async () => {
    await assertFails(getDoc(doc(alice(), 'leagues/ABC123')));
    await assertFails(getDocs(collection(alice(), 'leagues/ABC123/messages')));
    await assertFails(setDoc(doc(alice(), 'leagues/ABC123/messages/y'), { text: 'sneaky' }));
    const bob = env.authenticatedContext('bob').firestore();
    await assertSucceeds(getDoc(doc(bob, 'leagues/ABC123')));
    await assertSucceeds(getDocs(collection(bob, 'leagues/ABC123/messages')));
    await assertSucceeds(getDocs(query(collection(bob, 'leagues'), where('members', 'array-contains', 'bob'))));
    await assertFails(setDoc(doc(bob, 'leagues/ABC123/messages/z'), { text: 'direct write' }));
  });
});

describe('server-only data', () => {
  it('keeps quiz answers, quiz scores, live picks and highlights away from the app', async () => {
    for (const path of ['quizzes/2026-10-31', 'quizPlays/2026-10-31_alice', 'livePicks/m2_next_0-0_alice', 'highlights/m2', 'penGames/g1']) {
      await assertFails(getDoc(doc(alice(), path)));
      await assertFails(setDoc(doc(alice(), path), { uid: 'alice', score: 5 }));
    }
  });
});
