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

  // One definitive function for data fetching
  const fetchEliteStats = async () => {
    try {
      setLoading(true);
      const res = await fetch(`https://itsgonein.com/football-proxy.php?league=${currentLeague}&type=${view}`);
      const json = await res.json();
      
      let normalized = [];
      if (view === 'standings') normalized = json.standings?.[0]?.table || [];
      else if (view === 'scorers') normalized = json.scorers || [];
      else if (view === 'matches') normalized = json.matches || [];
      setData(normalized);
    } catch (e) {
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetch(`https://itsgonein.com/football-proxy.php?league=PL&type=matches`)
      .then(res => res.json())
      .then(json => setTickerData(json.matches?.slice(0, 15) || []));
  }, []);
ß
  useEffect(() => {
    fetchEliteStats();
  }, [currentLeague, view]);

  const toggleCompare = (team) => {
    if (!team?.team?.id) return;
    if (compareList.find(t => t.team?.id === team.team?.id)) {
      setCompareList(compareList.filter(t => t.team?.id !== team.team?.id));
    } else if (compareList.length < 2) {
      setCompareList([...compareList, team]);
    }
  };

  return (
    <div className="pro-app">
      {/* ⚡️ LIVE TICKER */}
      <div className="ticker-panel">
        <div className="ticker-stream">
          {tickerData.map((m, i) => (
            <div key={i} className="ticker-item">
              <span className="live-dot"></span>
              {m.homeTeam?.shortName} vs {m.awayTeam?.shortName}
            </div>
          ))}
        </div>
      </div>

      <div className="dashboard-grid">
        {/* SIDEBAR NAVIGATION */}
        <aside className="sidebar">
          <h1 className="brand">ITS<span>GONE</span>IN<span>.</span></h1>
          <nav className="league-nav">
            <p className="sidebar-label">ELITE CIRCUITS</p>
            {LEAGUES.map(l => (
              <button 
                key={l.id} 
                className={`league-btn ${currentLeague === l.id ? 'active' : ''}`}
                onClick={() => { setCurrentLeague(l.id); setCompareList([]); }}
                style={{ '--league-glow': l.color }}
              >
                {l.name}
              </button>
            ))}
          </nav>
        </aside>

        {/* MAIN DATA HUB */}
        <main className="main-hub">
          <header className="hub-header">
            <div className="tabs">
              <button className={view === 'standings' ? 'active' : ''} onClick={() => setView('standings')}>TABLE</button>
              <button className={view === 'scorers' ? 'active' : ''} onClick={() => setView('scorers')}>SCORERS</button>
              <button className={view === 'matches' ? 'active' : ''} onClick={() => setView('matches')}>FIXTURES</button>
            </div>
          </header>

          <div className="data-box glass">
            <AnimatePresence mode="wait">
              {loading ? (
                <div className="loader">DECRYPTING STATS...</div>
              ) : (
                <motion.div key={view + currentLeague} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="scroll-content">
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
                    <div key={s.player?.id} className="pro-list-row">
                      <div className="p-meta"><img src={s.team?.crest} width="20" alt=""/> <strong>{s.player?.name}</strong></div>
                      <span className="neon-pts">{s.goals} Goals</span>
                    </div>
                  ))}
                  {view === 'matches' && data.map(m => (
                    <div key={m.id} className="pro-match-card">
                      <div className="m-teams">{m.homeTeam?.shortName} vs {m.awayTeam?.shortName}</div>
                      <span className="dim-text">{new Date(m.utcDate).toLocaleDateString()}</span>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>

        {/* TACTICAL ANALYST */}
        <aside className="analyst-panel">
          <h2 className="sidebar-label">TACTICAL ANALYST</h2>
          <div className="pitch-container glass">
            <div className="football-pitch">
              {compareList.length > 0 ? (
                compareList.map((team, i) => (
                  <div key={team.team.id} className={`pitch-marker team-pos-${i}`}>
                    <div className="marker-glow"></div>
                    <span className="marker-name">{team.team.shortName}</span>
                  </div>
                ))
              ) : view === 'scorers' && data[0] ? (
                <div className="pitch-marker striker">
                  <div className="marker-glow"></div>
                  <span className="marker-name">{data[0].player.name}</span>
                  <span className="marker-label">MVP</span>
                </div>
              ) : <p className="pitch-placeholder">Select teams to analyze</p>}
            </div>
          </div>

          <div className="h2h-comparison-card glass">
            <h3 className="card-title">H2H COMPARISON</h3>
            {compareList.length === 2 ? (
              <div className="comparison-engine">
                <div className="comp-row teams">
                  <span>{compareList[0].team.shortName}</span>
                  <span className="vs-badge">VS</span>
                  <span>{compareList[1].team.shortName}</span>
                </div>
                <div className="stat-bars">
                  <div className="stat-group">
                    <label>POINTS</label>
                    <div className="bar-wrapper">
                      <span className="val">{compareList[0].points}</span>
                      <div className="bar"><div className="fill" style={{ width: `${(compareList[0].points / (compareList[0].points + compareList[1].points)) * 100}%` }}></div></div>
                      <span className="val">{compareList[1].points}</span>
                    </div>
                  </div>
                </div>
                <button className="reset-btn-pro" onClick={() => setCompareList([])}>NEW ANALYSIS</button>
              </div>
            ) : <p className="dim-hint">Click 2 teams in the table to compare stats.</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}

export default App;