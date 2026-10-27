# ItsGoneIn

A Premier League score predictor for young fans (built for 10–15 year olds). Players predict every game, run private leagues with their mates, chat about it as the goals go in, pick their club's colours, and earn levels and badges.

## How it works

| | |
|---|---|
| **Predict** | Pick a score for every Premier League game. Picks lock at kickoff. 3 points for the exact score, 1 for the right result, and one **Double Up** per gameweek. Lucky dip fills any gaps. |
| **Leagues** | Create a league and share its 6-letter code or invite link. The table updates live during games, and the Picks grid shows everyone's picks once a game kicks off. |
| **Chat** | One chat per league, with quick-chat buttons, reactions, and "share my pick". The app posts kickoff and full-time messages ("🎯 Sam nailed the exact score!"). |
| **Your club** | The whole app takes on your club's colours (with contrast checks for navy or white kits). |
| **Champions League** | Predict Champions League games too (league phase matchdays, then the knockout rounds; knockouts count the score after 90 minutes). Each league gets a separate Champions League table, recap and wrap message. Switch with the Premier League / Champions League toggle on Predict and in a league. |
| **Bonus questions** | Each Premier League gameweek has three automatic questions on the Predict tab: total goals (3 pts exact, 1 within 2), which game has the most goals (2) and will any game finish 0–0 (1). An admin can add a fourth multiple-choice question from the Admin page and mark the answer afterwards (2). Answers lock at the first kickoff; points go into gameweek and season totals. |
| **Head-to-heads** | Tap ⚔️ next to a mate in a league table to challenge them to a one-v-one for the next round (Premier League or Champions League). They accept or decline before kickoff. The live score shows on the Leagues tab, the result goes into the league chat, and each pair keeps an all-time record. Only league mates can be challenged, blocked players can't, and declines aren't announced. |
| **Trophy cabinet** | Trophies won inside a league, shown on a shelf on the Me tab (and as 🏆 counts in league tables): 🏅 Gameweek winner and ⭐ UCL round winner (at each wrap), 🥇 Player of the Month (once the month's gameweeks are done), and at season end 🏆 League champion, 👟 Golden Boot (most exact scores) and 🌟 UCL champion. Monthly and season awards are announced in the league chat; ties share. |
| **Kick-off reminders** | Optional push notification an hour before each kickoff, only for games you haven't picked yet. |
| **Weekly recap** | When a gameweek finishes, each league's chat gets a "Gameweek wrapped" message with the podium, and players get a recap card on Predict (points, exact scores, best call, league finish) that they can save or share as an image. League names are left off the image. |
| **Progress** | XP, levels (Sunday League → GOAT), streaks and 11 badges. |
| **Match centre** | Tap any game (on Live, the ticker, or "Match centre ›" on Predict) for a full page: big scoreboard in both clubs' colours, your pick and what it scores if the game ends now, your league mates' picks and the split between them (hidden until kickoff, when it only says how many have picked), form, and head-to-head history. It refreshes every 30 seconds while the game is on, with confetti when a goal goes in. With a paid football-data plan the page also shows the timeline (goals, cards, subs), line-ups, venue and referee, with no code change. |
| **Highlights** | Each finished game gets its YouTube highlights in the match centre, and the latest ones sit in a strip at the top of Live. They're found automatically on official channels (Sky Sports Premier League to start with) by matching the two teams in the video title within 4 days of kickoff. Admins can add or remove channels and set or remove any game's video on the Admin page. Videos only load when tapped, use YouTube's privacy-enhanced mode, and don't show comments. |
| **Live** | Scores (flick back and forward through rounds with the ‹ › arrows), tables and top scorers for the PL, Championship, Champions League and the big European leagues, plus a Player of the Week poll. |
| **Admin** | Reports queue, delete/block, ticker message, Player of the Week poll, manual sync. |

### Safety (players are children)
- Chat only exists inside private leagues joined by code. There's no public chat and no private messages.
- Nicknames and emoji avatars only. Real names, photos and emails are never shown.
- All chat goes through the server: swearing, links, emails, phone numbers, @handles and "add me on snap/insta/…" are blocked, with rate limits.
- Any message can be reported (to the admin) or blocked. League owners can remove players.
- **Under-13s need a parent or carer's OK** before leagues and chat unlock. The child sends a link, and the parent signs in with their own Google account and approves (or withdraws approval later).
- Players can delete their account and all their data from the Me tab.

This follows the spirit of the ICO Children's Code. It isn't legal advice: if the app grows beyond friends and family, get a proper review.

## Architecture

```
React (Vite) app ──reads──▶ Firestore (profiles, leagues, chat, own picks)
      │  └──writes own picks (security rules lock them at kickoff)
      └──/api──▶ Express server (server/) ──▶ football-data.org (cached)
                       └── Firebase Admin: profiles, leagues, chat, moderation,
                           settling results, kickoff/full-time chat messages
```

- `server/football.js`: football-data.org client. One cached copy per feed is shared by everyone (60 s while games are on, 10 min otherwise), so the free tier's 10 calls a minute is plenty.
- `server/sync.js`: copies fixtures into Firestore (the rules read kickoff times from it), settles finished games and recalculates players' stats.
- `src/lib/game.js`: scoring, badges and levels, shared by the server and the app.
- `firestore.rules`: the app can only write its own picks before kickoff. Everything else goes through the server.

## Local development

You need Node 20+ and Java (for the Firebase emulators). No API keys are needed: it runs on emulators and a generated season.

```bash
npm install
npm run dev            # emulators + mock-data server + app on http://localhost:5173
```

When running against the emulators, sign in without Google from the browser console: `__devSignIn('you@example.com')`.

```bash
npm test               # unit tests (scoring, badges, chat filter)
npm run test:emulator  # security rules + full server flow against the emulators
npm run lint
```

## Deploying

1. **Rotate the old keys.** They were committed to this public repo. Revoke the API-Football key and the football-data.org key (the one in `football-proxy.php` on the `deploy` branch), then get a new free key from football-data.org. Consider deleting the `deploy` branch.
2. **Firebase** (project `itgonein`):
   - Authentication → Sign-in method → Google is enabled. Add your domain under Authorized domains.
   - Publish the security rules: `npx firebase-tools deploy --only firestore:rules --project itgonein`
   - Project settings → Service accounts → Generate new private key. Keep this file secret and never commit it.
   - The old collections (`messages`, `leaderboard`, `user_predictions`, `match_votes`, `banned_users`, `news`, `polls/current_poll`) are no longer used and the new rules block them. Delete them in the console.
3. **Render**: create the service from `render.yaml` (or by hand: build `npm ci && npm run build`, start `npm start`) and set:
   - `FOOTBALL_DATA_KEY`: your football-data.org key
   - `FIREBASE_SERVICE_ACCOUNT`: the service account JSON, pasted as one line
   - `VITE_FCM_VAPID_KEY`: for kick-off reminders. Firebase → Project settings → Cloud Messaging → Web Push certificates → Generate key pair, then copy the key pair string. It's a public key, so it's safe in the app.
   - `APP_URL`: the site's address, used in notification links (default `https://itsgonein.com`)
   - `ADMIN_EMAILS`: comma-separated admin Google emails (set the same list as `VITE_ADMIN_EMAILS` so the app shows them the Admin link)
4. **Keep it awake.** Render's free tier sleeps after 15 minutes, which delays results and makes the first visit slow. Point a free pinger (e.g. cron-job.org) at `https://<your-app>/api/health` every 10 minutes, or use Render's $7/month plan.

### Kick-off reminders
Players turn them on from the Me tab (or the prompt on Predict). The server's sync loop sends one push about an hour before each kickoff time to players who haven't picked those games, and drops tokens for devices that have gone. On iPhone, web push only works when ItsGoneIn is opened from the Home Screen (Share → Add to Home Screen, iOS 16.4+), and the app tells players so.

### Upgrading the data later
The free football-data.org plan has delayed scores and no goal scorers, cards or line-ups. **Free + Deep Data** (€29/month) adds live scores, line-ups, subs, scorers and cards for the same competitions, at 30 calls a minute. The match centre shows the extra data as soon as the plan provides it. After upgrading, set `FOOTBALL_DATA_CALLS_PER_MIN=25` on Render so live scores refresh every 30 seconds instead of every minute. If football-data issues a new API key, update `FOOTBALL_DATA_KEY` there too.