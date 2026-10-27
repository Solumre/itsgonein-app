// Daily quiz: five questions a day, the same for everyone. Some are made from the real
// data (last week's scores, the table, top scorers, club badges), the rest come from a
// bank of football facts. A day's quiz is saved the first time it's asked for, so it
// can't change as results come in.
import { db, FieldValue } from './firebase.js';

export const QUIZ_LENGTH = 5;
export const QUIZ_XP = 3; // XP per right answer

// [question, right answer, three wrong answers]
export const TRIVIA = [
  ['Who won the 2022 World Cup?', 'Argentina', 'France', 'Brazil', 'Croatia'],
  ['Which country hosted the 2022 World Cup?', 'Qatar', 'Russia', 'Brazil', 'USA'],
  ['Who won Euro 2024?', 'Spain', 'England', 'France', 'Germany'],
  ['Which country hosted Euro 2024?', 'Germany', 'England', 'Spain', 'Italy'],
  ['Who won Euro 2020 (played in 2021)?', 'Italy', 'England', 'Spain', 'France'],
  ['In which year did England win the men\'s World Cup?', '1966', '1970', '1990', '1996'],
  ['Which countries are hosting the 2026 World Cup?', 'USA, Canada and Mexico', 'England, Scotland and Wales', 'Spain and Portugal', 'Brazil and Argentina'],
  ['Who won the 2023 Women\'s World Cup?', 'Spain', 'England', 'USA', 'Sweden'],
  ['What is the England women\'s team nicknamed?', 'The Lionesses', 'The Three Lions', 'The Roses', 'The Eagles'],
  ['Who won the Women\'s Euro in both 2022 and 2025?', 'England', 'Spain', 'Germany', 'Netherlands'],
  ['How many players does each team have on the pitch?', '11', '10', '12', '9'],
  ['How long is each half of a normal match?', '45 minutes', '40 minutes', '50 minutes', '30 minutes'],
  ['What colour card sends a player off?', 'Red', 'Yellow', 'Blue', 'Green'],
  ['How many points does a team get for a league win?', '3', '2', '1', '4'],
  ['How many teams are in the Premier League?', '20', '18', '22', '24'],
  ['How many teams go down from the Premier League each season?', '3', '2', '4', '5'],
  ['What is it called when a player scores three goals in one game?', 'A hat-trick', 'A treble', 'A triple', 'A full house'],
  ['How far is the penalty spot from the goal line?', '12 yards', '10 yards', '15 yards', '18 yards'],
  ['What does VAR stand for?', 'Video Assistant Referee', 'Very Accurate Referee', 'Video Action Replay', 'Visual Aid Review'],
  ['Which club is nicknamed "The Gunners"?', 'Arsenal', 'Chelsea', 'West Ham', 'Spurs'],
  ['Which club is nicknamed "The Red Devils"?', 'Manchester United', 'Liverpool', 'Nottingham Forest', 'Southampton'],
  ['Which club is nicknamed "The Toffees"?', 'Everton', 'Fulham', 'Brentford', 'Wolves'],
  ['Which club is nicknamed "The Magpies"?', 'Newcastle United', 'Everton', 'Fulham', 'Burnley'],
  ['Which club is nicknamed "The Hammers"?', 'West Ham United', 'Crystal Palace', 'Brentford', 'Bournemouth'],
  ['Which club is nicknamed "The Seagulls"?', 'Brighton', 'Southampton', 'Bournemouth', 'Sunderland'],
  ['Which club is nicknamed "The Cherries"?', 'Bournemouth', 'Brentford', 'Burnley', 'Watford'],
  ['Which club is nicknamed "The Bees"?', 'Brentford', 'Burnley', 'Watford', 'Wolves'],
  ['Which club is nicknamed "The Saints"?', 'Southampton', 'Sunderland', 'Sheffield United', 'Stoke City'],
  ['Which club is nicknamed "The Foxes"?', 'Leicester City', 'Wolves', 'Fulham', 'Ipswich Town'],
  ['Which club plays at Anfield?', 'Liverpool', 'Everton', 'Manchester United', 'Leeds United'],
  ['Which club plays at Old Trafford?', 'Manchester United', 'Manchester City', 'Liverpool', 'Aston Villa'],
  ['Which club plays at Stamford Bridge?', 'Chelsea', 'Fulham', 'Arsenal', 'Crystal Palace'],
  ['Which club plays at the Etihad Stadium?', 'Manchester City', 'Manchester United', 'Arsenal', 'Newcastle United'],
  ['Which club plays at St James\' Park?', 'Newcastle United', 'Sunderland', 'Leeds United', 'Aston Villa'],
  ['Which club plays at Villa Park?', 'Aston Villa', 'West Ham United', 'Wolves', 'Chelsea'],
  ['Which club plays at Selhurst Park?', 'Crystal Palace', 'Brentford', 'Fulham', 'Brighton'],
  ['Which club plays at Molineux?', 'Wolves', 'Aston Villa', 'Burnley', 'Everton'],
  ['Which club plays at Craven Cottage?', 'Fulham', 'Chelsea', 'Brentford', 'Crystal Palace'],
  ['Which club plays at Elland Road?', 'Leeds United', 'Sunderland', 'Burnley', 'Nottingham Forest'],
  ['What is Tottenham\'s full name?', 'Tottenham Hotspur', 'Tottenham United', 'Tottenham Rovers', 'Tottenham Athletic'],
  ['Who won the first ever Premier League title, in 1992-93?', 'Manchester United', 'Arsenal', 'Blackburn Rovers', 'Liverpool'],
  ['Which team went a whole Premier League season unbeaten in 2003-04?', 'Arsenal', 'Chelsea', 'Manchester United', 'Liverpool'],
  ['Which club amazed everyone by winning the Premier League in 2015-16?', 'Leicester City', 'Tottenham Hotspur', 'Everton', 'West Ham United'],
  ['Who won the Premier League in 2024-25?', 'Liverpool', 'Arsenal', 'Manchester City', 'Chelsea'],
  ['Who won the Champions League in 2024-25?', 'Paris Saint-Germain', 'Inter Milan', 'Real Madrid', 'Arsenal'],
  ['Who won the Champions League in 2022-23?', 'Manchester City', 'Real Madrid', 'Inter Milan', 'Bayern Munich'],
  ['Who has scored the most Premier League goals ever?', 'Alan Shearer', 'Harry Kane', 'Wayne Rooney', 'Thierry Henry'],
  ['Which country does Erling Haaland play for?', 'Norway', 'Sweden', 'Denmark', 'Iceland'],
  ['Which country does Mohamed Salah play for?', 'Egypt', 'Morocco', 'Senegal', 'Tunisia'],
  ['Which country does Kylian Mbappé play for?', 'France', 'Belgium', 'Spain', 'Portugal'],
  ['Which country does Cristiano Ronaldo play for?', 'Portugal', 'Spain', 'Brazil', 'Italy'],
  ['Which country does Lionel Messi play for?', 'Argentina', 'Spain', 'Uruguay', 'Brazil'],
  ['Which club did Harry Kane join from Spurs in 2023?', 'Bayern Munich', 'Manchester United', 'Real Madrid', 'PSG'],
  ['Which club did Jude Bellingham join in 2023?', 'Real Madrid', 'Liverpool', 'Manchester City', 'Barcelona'],
  ['Which country are Juventus from?', 'Italy', 'Spain', 'Germany', 'Portugal'],
  ['Which country are Ajax from?', 'Netherlands', 'Belgium', 'Germany', 'Denmark'],
  ['Which country are Benfica from?', 'Portugal', 'Spain', 'Brazil', 'Italy'],
  ['Which competition do Europe\'s top clubs play in?', 'Champions League', 'Europa League', 'Conference League', 'FA Cup'],
  ['What is the oldest football cup competition in the world?', 'FA Cup', 'Champions League', 'World Cup', 'League Cup'],
];

// ---- pure helpers (unit tested) ----

// Today's date in the UK, e.g. "2026-10-31", so the quiz changes at UK midnight.
export function quizDate(now = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(now));
}

export function rng(seedText) {
  let h = 1779033703 ^ seedText.length;
  for (let i = 0; i < seedText.length; i++) { h = Math.imul(h ^ seedText.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}
const pick = (r, list) => list[Math.floor(r() * list.length)];
const shuffle = (r, list) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
const q = (r, kind, text, right, wrong, extra = {}) => {
  const options = shuffle(r, [right, ...wrong.slice(0, 3)]);
  return { kind, text, options, answer: options.indexOf(right), ...extra };
};
const ordinal = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}`;

function resultQ(r, matches, now) {
  const recent = matches.filter((m) => m.status === 'finished' && m.score && now - new Date(m.kickoff) < 10 * 86400_000);
  if (!recent.length) return null;
  const m = pick(r, recent);
  const { home: h, away: a } = m.score;
  const wrong = shuffle(r, [[h + 1, a], [h, a + 1], [a, h], [Math.max(0, h - 1), a], [h, Math.max(0, a - 1)], [h + 1, a + 1]]
    .filter(([x, y]) => x !== h || y !== a)
    .map(([x, y]) => `${x}–${y}`)
    .filter((s, i, all) => all.indexOf(s) === i && s !== `${h}–${a}`));
  return q(r, 'result', `What was the score when ${m.home.name} played ${m.away.name} in the last few days?`, `${h}–${a}`, wrong, { teams: [m.home, m.away] });
}

function tableQ(r, table) {
  if (!table || table.length < 8) return null;
  const pos = pick(r, [1, 1, 2, 3, 4, table.length]);
  const row = table.find((x) => x.position === pos);
  if (!row || table.filter((x) => x.points === row.points).length > 1) return null; // ties make it unfair
  const near = shuffle(r, table.filter((x) => x.team.id !== row.team.id && Math.abs(x.position - pos) <= 4)).map((x) => x.team.name);
  const where = pos === 1 ? 'top of' : pos === table.length ? 'bottom of' : `${ordinal(pos)} in`;
  return q(r, 'table', `Who is ${where} the Premier League right now?`, row.team.name, near);
}

function scorerQ(r, scorers) {
  if (!scorers?.length) return null;
  const s = pick(r, scorers.slice(0, 6));
  if (!s.goals) return null;
  const wrong = shuffle(r, [s.goals - 2, s.goals - 1, s.goals + 1, s.goals + 2, s.goals + 3].filter((n) => n >= 0)).map(String);
  return q(r, 'scorer', `How many Premier League goals has ${s.name} (${s.team.name}) scored this season?`, String(s.goals), wrong);
}

function crestQ(r, teams) {
  const withCrest = (teams || []).filter((t) => t.crest);
  if (withCrest.length < 4) return null;
  const t = pick(r, withCrest);
  return q(r, 'crest', 'Which club\'s badge is this?', t.name, shuffle(r, withCrest.filter((x) => x.id !== t.id)).map((x) => x.name), { image: t.crest });
}

// The day's five questions. Up to three from the data, the rest from the bank.
export function buildQuiz(date, { matches = [], table = [], scorers = [], teams = [] } = {}, now = Date.now()) {
  const r = rng(`quiz:${date}`);
  // The third one is a scorer or a badge question, whichever the day (and the data) allows.
  const third = r() < 0.5 ? scorerQ(r, scorers) || crestQ(r, teams) : crestQ(r, teams) || scorerQ(r, scorers);
  const chosen = [resultQ(r, matches, now), tableQ(r, table), third].filter(Boolean);
  const bank = shuffle(r, TRIVIA).slice(0, QUIZ_LENGTH - chosen.length)
    .map(([text, right, ...wrong]) => q(r, 'trivia', text, right, wrong));
  return shuffle(r, [...chosen, ...bank]).map((x, i) => ({ ...x, n: i }));
}

// Days in a row with a quiz played, ending today or yesterday.
export function quizStreak(dates, today) {
  const set = new Set(dates);
  const step = (d, n) => { const t = new Date(`${d}T12:00:00Z`); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };
  let d = set.has(today) ? today : step(today, -1);
  let n = 0;
  while (set.has(d)) { n++; d = step(d, -1); }
  return n;
}

// ---- Firestore ----

const quizzes = db.collection('quizzes');
const plays = db.collection('quizPlays');
export const publicQuestion = ({ answer, ...rest }) => rest; // eslint-disable-line no-unused-vars

export async function getQuiz(date, loadData) {
  const ref = quizzes.doc(date);
  const have = await ref.get();
  if (have.exists) return have.data().questions;
  const questions = buildQuiz(date, await loadData());
  try {
    await ref.create({ date, questions, createdAt: FieldValue.serverTimestamp() });
    return questions;
  } catch (e) {
    if (e.code === 6) return (await ref.get()).data().questions; // made by someone else just now
    throw e;
  }
}

export async function getPlay(uid, date) {
  const d = await plays.doc(`${date}_${uid}`).get();
  return d.exists ? d.data() : null;
}

// Answer question n. Returns whether it was right and the right answer.
export async function answerQuestion({ uid, date, questions, n, choice }) {
  const question = questions[n];
  if (!question) throw Object.assign(new Error('No such question.'), { status: 400, expose: true });
  if (!Number.isInteger(choice) || choice < 0 || choice >= question.options.length) throw Object.assign(new Error('Pick an answer.'), { status: 400, expose: true });
  const ref = plays.doc(`${date}_${uid}`);
  return db.runTransaction(async (tx) => {
    const cur = (await tx.get(ref)).data() || { uid, date, answers: Array(questions.length).fill(null), score: 0 };
    if (cur.answers[n] != null) throw Object.assign(new Error('You\'ve already answered that one.'), { status: 409, expose: true });
    const right = choice === question.answer;
    const answers = [...cur.answers];
    answers[n] = choice;
    const done = answers.every((a) => a != null);
    tx.set(ref, { ...cur, answers, score: cur.score + (right ? 1 : 0), done, updatedAt: FieldValue.serverTimestamp() });
    return { right, answer: question.answer, score: cur.score + (right ? 1 : 0), done };
  });
}

export async function quizStats(uid, today = quizDate()) {
  const snap = await plays.where('uid', '==', uid).get();
  const all = snap.docs.map((d) => d.data());
  return {
    total: all.reduce((s, p) => s + (p.score || 0), 0),
    played: all.filter((p) => p.done).length,
    streak: quizStreak(all.map((p) => p.date), today),
  };
}

export async function playsFor(uids, date) {
  if (!uids.length) return [];
  const docs = await db.getAll(...uids.map((u) => plays.doc(`${date}_${u}`)));
  return docs.filter((d) => d.exists).map((d) => d.data());
}
