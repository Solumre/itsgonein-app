import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion' // Added for animations
import newsData from './data/news.json'
import './App.css'

function App() {
  const [standings, setStandings] = useState([])
  const [scorers, setScorers] = useState([])
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('All') // Filter state

  useEffect(() => {
    const proxyBase = 'https://itsgonein.com/football-proxy.php?type=';
    Promise.all([
      fetch(proxyBase + 'standings'),
      fetch(proxyBase + 'scorers'),
      fetch(proxyBase + 'matches')
    ])
      .then(([res1, res2, res3]) => Promise.all([res1.json(), res2.json(), res3.json()]))
      .then(([data1, data2, data3]) => {
        if (data1.standings) setStandings(data1.standings[0].table);
        if (data2.scorers) setScorers(data2.scorers);
        if (data3.matches) setMatches(data3.matches.slice(0, 5));
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Filtering logic
  const filteredNews = filter === 'All' 
    ? newsData 
    : newsData.filter(item => item.category === filter);

  return (
    <motion.div 
      initial={{ opacity: 0 }} 
      animate={{ opacity: 1 }} 
      className="app-container"
    >
      <header className="header">
        <div className="logo-container">
          <h1 className="logo">ITS<span className="logo-highlight">GONE</span>IN</h1>
          <div className="logo-dot"></div>
        </div>
        <nav>
          <button onClick={() => setFilter('All')} className={filter === 'All' ? 'active-btn' : 'nav-btn'}>All</button>
          <button onClick={() => setFilter('Arsenal')} className={filter === 'Arsenal' ? 'active-btn' : 'nav-btn'}>Arsenal</button>
          <button onClick={() => setFilter('Liverpool')} className={filter === 'Liverpool' ? 'active-btn' : 'nav-btn'}>Liverpool</button>
        </nav>
      </header>

     <section className="news-hero">
        <h2 className="section-title">{filter} Analysis</h2>
        <div className="news-grid">
          <AnimatePresence mode='wait'>
            {filteredNews.map((news, index) => (
              <motion.div 
                key={news.id}
                layout
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                transition={{ delay: index * 0.1 }}
                className="news-card"
              >
                <div className="image-wrapper">
                  <img src={news.image} alt="" />
                  <div className="prediction-tag">🔮 {news.prediction}</div>
                </div>
                <div className="news-content">
                  <span className="news-date">{news.date}</span>
                  <h3>{news.title}</h3>
                  <p>{news.summary}</p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </section>

      {/* Stats sections remain same but wrapped in motion.section for entry fade */}
      <motion.section 
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        className="stats-dashboard"
      >
        <h2 className="section-title">Match Center</h2>
        {/* ... Rest of your stats code ... */}
      </motion.section>
    </motion.div>
  )
}

export default App