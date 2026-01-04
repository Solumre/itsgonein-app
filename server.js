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

    // --- HELPER FUNCTION TO FETCH DATA ---
    const fetchData = async (targetUrl) => {
        try {
            console.log(`📡 FETCHING: ${targetUrl}`);
            const response = await axios.get(targetUrl, { 
                headers: { 'x-apisports-key': API_KEY } 
            });
            return response.data.response || [];
        } catch (e) {
            console.error(`❌ API Error: ${e.message}`);
            return [];
        }
    };

    try {
        // 1. HANDLE FIXTURES (With Smart Fallback)
        if (type === 'fixtures') {
            // Try fetching upcoming matches first
            let url = `${BASE_URL}/fixtures?league=${league}&season=${season}&next=15`;
            let items = await fetchData(url);

            // If no upcoming matches found (e.g. League is in off-season like Brasileirão), fetch PAST results
            if (items.length === 0) {
                console.log(`⚠️ No upcoming fixtures for League ${league}. Fetching past results...`);
                url = `${BASE_URL}/fixtures?league=${league}&season=${season}&last=15`;
                items = await fetchData(url);
            }
            
            return res.json({ response: items });
        }

        // 2. HANDLE H2H (With Stats Calculation)
        if (type === 'h2h' && match_id) {
            // Step A: Find Team IDs from the Match ID
            console.log(`🔍 H2H Lookup for Match ID: ${match_id}`);
            const matchItems = await fetchData(`${BASE_URL}/fixtures?id=${match_id}`);
            
            if (matchItems.length === 0) {
                return res.json({ response: { match: {}, history: [], stats: {} } });
            }

            const hID = matchItems[0].teams.home.id;
            const aID = matchItems[0].teams.away.id;
            console.log(`✅ Found Teams: Home(${hID}) vs Away(${aID})`);

            // Step B: Fetch Head-to-Head History
            const h2hItems = await fetchData(`${BASE_URL}/fixtures/headtohead?h2h=${hID}-${aID}&last=50`);

            // Step C: Calculate Stats (The logic you wanted preserved)
            let homeWins = 0;
            let awayWins = 0;
            let draws = 0;
            let total = 0;

            const history = h2hItems.map(m => {
                const hGoals = m.goals.home ?? 0;
                const aGoals = m.goals.away ?? 0;
                
                // Calculate Win/Loss/Draw
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

            // Calculate Percentages
            const safeTotal = total === 0 ? 1 : total;
            const stats = {
                homeWinPerc: Math.round((homeWins / safeTotal) * 100),
                drawPerc: Math.round((draws / safeTotal) * 100),
                awayWinPerc: Math.round((awayWins / safeTotal) * 100)
            };

            // Visual default if no history exists
            if (total === 0) {
                stats.homeWinPerc = 33; stats.drawPerc = 34; stats.awayWinPerc = 33;
            }

            return res.json({ 
                response: { 
                    match: { score: 'VS' }, 
                    history: history,
                    stats: stats 
                } 
            });
        }

        // 3. HANDLE LIVE
        if (type === 'live') {
            const url = `${BASE_URL}/fixtures?live=all&league=${league}`;
            const items = await fetchData(url);
            return res.json({ response: items });
        }

        // 4. HANDLE STANDINGS
        if (type === 'standings') {
            const url = `${BASE_URL}/standings?season=${season}&league=${league}`;
            const items = await fetchData(url);
            return res.json({ response: items });
        }

        // 5. HANDLE SCORERS
        if (type === 'scorers') {
            const url = `${BASE_URL}/players/topscorers?season=${season}&league=${league}`;
            const items = await fetchData(url);
            return res.json({ response: items });
        }

        // 6. HANDLE MATCH DETAILS
        if (type === 'match_details' && match_id) {
            const url = `${BASE_URL}/fixtures?id=${match_id}`;
            const items = await fetchData(url);
            return res.json({ response: items });
        }

        // Default Fallback
        return res.json({ response: [] });

    } catch (error) {
        console.error("Server Error:", error);
        res.status(500).json({ error: 'Failed to fetch data' });
    }
});
 
app.use(express.static(path.join(__dirname, 'dist')));
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));