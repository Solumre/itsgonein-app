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
        // Using absolute URL to ensure it works on every sub-page
        const response = await fetch(`https://itsgonein.com/football-proxy.php?type=${view}`);
        const result = await response.json();
        
        // Specific mapping for football-data.org structure
        if (view === 'standings') setData(result.standings?.[0]?.table || []);
        if (view === 'scorers') setData(result.scorers || []);
        if (view === 'matches') setData(result.matches || []);
      } catch (error) {
        console.error("Data Load Error:", error);
        setData([]);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [view]);

  return (
    <div className="app-container">
      <header className="main-header">
        <h1 className="brand">ITS<span>GONE</span>IN<span>.</span></h1>
        <nav className="filter-nav">
          {['All', 'Arsenal', 'Liverpool', 'Man City'].map(f => (
            <button key={f} className={activeFilter === f ? 'active' : ''} onClick={() => setActiveFilter(f)}>{f}</button>
          ))}
        </nav>
      </header>

      <main className="dashboard-layout">
        <section className="column-news">
          <h2 className="label-heading">LATEST ANALYSIS</h2>
          <div className="scroll-box">
            {newsData.filter(n => activeFilter === 'All' || n.tag === activeFilter).map(news => (
              <motion.article layout key={news.id} className="pro-card">
                <div className="card-media">
                  <img src={news.image} alt="" />
                  <span className="badge-overlay">{news.result}</span>
                </div>
                <div className="card-body">
                  <span className="card-date">{news.date}</span>
                  <h3>{news.title}</h3>
                  <p>{news.excerpt}</p>
                </div>
              </motion.article>
            ))}
          </div>
        </section>

        <section className="column-stats">
          <div className="stats-header">
            <h2 className="label-heading">MATCH CENTER</h2>
            <div className="tab-menu">
              <button className={view === 'standings' ? 'on' : ''} onClick={() => setView('standings')}>Table</button>
              <button className={view === 'scorers' ? 'on' : ''} onClick={() => setView('scorers')}>Scorers</button>
              <button className={view === 'matches' ? 'on' : ''} onClick={() => setView('matches')}>Fixtures</button>
            </div>
          </div>

          <div className="stats-panel pro-card">
            <AnimatePresence mode="wait">
              {loading ? (
                <div className="loader">SYNCING DATA...</div>
              ) : (
                <motion.div key={view} initial={{opacity:0}} animate={{opacity:1}} className="scroll-box">
                  {view === 'standings' && (
                    <table className="stats-table">
                      <thead><tr><th>#</th><th>TEAM</th><th>P</th><th>GD</th><th>PTS</th></tr></thead>
                      <tbody>
                        {data.map(t => (
                          <tr key={t.team?.id}>
                            <td>{t.position}</td>
                            <td className="t-cell"><img src={t.team?.crest} width="18"/> {t.team?.shortName}</td>
                            <td>{t.playedGames}</td><td>{t.goalDifference}</td><td className="bold-pts">{t.points}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {view === 'scorers' && data.map(s => (
                    <div key={s.player?.id} className="list-item">
                      <span><strong>{s.player?.name}</strong> ({s.team?.shortName})</span>
                      <span className="bold-pts">{s.goals} Goals</span>
                    </div>
                  ))}
                  {view === 'matches' && data.slice(0, 15).map(m => (
                    <div key={m.id} className="list-item">
                      <span>{m.homeTeam?.shortName} vs {m.awayTeam?.shortName}</span>
                      <span className="dim-text">{new Date(m.utcDate).toLocaleDateString()}</span>
                    </div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;