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
    fetch(`https://itsgonein.com/football-proxy.php?league=PL&type=matches`)
      .then(res => res.json())
      .then(json => setTickerData(json.matches?.slice(0, 15) || []));
  }, []);

  useEffect(() => {
    const fetchEliteData = async () => {
      try {
        setLoading(true);
        const res = await fetch(`https://itsgonein.com/football-proxy.php?league=${currentLeague}&type=${view}`);
        const json = await res.json();
        
        // Dynamic Data Normalization
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
    <div className="elite-app">
      {/* ⚡️ BROADCAST TICKER */}
      <div className="ticker-panel">
        <div className="ticker-stream">
          {tickerData.map((m, i) => (
            <div key={i} className="ticker-match">
              <span className="live-dot"></span>
              {m.homeTeam?.shortName} {m.score?.fullTime?.home ?? ''} vs {m.awayTeam?.shortName} {m.score?.fullTime?.away ?? ''}
            </div>
          ))}
        </div>
      </div>

      <div className="pro-grid">
        {/* LEAGUE SIDEBAR */}
        <aside className="elite-sidebar">
          <h1 className="brand">ITS<span>GONE</span>IN<span>.</span></h1>
          <nav className="league-nav">
            <p className="label-dim">ELITE CIRCUITS</p>
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

        {/* CENTER HUB */}
        <main className="match-center">
          <header className="center-header">
            <div className="view-tabs">
              {['standings', 'scorers', 'matches'].map(v => (
                <button key={v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>
                  {v.toUpperCase()}
                </button>
              ))}
            </div>
          </header>

          <div className="data-display glass">
            <AnimatePresence mode="wait">
              {loading ? <div className="loader">DECODING DATA...</div> : (
                <motion.div key={view + currentLeague} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="scroll-content">
                  {view === 'standings' && (
                    <table className="elite-table">
                      <thead><tr><th>#</th><th>TEAM</th><th>GD</th><th>PTS</th></tr></thead>
                      <tbody>
                        {data.map(t => (
                          <tr key={t.team?.id} onClick={() => toggleCompare(t)} className={compareList.some(c => c.team?.id === t.team?.id) ? 'marked' : ''}>
                            <td>{t.position}</td>
                            <td className="team-cell"><img src={t.team?.crest} width="20" alt=""/> {t.team?.shortName}</td>
                            <td>{t.goalDifference}</td><td className="pts-neon">{t.points}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {view === 'scorers' && data.map(s => (
                    <div key={s.player?.id} className="stat-card-pro">
                      <div className="p-details"><strong>{s.player?.name}</strong><span>{s.team?.shortName}</span></div>
                      <div className="p-count"><span className="pts-neon">{s.goals} G</span> / {s.assists || 0} A</div>
                    </div>
                  ))}
                  {view === 'matches' && data.slice(0, 10).map(m => (
                    <div key={m.id} className="fixture-card-pro">
                      <div className="f-teams">{m.homeTeam?.shortName} vs {m.awayTeam?.shortName}</div>
                      <div className="f-gauge"><div className="gauge-fill" style={{width: '65%'}}></div></div>
                      <span className="f-prob">Win Chance: 65% | 35%</span>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>

        {/* RIGHT ANALYST PANEL */}
        <aside className="analyst-panel">
          <h2 className="label-dim">TACTICAL ANALYST</h2>
          <div className="pitch-box glass">
             <div className="pitch-canvas">
                {view === 'scorers' && data[0] && (
                  <div className="pitch-marker striker"><div className="glow-dot"></div><p>{data[0].player?.name}</p></div>
                )}
             </div>
          </div>
          
          {compareList.length === 2 && (
            <div className="h2h-summary glass neon-border">
              <h3>H2H COMPARISON</h3>
              <div className="h2h-row"><span>{compareList[0].points}</span><label>PTS</label><span>{compareList[1].points}</span></div>
              <button className="reset-btn" onClick={() => setCompareList([])}>CLEAR ANALYST</button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

export default App;