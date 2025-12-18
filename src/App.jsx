import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import newsData from './news.json';
import './App.css';

const LEAGUES = [
  { name: 'Premier League', id: 'PL', color: '#00ff88' },
  { name: 'La Liga', id: 'PD', color: '#ff4d4d' },
  { name: 'Serie A', id: 'SA', color: '#00d4ff' },
  { name: 'Bundesliga', id: 'BL1', color: '#ffcc00' },
  { name: 'Brasileirão', id: 'BSA', color: '#22c55e' }
];

function App() {
  const [currentLeague, setCurrentLeague] = useState('PL');
  const [view, setView] = useState('standings');
  const [data, setData] = useState([]);
  const [tickerData, setTickerData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [compareList, setCompareList] = useState([]);

   useEffect(() => {
    fetch('https://itsgonein.com/football-proxy.php?league=PL&type=matches')
      .then(res => res.json())
      .then(json => setTickerData(json.matches?.slice(0, 15) || []));
  }, []);

   useEffect(() => {
    const fetchEliteData = async () => {
      try {
        setLoading(true);
        const res = await fetch(`https://itsgonein.com/football-proxy.php?league=${currentLeague}&type=${view}`);
        const json = await res.json();
        
        // CRITICAL: Crash protection mapping
        if (view === 'standings') setData(json.standings?.[0]?.table || []);
        else if (view === 'scorers') setData(json.scorers || []);
        else if (view === 'matches') setData(json.matches || []);
      } catch (e) {
        setData([]);
      } finally {
        setLoading(false);
      }
    };
    fetchEliteData();
  }, [currentLeague, view]);

  const toggleCompare = (team) => {
    if (compareList.find(t => t.team?.id === team.team?.id)) {
      setCompareList(compareList.filter(t => t.team?.id !== team.team?.id));
    } else if (compareList.length < 2) {
      setCompareList([...compareList, team]);
    }
  };

  return (
     <div className="pro-app">
      <div className="ticker-wrap">
        <div className="ticker-move">
          {tickerData.map((m, i) => (
            <div key={i} className="ticker-item">
              <span className="live-dot"></span>
              {m.homeTeam?.shortName} vs {m.awayTeam?.shortName} • {new Date(m.utcDate).getHours()}:00
            </div>
          ))}
        </div>
      </div>

       <div className="dashboard-grid">
        <aside className="sidebar">
          <h1 className="brand">ITS<span>GONE</span>IN<span>.</span></h1>
          <nav className="league-nav">
            <p className="sidebar-label">ELITE LEAGUES</p>
            {LEAGUES.map(l => (
              <button 
                key={l.id} 
                className={`league-btn ${currentLeague === l.id ? 'active' : ''}`}
                onClick={() => { setCurrentLeague(l.id); setCompareList([]); }}
                style={{ '--league-color': l.color }}
              >
                {l.name}
              </button>
            ))}
          </nav>
        </aside>

        <main className="main-hub">
          <header className="hub-header">
            <div className="tabs">
              {['standings', 'scorers', 'matches'].map(v => (
                <button key={v} className={view === v ? 'active' : ''} onClick={() => setView(v)}>
                  {v.toUpperCase()}
                </button>
              ))}
            </div>
          </header>

          <div className="hub-content">
            <section className="stats-glass">
              <AnimatePresence mode="wait">
                {loading ? <div className="loader">SYNCING DATA...</div> : (
                  <motion.div key={view + currentLeague} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="data-area">
                    {view === 'standings' && (
                      <table className="pro-table clickable">
                        <thead><tr><th>#</th><th>TEAM</th><th>GD</th><th>PTS</th></tr></thead>
                        <tbody>
                          {data.map(t => (
                            <tr key={t.team?.id} onClick={() => toggleCompare(t)} className={compareList.find(c => c.team?.id === t.team?.id) ? 'selected' : ''}>
                              <td>{t.position}</td>
                              <td className="t-cell"><img src={t.team?.crest} width="22" alt="" /> {t.team?.shortName}</td>
                              <td>{t.goalDifference}</td>
                              <td className="neon-pts">{t.points}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {view === 'scorers' && data.map(s => (
                      <div key={s.player?.id} className="stat-row">
                        <span><strong>{s.player?.name}</strong> ({s.team?.shortName})</span>
                        <span className="neon-pts">{s.goals} G / {s.assists || 0} A</span>
                      </div>
                    ))}
                    {view === 'matches' && data.slice(0, 12).map(m => (
                      <div key={m.id} className="match-card-lite">
                        <div className="m-teams">{m.homeTeam?.shortName} vs {m.awayTeam?.shortName}</div>
                        <div className="m-date">{new Date(m.utcDate).toLocaleDateString()}</div>
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </section>
 
            <section className="scout-column">
              <h2 className="glow-label">TACTICAL ANALYST</h2>
              {compareList.length === 2 ? (
                <div className="h2h-card glass">
                  <div className="h2h-header"><img src={compareList[0].team?.crest} width="40"/> VS <img src={compareList[1].team?.crest} width="40"/></div>
                  <div className="h2h-stats">
                    <div className="h-row"><span>{compareList[0].points}</span><label>PTS</label><span>{compareList[1].points}</span></div>
                    <div className="h-row"><span>{compareList[0].goalDifference}</span><label>GD</label><span>{compareList[1].goalDifference}</span></div>
                  </div>
                  <button className="reset-btn" onClick={() => setCompareList([])}>RESET</button>
                </div>
              ) : (
                <div className="pitch-card glass">
                  <div className="pitch-visual">
                    {view === 'scorers' && data[0] && (
                      <div className="pitch-player striker"><div className="player-glow"></div><p>{data[0].player?.name}</p></div>
                    )}
                  </div>
                  <p className="hint">Select two teams to compare H2H.</p>
                </div>
              )}
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;