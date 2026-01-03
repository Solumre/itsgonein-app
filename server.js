import express from 'express';
import cors from 'cors';
import axios from 'axios';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());

// --- CONFIG ---
const API_KEY = '810540f6bee3ad8d1858e113b549c8c2';
const BASE_URL = 'https://v3.football.api-sports.io';

app.get('/football-proxy', async (req, res) => {
    const { league = '39', type = 'fixtures', match_id } = req.query;
    const season = 2025; 

    let url = '';
    
    // 1. Construct URL
    if (type === 'live') url = `${BASE_URL}/fixtures?live=all&league=${league}`;
    else if (type === 'fixtures') url = `${BASE_URL}/fixtures?league=${league}&season=${season}&next=15`;
    else if (type === 'match_details' && match_id) url = `${BASE_URL}/fixtures?id=${match_id}`;
    else if (type === 'standings') url = `${BASE_URL}/standings?season=${season}&league=${league}`;
    else if (type === 'scorers') url = `${BASE_URL}/players/topscorers?season=${season}&league=${league}`;
    else if (type === 'h2h' && match_id) {
        // H2H Step 1: Find Team IDs
        try {
            console.log(`🔍 H2H Lookup for Match ID: ${match_id}`);
            const matchResp = await axios.get(`${BASE_URL}/fixtures?id=${match_id}`, { headers: { 'x-apisports-key': API_KEY } });
            
            if (matchResp.data.response.length > 0) {
                const hID = matchResp.data.response[0].teams.home.id;
                const aID = matchResp.data.response[0].teams.away.id;
                console.log(`✅ Found Teams: Home(${hID}) vs Away(${aID})`);
                
                // Fetch last 20 matches to ensure we have data
                url = `${BASE_URL}/fixtures/headtohead?h2h=${hID}-${aID}&last=20`;
            } else {
                console.log("❌ Match ID not found in API");
            }
        } catch (e) { console.error("H2H Error:", e.message); }
    }

    if (!url) return res.json({ response: [] });

    console.log(`📡 FETCHING: ${url}`);

    try {
        const response = await axios.get(url, { headers: { 'x-apisports-key': API_KEY } });
        const items = response.data.response || [];

        // --- HYBRID LOGIC ---
        
        // CASE A: Head-to-Head (Server does the math now!)
        if (type === 'h2h') {
            let homeWins = 0;
            let awayWins = 0;
            let draws = 0;
            let total = 0;

            const history = items.map(m => {
                const hGoals = m.goals.home ?? 0;
                const aGoals = m.goals.away ?? 0;
                
                // Calculate Stats
                if (hGoals > aGoals) homeWins++;
                else if (aGoals > hGoals) awayWins++;
                else draws++;
                total++;

                return {
                    date: new Date(m.fixture.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
                    stadium: m.fixture.venue.name, 
                    score: `${m.teams.home.name} ${hGoals}-${aGoals} ${m.teams.away.name}`
                };
            });

            // Calculate Percentages (Avoid divide by zero)
            const safeTotal = total === 0 ? 1 : total;
            const stats = {
                homeWinPerc: Math.round((homeWins / safeTotal) * 100),
                drawPerc: Math.round((draws / safeTotal) * 100),
                awayWinPerc: Math.round((awayWins / safeTotal) * 100)
            };

            // If no history, default to 33/33/33 only for visual balance
            if (total === 0) {
                stats.homeWinPerc = 33; stats.drawPerc = 34; stats.awayWinPerc = 33;
            }

            return res.json({ 
                response: { 
                    match: { score: 'VS' }, 
                    history: history,
                    stats: stats // <--- Sending pre-calculated stats!
                } 
            });
        }

        // CASE B: Pass everything else through raw
        res.json(response.data); 

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed' });
    }
});
 
app.use(express.static(path.join(__dirname, 'dist')));
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));