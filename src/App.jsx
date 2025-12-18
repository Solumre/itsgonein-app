import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import newsData from './news.json';
import './App.css';

function App() {
  const [activeFilter, setActiveFilter] = useState('All');
  const [view, setView] = useState('standings'); 
  const [data, setData] = useState([]);
  const [tickerData, setTickerData] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch Ticker Data (Matches) and Main Content
  useEffect(() => {
    const fetchInitialData = async () => {
      const tickerRes = await fetch('https://itsgonein.com/football-proxy.php?type=matches');
      const tickerJson = await tickerRes.json();
      setTickerData(tickerJson.matches?.slice(0, 8) || []);
    };
    fetchInitialData();
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
         const response = await fetch(`https://itsgonein.com/football-proxy.php?type=${view}`);
        const result = await response.json();
         if (view === 'standings') setData(result.standings?.[0]?.table || []);
        if (view === 'scorers') setData(result.scorers || []);
        if (view === 'matches') setData(result.matches || []);
       } catch (error) {
        setData([]);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [view]);

  return (
    <div className="app-container">
      {/* ⚡️ LIVE NEWS TICKER */}
      <div className="ticker-wrap">
        <div className="ticker-move">
          {tickerData.map((m, i) => (
            <div key={i} className="ticker-item">
              <span className="live-dot"></span>
              {m.homeTeam?.shortName} {m.score?.fullTime?.home ?? 0} - {m.score?.fullTime?.away ?? 0} {m.awayTeam?.shortName}
            </div>
          ))}
        </div>
      </div>

      <header className="main-header">
        <motion.h1 initial={{y:-20}} animate={{y:0}} className="brand">ITS<span>GONE</span>IN<span>.</span></motion.h1>
        <nav className="filter-nav">
          {['All', 'Arsenal', 'Liverpool', 'Man City'].map(f => (
            <button key={f} className={activeFilter === f ? 'active' : ''} onClick={() => setActiveFilter(f)}>{f}</button>
          ))}
        </nav>
      </header>

      <main className="dashboard-layout">
        <section className="column-news">
          <h2 className="glow-label">BREAKING ANALYSIS</h2>
          <div className="scroll-box">
            {newsData.filter(n => activeFilter === 'All' || n.tag === activeFilter).map(news => (
              <motion.article whileHover={{ scale: 1.02 }} layout key={news.id} className="glass-card news-card">
                <div className="media-box">
                  <img src={news.image} alt="" />
                  <div className="overlay-gradient"></div>
                  <span className="badge">{news.result}</span>
                </div>
                <div className="card-info">
                  <span className="meta">{news.date}</span>
                  <h3>{news.title}</h3>
                 </div>
              </motion.article>
            ))}
          </div>
        </section>

        <section className="column-stats">
          <div className="center-top">
            <h2 className="glow-label">MATCH CENTER</h2>
            <div className="tab-menu">
              {['standings', 'scorers', 'matches'].map((t) => (
                <button key={t} className={view === t ? 'on' : ''} onClick={() => setView(t)}>
                  {t.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="data-panel glass-card">
            <AnimatePresence mode="wait">
              {loading ? (
                <div className="loader">SYNCING...</div>
              ) : (
                <motion.div key={view} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="scroll-box">
                  {view === 'standings' && (
                    <table className="pro-table">
                      <thead><tr><th>#</th><th>TEAM</th><th>GD</th><th>PTS</th></tr></thead>
                      <tbody>
                        {data.map(t => (
                          <tr key={t.team?.id}>
                            <td>{t.position}</td>
                            <td className="t-row"><img src={t.team?.crest} width="22"/> {t.team?.shortName}</td>
                            <td>{t.goalDifference}</td><td className="accent-text">{t.points}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {/* ... Scorers & Matches logic remains same as previous fix ... */}
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