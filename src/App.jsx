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
   const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const res = await fetch(`https://itsgonein.com/football-proxy.php?league=${currentLeague}&type=${view}`);
        const json = await res.json();
        
        // Safety mapping logic
        if (view === 'standings') setData(json.standings?.[0]?.table || []);
        else if (view === 'scorers') setData(json.scorers || []);
        else if (view === 'matches') setData(json.matches || []);
      } catch (e) {
        setData([]);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [currentLeague, view]);

  return (
    <div className="pro-dashboard">
      <div className="live-ticker-wrap">
        <div className="ticker-scroll">
          {newsData.map((n, i) => <span key={i}>⚡️ {n.title} • {n.result} • </span>)}
        </div>
      </div>

      <div className="layout-grid">
        <aside className="league-sidebar">
          <h1 className="logo">ITS<span>GONE</span>IN<span>.</span></h1>
          {LEAGUES.map(l => (
            <button key={l.id} className={currentLeague === l.id ? 'active' : ''} onClick={() => setCurrentLeague(l.id)}>
              {l.name}
            </button>
          ))}
        </aside>

        <main className="main-hub">
          <div className="center-controls">
            <h2>{LEAGUES.find(l => l.id === currentLeague)?.name} Hub</h2>
            <div className="tab-switcher">
              {['standings', 'scorers', 'matches'].map(v => (
                <button key={v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>
                  {v.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="stats-container glass">
            <AnimatePresence mode="wait">
              {loading ? <div className="loader">SYNCING DATA...</div> : (
                <motion.div key={view + currentLeague} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="scroll-panel">
                  {view === 'standings' && (
                    <table className="elite-table">
                      <thead><tr><th>#</th><th>TEAM</th><th>GD</th><th>PTS</th></tr></thead>
                      <tbody>
                        {data.map(t => (
                          <tr key={t.team?.id}>
                            <td>{t.position}</td>
                            <td className="t-cell"><img src={t.team?.crest} width="22" /> {t.team?.shortName}</td>
                            <td>{t.goalDifference}</td><td className="neon-pts">{t.points}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {view === 'scorers' && data.map(s => (
                    <div key={s.player?.id} className="stat-row">
                      <span><strong>{s.player?.name}</strong></span>
                      <span className="neon-pts">{s.goals} Goals</span>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;