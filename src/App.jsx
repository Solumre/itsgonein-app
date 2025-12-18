import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import newsData from './news.json';
import './App.css';

const LEAGUES = [
  { name: 'Premier League', id: 'PL' },
  { name: 'La Liga', id: 'PD' },
  { name: 'Serie A', id: 'SA' },
  { name: 'Bundesliga', id: 'BL1' },
  { name: 'Brasileirão', id: 'BSA' }
];

function App() {
  const [currentLeague, setCurrentLeague] = useState('PL');
  const [view, setView] = useState('standings');
  const [data, setData] = useState([]);
  const [tickerData, setTickerData] = useState([]);
  const [loading, setLoading] = useState(true);

   useEffect(() => {
    fetch(`https://itsgonein.com/football-proxy.php?league=PL&type=matches`)
      .then(res => res.json())
      .then(json => setTickerData(json.matches?.slice(0, 15) || []));
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const res = await fetch(`https://itsgonein.com/football-proxy.php?league=${currentLeague}&type=${view}`);
        const json = await res.json();
        
        // Safety mapping logic to prevent data disappearance
        let finalData = [];
        if (view === 'standings') finalData = json.standings?.[0]?.table || [];
        else if (view === 'scorers') finalData = json.scorers || [];
        else if (view === 'matches') finalData = json.matches || [];
        
        setData(finalData);
      } catch (e) {
        setData([]);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [currentLeague, view]);

  return (
    <div className="pro-app">
      <div className="ticker-container">
        <div className="ticker-track">
          {tickerData.map((m, i) => (
            <span key={i} className="ticker-item">
              <span className="live-tag">LIVE</span>
              {m.homeTeam?.shortName} vs {m.awayTeam?.shortName} • {new Date(m.utcDate).getHours()}:00
            </span>
          ))}
        </div>
      </div>

      <div className="dashboard-grid">
        <aside className="sidebar">
          <h1 className="brand">ITS<span>GONE</span>IN<span>.</span></h1>
          <nav className="league-nav">
            {LEAGUES.map(l => (
              <button key={l.id} className={currentLeague === l.id ? 'active' : ''} onClick={() => setCurrentLeague(l.id)}>
                {l.name}
              </button>
            ))}
          </nav>
        </aside>

        <main className="main-hub">
          <header className="hub-nav">
            <div className="view-tabs">
              {['standings', 'scorers', 'matches'].map(v => (
                <button key={v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>
                  {v.toUpperCase()}
                </button>
              ))}
            </div>
          </header>

          <div className="hub-grid">
            <section className="stats-glass">
              <AnimatePresence mode="wait">
                {loading ? (
                  <div className="loader">CALIBRATING STATS...</div>
                ) : (
                  <motion.div key={view + currentLeague} initial={{opacity:0, y: 10}} animate={{opacity:1, y: 0}} className="scroll-panel">
                    {view === 'standings' && (
                      <table className="pro-table">
                        <thead><tr><th>POS</th><th>TEAM</th><th>GD</th><th>PTS</th></tr></thead>
                        <tbody>
                          {data.map(t => (
                            <tr key={t.team?.id}>
                              <td>{t.position}</td>
                              <td className="t-cell"><img src={t.team?.crest} width="22" /> {t.team?.shortName}</td>
                              <td>{t.goalDifference}</td>
                              <td className="neon-pts">{t.points}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {view === 'scorers' && (
                      <div className="scorers-list">
                        {data.map(s => (
                          <div key={s.player?.id} className="stat-row">
                            <div className="player-meta">
                              <span className="p-name">{s.player?.name}</span>
                              <span className="p-team">{s.team?.shortName}</span>
                            </div>
                            <div className="p-vals">
                              <span className="v-main">{s.goals} G</span>
                              <span className="v-sub">{s.assists || 0} A</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </section>

            {/* 🎯 THE TEAM OF THE WEEK / FANTASY SCOUT */}
            <section className="scout-column">
              <h2 className="glow-label">FANTASY SCOUT</h2>
              <div className="pitch-card glass">
                <div className="pitch-visual">
                  {/* Automated "Top Player" Pitch Positioning */}
                  {view === 'scorers' && data[0] ? (
                    <div className="pitch-player striker">
                      <div className="player-dot"></div>
                      <p>{data[0].player.name}</p>
                      <span>MVP</span>
                    </div>
                  ) : <p className="pitch-loading">Analyzing Pitch Performance...</p>}
                </div>
                <div className="scout-insights">
                  <p><strong>Hot Streak:</strong> {data[0]?.player.name || "N/A"} has {data[0]?.goals || 0} goals.</p>
                </div>
              </div>
              
              <div className="news-stack">
                {newsData.slice(0, 2).map(n => (
                  <div key={n.id} className="mini-card glass">
                    <img src={n.image} />
                    <span>{n.title}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;