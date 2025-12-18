import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import newsData from './news.json';
import './App.css';

function App() {
  const [activeFilter, setActiveFilter] = useState('All');
  const [view, setView] = useState('standings'); // New: 'standings', 'scorers', or 'matches'
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
 
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const response = await fetch(`https://itsgonein.com/football-proxy.php?type=${view}`);
        const result = await response.json();
        
        if (view === 'standings') setData(result.standings[0].table);
        if (view === 'scorers') setData(result.scorers);
        if (view === 'matches') setData(result.matches);
      } catch (error) {
        console.error("Fetch failed:", error);
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
            <button key={f} className={`filter-btn ${activeFilter === f ? 'active' : ''}`} onClick={() => setActiveFilter(f)}>{f}</button>
          ))}
        </div>
      </header>

      {/* News Section (Abbreviated for space) */}
      <section className="news-hero">
         <div className="news-grid">
          {newsData.filter(n => activeFilter === 'All' || n.tag === activeFilter).map(news => (
            <div key={news.id} className="news-card">
              <img src={news.image} alt="" />
              <div className="news-content"><h3>{news.title}</h3></div>
            </div>
          ))}
        </div>
      </section>

      {/* MATCH CENTER WITH TABS */}
      <section className="stats-dashboard">
        <div className="dashboard-header">
          <h2 className="section-title">MATCH CENTER</h2>
          <div className="tab-group">
            <button className={view === 'standings' ? 'active' : ''} onClick={() => setView('standings')}>Table</button>
            <button className={view === 'scorers' ? 'active' : ''} onClick={() => setView('scorers')}>Top Scorers</button>
            <button className={view === 'matches' ? 'active' : ''} onClick={() => setView('matches')}>Fixtures</button>
          </div>
        </div>

        <div className="data-content">
          {loading ? <p>Loading...</p> : (
            view === 'standings' ? (
              <table className="standings-table">
                <thead><tr><th>POS</th><th>TEAM</th><th>P</th><th>GD</th><th>PTS</th></tr></thead>
                <tbody>
                  {data.map(team => (
                    <tr key={team.team.id}>
                      <td>{team.position}</td>
                      <td className="team-cell"><img src={team.team.crest} width="20"/> {team.team.shortName}</td>
                      <td>{team.playedGames}</td><td>{team.goalDifference}</td><td className="points-cell">{team.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : view === 'scorers' ? (
              <div className="scorers-list">
                {data.map(s => (
                  <div key={s.player.id} className="scorer-row">
                    <span>{s.player.name} ({s.team.shortName})</span>
                    <span className="points-cell">{s.goals} Goals</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="matches-list">
                {data.slice(0, 10).map(m => (
                  <div key={m.id} className="match-row">
                    <span>{m.homeTeam.shortName} vs {m.awayTeam.shortName}</span>
                    <span>{new Date(m.utcDate).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </section>
    </div>
  );
}

export default App;