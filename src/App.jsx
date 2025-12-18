import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import newsData from './news.json';
import './App.css';

function App() {
  const [activeFilter, setActiveFilter] = useState('All');
  const [view, setView] = useState('standings'); 
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await fetch(`https://itsgonein.com/football-proxy.php?type=${view}`);
        const result = await response.json();
        
        // Correctly mapping based on specific API nested structures
        if (view === 'standings') setData(result.standings?.[0]?.table || []);
        if (view === 'scorers') setData(result.scorers || []);
        if (view === 'matches') setData(result.matches || []);
      } catch (error) {
        console.error("Fetch failed:", error);
        setData([]);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [view]);

  return (
    <div className="app-container">
      <header className="header">
        <h1 className="logo">ITS<span>GONE</span>IN<span>.</span></h1>
        <div className="filter-bar">
          {['All', 'Arsenal', 'Liverpool', 'Man City'].map(f => (
            <button 
              key={f} 
              className={`filter-btn ${activeFilter === f ? 'active' : ''}`} 
              onClick={() => setActiveFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
      </header>

       <section className="news-hero">
        <h2 className="section-label">LATEST ANALYSIS</h2>
        <div className="news-grid">
          {newsData.filter(n => activeFilter === 'All' || n.tag === activeFilter).map(news => (
            <motion.div layout key={news.id} className="news-card">
              <div className="card-img-wrap">
                <img src={news.image} alt="" />
                <span className="result-badge">{news.result}</span>
              </div>
              <div className="news-content">
                <span className="card-date">{news.date}</span>
                <h3>{news.title}</h3>
                <p>{news.excerpt}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

       <section className="stats-dashboard">
        <div className="dashboard-header">
          <h2 className="section-label">MATCH CENTER</h2>
          <div className="tab-group">
            <button className={view === 'standings' ? 'active' : ''} onClick={() => setView('standings')}>Table</button>
            <button className={view === 'scorers' ? 'active' : ''} onClick={() => setView('scorers')}>Scorers</button>
            <button className={view === 'matches' ? 'active' : ''} onClick={() => setView('matches')}>Fixtures</button>
          </div>
        </div>

        <div className="data-content">
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div initial={{opacity:0}} animate={{opacity:1}} className="loader">Updating Live Stats...</motion.div>
            ) : (
              <motion.div 
                key={view}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="scroll-container"
              >
                {view === 'standings' && (
                  <table className="modern-table">
                    <thead><tr><th>POS</th><th>TEAM</th><th>P</th><th>GD</th><th>PTS</th></tr></thead>
                    <tbody>
                      {data.map(t => (
                        <tr key={t.team.id}>
                          <td>{t.position}</td>
                          <td className="t-name"><img src={t.team.crest} width="20" alt=""/> {t.team.shortName}</td>
                          <td>{t.playedGames}</td><td>{t.goalDifference}</td><td className="pts">{t.points}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {view === 'scorers' && (
                  <div className="list-view">
                    {data.map(s => (
                      <div key={s.player.id} className="list-item">
                        <span><strong>{s.player.name}</strong> ({s.team.shortName})</span>
                        <span className="pts">{s.goals} Goals</span>
                      </div>
                    ))}
                  </div>
                )}
                {view === 'matches' && (
                  <div className="list-view">
                    {data.slice(0, 15).map(m => (
                      <div key={m.id} className="list-item">
                        <span>{m.homeTeam.shortName} vs {m.awayTeam.shortName}</span>
                        <span className="dim">{new Date(m.utcDate).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>
    </div>
  );
}

export default App;