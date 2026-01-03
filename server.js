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
    const season = 2025; // Correct season for Jan 2026

    let url = '';
    
    // 1. Construct the URL based on request type
    if (type === 'live') url = `${BASE_URL}/fixtures?live=all&league=${league}`;
    else if (type === 'fixtures') url = `${BASE_URL}/fixtures?league=${league}&season=${season}&next=15`;
    else if (type === 'match_details' && match_id) url = `${BASE_URL}/fixtures?id=${match_id}`;
    else if (type === 'standings') url = `${BASE_URL}/standings?season=${season}&league=${league}`;
    else if (type === 'scorers') url = `${BASE_URL}/players/topscorers?season=${season}&league=${league}`;
    else if (type === 'h2h' && match_id) {
        // H2H Step 1: Get the match to find the two team IDs
        try {
            const matchResp = await axios.get(`${BASE_URL}/fixtures?id=${match_id}`, { headers: { 'x-apisports-key': API_KEY } });
            if (matchResp.data.response.length > 0) {
                const hID = matchResp.data.response[0].teams.home.id;
                const aID = matchResp.data.response[0].teams.away.id;
                url = `${BASE_URL}/fixtures/headtohead?h2h=${hID}-${aID}&last=10`;
            }
        } catch (e) { console.error(e); }
    }

    if (!url) return res.json({ response: [] });

    console.log(`📡 FETCHING: ${url}`);

    try {
        const response = await axios.get(url, { headers: { 'x-apisports-key': API_KEY } });
        const items = response.data.response || [];

        // --- 2. THE HYBRID LOGIC ---
        
        // CASE A: Head-to-Head (H2H)
        // We MUST format this because your frontend expects a specifically formatted 'score' string
        // and a 'history' array. Raw data won't work here.
        if (type === 'h2h') {
             const history = items.map(m => ({
                date: new Date(m.fixture.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
                stadium: m.fixture.venue.name, 
                // Your frontend relies on this exact string format "TeamA 1-0 TeamB" to split the score
                score: `${m.teams.home.name} ${m.goals.home ?? 0}-${m.goals.away ?? 0} ${m.teams.away.name}`
            }));
            
            // Send it back wrapped in the object structure your App expects
            return res.json({ 
                response: { 
                    match: { score: 'VS' }, // Default placeholder
                    history: history 
                } 
            });
        }

        // CASE B: Everything else (Fixtures, Standings, Scorers)
        // For these, the frontend is happy with raw data (or close enough to it).
        // Pass it through raw to avoid bugs.
        res.json(response.data); 

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed' });
    }
});

// Serve Frontend
app.use(express.static(path.join(__dirname, 'dist')));
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));