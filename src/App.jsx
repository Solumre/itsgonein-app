import { useState, useEffect } from 'react'
import newsData from './data/news.json'
import './App.css'

function App() {
  const [standings, setStandings] = useState([])
  const [scorers, setScorers] = useState([])
  const [matches, setMatches] = useState([]) // New State for Fixtures
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const headers = { 'X-Auth-Token': import.meta.env.VITE_FOOTBALL_KEY }
    const proxy = 'https://cors-anywhere.herokuapp.com/'
    
    Promise.all([
      fetch(proxy + 'https://api.football-data.org/v4/competitions/PL/standings', { headers }),
      fetch(proxy + 'https://api.football-data.org/v4/competitions/PL/scorers', { headers }),
      fetch(proxy + 'https://api.football-data.org/v4/competitions/PL/matches?status=SCHEDULED', { headers }) // New Fetch
    ])
      .then(([res1, res2, res3]) => Promise.all([res1.json(), res2.json(), res3.json()]))
      .then(([data1, data2, data3]) => {
        setStandings(data1.standings[0].table)
        setScorers(data2.scorers)
        setMatches(data3.matches.slice(0, 5)) // Get next 5 games
        setLoading(false)
      })
      .catch((error) => {
        console.error("Error:", error)
        setLoading(false)
      })
  }, [])

  function formatDate(dateString) {
    const options = { weekday: 'short', hour: '2-digit', minute: '2-digit' }
    return new Date(dateString).toLocaleDateString('en-GB', options)
  }

  return (
    <div className="app-container">
      {/* HEADER */}
      <header className="header">
        <div className="logo-container">
          <h1 className="logo">ITS<span className="logo-highlight">GONE</span>IN</h1>
          <div className="logo-dot"></div>
        </div>
        <nav>
          <a href="#" className="active">Home</a>
          <a href="#">Analysis</a>
          <a href="#">Community</a>
        </nav>
      </header>

      {/* HERO SECTION */}
      <section className="news-hero">
        <h2 className="section-title">Latest Analysis</h2>
        <div className="news-grid">
          {newsData.map((news) => (
            <div key={news.id} className="news-card">
              <div className="image-wrapper">
                <img src={news.image} alt={news.title} />
                <div className="prediction-tag">🔮 {news.prediction}</div>
              </div>
              <div className="news-content">
                <span className="news-date">{news.date}</span>
                <h3>{news.title}</h3>
                <p>{news.summary}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 3-COLUMN DASHBOARD */}
      <section className="stats-dashboard">
        <h2 className="section-title">Match Center</h2>
        
        {loading ? (
          <div className="loading-container">
            <div className="spinner"></div>
            <p>Fetching live stats...</p>
          </div>
        ) : (
          <div className="stats-grid">
            
            {/* COLUMN 1: STANDINGS */}
            <div className="glass-card table-card">
              <div className="card-header">
                <h3>🏆 Standings</h3>
              </div>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Club</th>
                      <th>Pts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standings.map((team) => (
                      <tr key={team.team.id}>
                        <td className="position">{team.position}</td>
                        <td className="team-cell">
                          <img src={team.team.crest} className="crest" />
                          <span className="team-name">{team.team.shortName || team.team.name}</span>
                        </td>
                        <td className="points">{team.points}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* COLUMN 2: GOLDEN BOOT */}
            <div className="glass-card scorers-card">
              <div className="card-header">
                <h3>👟 Top Scorers</h3>
              </div>
              <div className="scorers-list">
                {scorers.slice(0, 10).map((player, index) => (
                  <div key={player.player.id} className="scorer-row">
                    <div className="rank-circle">{index + 1}</div>
                    <div className="player-info">
                      <span className="p-name">{player.player.name}</span>
                      <span className="p-club">{player.team.shortName}</span>
                    </div>
                    <div className="goals-tag">{player.goals}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* COLUMN 3: NEXT MATCHES (New!) */}
            <div className="glass-card matches-card">
              <div className="card-header">
                <h3>📅 Next Matches</h3>
              </div>
              <div className="matches-list">
                {matches.map((match) => (
                  <div key={match.id} className="match-row">
                    <div className="match-date">{formatDate(match.utcDate)}</div>
                    <div className="match-teams">
                      <div className="team-home">
                        <img src={match.homeTeam.crest} className="mini-crest"/>
                        <span>{match.homeTeam.shortName}</span>
                      </div>
                      <span className="vs">VS</span>
                      <div className="team-away">
                        <span>{match.awayTeam.shortName}</span>
                        <img src={match.awayTeam.crest} className="mini-crest"/>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}
      </section>
    </div>
  )
}

export default App