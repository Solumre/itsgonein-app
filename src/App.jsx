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
        
        // Accurate data mapping for each API endpoint
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

      <main className="content-grid">
        <section className="news-section">
          <h2 className="label">LATEST ANALYSIS</h2>
          <div className="cards-wrapper">
            {newsData.filter(n => activeFilter === 'All' || n.tag === activeFilter).map(news => (
              <motion.article layout key={news.id} className="glass-card">
                <div className="img-box">
                  <img src={news.image} alt={news.title} />
                  <span className="badge">{news.result}</span>
                </div>
                <div className="card-body">
                  <span className="date">{news.date}</span>
                  <h3>{news.title}</h3>
                  <p>{news.excerpt}</p>
                </div>
              </motion.article>
            ))}
          </div>
        </section>

        <section className="center-section">
          <div className="center-header">
            <h2 className="label">MATCH CENTER</h2>
            <div className="tabs">
              <button className={view === 'standings' ? 'on' : ''} onClick={() => setView('standings')}>Table</button>
              <button className={view === 'scorers' ? 'on' : ''} onClick={() => setView('scorers')}>Scorers</button>
              <button className={view === 'matches' ? 'on' : ''} onClick={() => setView('matches')}>Fixtures</button>
            </div>
          </div>

          <div className="data-panel glass-card">
            <AnimatePresence mode="wait">
              {loading ? (
                <motion.div initial={{opacity:0}} animate={{opacity:1}} className="loader">SYNCING DATA...</motion.div>
              ) : (
                <motion.div key={view} initial={{opacity:0}} animate={{opacity:1}} className="scroll-box">
                  {view === 'standings' && (
                    <table className="data-table">
                      <thead><tr><th>#</th><th>TEAM</th><th>P</th><th>GD</th><th>PTS</th></tr></thead>
                      <tbody>
                        {data.map(t => (
                          <tr key={t.team.id}>
                            <td>{t.position}</td>
                            <td className="t-info"><img src={t.team.crest} width="18"/> {t.team.shortName}</td>
                            <td>{t.playedGames}</td><td>{t.goalDifference}</td><td className="bold-green">{t.points}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {view === 'scorers' && data.map(s => (
                    <div key={s.player.id} className="row-item">
                      <span><strong>{s.player.name}</strong> ({s.team.shortName})</span>
                      <span className="bold-green">{s.goals} Goals</span>
                    </div>
                  ))}
                  {view === 'matches' && data.slice(0, 12).map(m => (
                    <div key={m.id} className="row-item">
                      <span>{m.homeTeam.shortName} vs {m.awayTeam.shortName}</span>
                      <span className="muted">{new Date(m.utcDate).toLocaleDateString()}</span>
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