import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import newsData from './news.json';
import './App.css';

function App() {
  const [activeFilter, setActiveFilter] = useState('All');
  const [rankings, setRankings] = useState([]);
  const [loading, setLoading] = useState(true);

  // Use the ABSOLUTE URL to your proxy to avoid any folder confusion
  const proxyBase = 'https://itsgonein.com/football-proxy.php?type=standings';

  useEffect(() => {
    const fetchRankings = async () => {
      try {
        setLoading(true);
        const response = await fetch(proxyBase);
        const data = await response.json();

        // football-data.org nests the table inside standings[0].table
        if (data && data.standings && data.standings[0]) {
          setRankings(data.standings[0].table);
        } else {
          console.error("Data structure unexpected:", data);
        }
      } catch (error) {
        console.error("Failed to fetch rankings:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchRankings();
  }, []);

  const filteredNews = activeFilter === 'All' 
    ? newsData 
    : newsData.filter(item => item.tag === activeFilter);

  return (
    <div className="app-container">
      <header className="header">
        <h1 className="logo">ITS<span>GONE</span>IN<span>.</span></h1>
        <div className="filter-bar">
          {['All', 'Arsenal', 'Liverpool', 'Man City'].map(filter => (
            <button 
              key={filter}
              className={`filter-btn ${activeFilter === filter ? 'active' : ''}`}
              onClick={() => setActiveFilter(filter)}
            >
              {filter}
            </button>
          ))}
        </div>
       </header>

      <section className="news-hero">
        <h2 className="section-title">ALL ANALYSIS</h2>
        <div className="news-grid">
          {filteredNews.map((news) => (
            <motion.div 
              layout
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              key={news.id} 
              className="news-card"
            >
              <div className="image-container">
                <img src={news.image} alt={news.title} />
                <span className="news-tag">{news.result}</span>
              </div>
              <div className="news-content">
                <p className="news-date">{news.date}</p>
                <h3>{news.title}</h3>
                <p className="news-excerpt">{news.excerpt}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      <section className="stats-dashboard">
        <h2 className="section-title">MATCH CENTER</h2>
        <div className="standings-card">
          {loading ? (
            <p className="status-msg">Loading live standings...</p>
          ) : rankings.length > 0 ? (
            <table className="standings-table">
              <thead>
                <tr>
                  <th>POS</th>
                  <th>TEAM</th>
                  <th>P</th>
                  <th>W</th>
                  <th>D</th>
                  <th>L</th>
                  <th>GD</th>
                  <th>PTS</th>
                </tr>
              </thead>
              <tbody>
                {rankings.map((team) => (
                  <tr key={team.team.id}>
                    <td>{team.position}</td>
                    <td className="team-cell">
                      <img src={team.team.crest} alt={team.team.shortName} width="20" />
                      {team.team.shortName}
                    </td>
                    <td>{team.playedGames}</td>
                    <td>{team.won}</td>
                    <td>{team.draw}</td>
                    <td>{team.lost}</td>
                    <td>{team.goalDifference}</td>
                    <td className="points-cell">{team.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="status-msg">Data currently unavailable.</p>
          )}
        </div>
      </section>
    </div>
  );
}

export default App;