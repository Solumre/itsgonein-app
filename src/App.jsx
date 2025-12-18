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
    const fetchData = async () => {
      try {
        setLoading(true);
        const res = await fetch(`https://itsgonein.com/football-proxy.php?league=${currentLeague}&type=${view}`);
        const json = await res.json();
        
        // Accurate mapping to ensure no teams or stats are dropped
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
    fetchData();
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
    <div className="elite-app">
       <div className="ticker-panel">
        <div className="ticker-stream">
          {tickerData.map((m, i) => (
            <div key={i} className="ticker-match">
              <span className="live-dot"></span>
              {m.homeTeam?.shortName} vs {m.awayTeam?.shortName}
            </div>
          ))}
        </div>
      </div>

      <div className="pro-grid">
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

         <main className="match-center">
          <header className="center-header">
            <div className="view-tabs">
              <button className={view === 'standings' ? 'on' : ''} onClick={() => setView('standings')}>TABLE</button>
              <button className={view === 'scorers' ? 'on' : ''} onClick={() => setView('scorers')}>SCORERS</button>
              <button className={view === 'matches' ? 'on' : ''} onClick={() => setView('matches')}>FIXTURES</button>
            </div>
          </header>

          <div className="data-display glass">
            <AnimatePresence mode="wait">
              {loading ? <div className="loader">DECODING DATA...</div> : (
                <motion.div key={view + currentLeague} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="scroll-content">
                  {view === 'standings' && (
                    <table className="elite-table">
                      <thead><tr><th>#</th><th>TEAM</th><th>P</th><th>GD</th><th>PTS</th></tr></thead>
                      <tbody>
                        {data.map(t => (
                          <tr key={t.team?.id} onClick={() => toggleCompare(t)} className={compareList.some(c => c.team?.id === t.team?.id) ? 'marked' : ''}>
                            <td>{t.position}</td>
                            <td className="team-cell"><img src={t.team?.crest} width="20" alt=""/> {t.team?.shortName}</td>
                            <td>{t.playedGames}</td><td>{t.goalDifference}</td><td className="pts-neon">{t.points}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {view === 'scorers' && data.map(s => (
                    <div key={s.player?.id} className="stat-row-pro">
                      <div className="p-details"><img src={s.team?.crest} width="18"/> <strong>{s.player?.name}</strong></div>
                      <div className="p-count"><span className="pts-neon">{s.goals} G</span> / {s.assists || 0} A</div>
                    </div>
                  ))}

                  {view === 'matches' && data.map(m => (
                    <div key={m.id} className="fixture-row-pro">
                      <div className="f-main">
                        <div className="f-team"><img src={m.homeTeam?.crest} width="20"/> {m.homeTeam?.shortName}</div>
                        <span className="vs">VS</span>
                        <div className="f-team"><img src={m.awayTeam?.crest} width="20"/> {m.awayTeam?.shortName}</div>
                      </div>
                     </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </main>

       {/* --- REORGANIZED ANALYST PANEL --- */}
<aside className="analyst-panel">
  <div className="panel-header">
    <h2 className="glow-label">TACTICAL ANALYST</h2>
    <p className="sub-label">Live Player & Team Tracking</p>
  </div>

  {/* THE PITCH VISUALIZER */}
  <div className="pitch-container glass">
    <div className="football-pitch">
      {/* Dynamic Marker Logic */}
      {compareList.length > 0 ? (
        compareList.map((team, i) => (
          <motion.div 
            key={team.team.id} 
            className={`pitch-marker team-pos-${i}`}
            initial={{ scale: 0 }} 
            animate={{ scale: 1 }}
          >
            <div className="marker-glow"></div>
            <img src={team.team.crest} alt="" className="pitch-crest" />
            <span className="marker-name">{team.team.shortName}</span>
          </motion.div>
        ))
      ) : view === 'scorers' && data[0] ? (
        <motion.div className="pitch-marker striker" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <div className="marker-glow accent"></div>
          <span className="marker-label">TOP SCORER</span>
          <span className="marker-name">{data[0].player.name}</span>
        </motion.div>
      ) : (
        <p className="pitch-placeholder">Select teams to analyze tactical gap</p>
      )}
    </div>
  </div>

  {/* THE H2H COMPARISON CARD */}
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
              <div className="bar"><div className="fill" style={{ width: '55%' }}></div></div>
              <span className="val">{compareList[1].points}</span>
            </div>
          </div>
          {/* Add more stat groups for GD, Wins, etc. */}
        </div>
        
        <button className="reset-btn-pro" onClick={() => setCompareList([])}>NEW ANALYSIS</button>
      </div>
    ) : (
      <div className="empty-state">
        <p>Click two teams in the standings to generate a tactical comparison.</p>
      </div>
    )}
  </div>
</aside>
      </div>
    </div>
  );
}

export default App;