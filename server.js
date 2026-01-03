import express from 'express';
import cors from 'cors';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Fix for __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());

// --- CONFIG ---
const API_KEY = '810540f6bee3ad8d1858e113b549c8c2';
const BASE_URL = 'https://v3.football.api-sports.io';
const CACHE_DURATION = 300; // 5 minutes cache

// --- 1. API ROUTES (The Proxy) ---
app.get('/football-proxy', async (req, res) => {
    const { league = '39', type = 'fixtures', match_id } = req.query;
    
    // ✅ CRITICAL FIX: Set to 2024 for the current active season
    const season = 2024; 

    // Cache Logic
    const cacheKey = `cache_${type}_${match_id || ''}_${league}`;
    const cacheFile = path.join(__dirname, `${cacheKey}.json`);

    if (fs.existsSync(cacheFile)) {
        const stats = fs.statSync(cacheFile);
        const age = (Date.now() - stats.mtimeMs) / 1000;
        if (age < CACHE_DURATION) {
            console.log(`📂 Serving from Cache: ${cacheKey}`);
            const cachedData = fs.readFileSync(cacheFile, 'utf8');
            return res.json(JSON.parse(cachedData));
        }
    }

    // Construct URL
    let url = '';
    if (type === 'live') url = `${BASE_URL}/fixtures?live=all&league=${league}`;
    else if (type === 'fixtures') url = `${BASE_URL}/fixtures?league=${league}&season=${season}&next=15`;
    else if (type === 'match_details' && match_id) url = `${BASE_URL}/fixtures?id=${match_id}`;
    else if (type === 'standings') url = `${BASE_URL}/standings?season=${season}&league=${league}`;
    else if (type === 'scorers') url = `${BASE_URL}/players/topscorers?season=${season}&league=${league}`;
     else if (type === 'h2h' && match_id) {
        try {
            const matchResp = await axios.get(`${BASE_URL}/fixtures?id=${match_id}`, { headers: { 'x-apisports-key': API_KEY } });
            if (matchResp.data.response.length > 0) {
                const hID = matchResp.data.response[0].teams.home.id;
                const aID = matchResp.data.response[0].teams.away.id;
                url = `${BASE_URL}/fixtures/headtohead?h2h=${hID}-${aID}&last=10`;
            }
        } catch (e) { console.error("H2H lookup failed:", e.message); }
    }

    if (!url) return res.json({ response: [] });

    console.log(`📡 Fetching from API: ${url}`);

    try {
        const response = await axios.get(url, { headers: { 'x-apisports-key': API_KEY } });
        const items = response.data.response || [];
        
        console.log(`✅ API Success. Found ${items.length} items.`);

        // --- TRANSFORM DATA ---
        let output = { response: [] };
        
        if (type === 'scorers') {
            output.response = items.map(p => ({
                player: { name: p.player.name, photo: p.player.photo },
                statistics: [{ team: { name: p.statistics[0].team.name }, goals: { total: p.statistics[0].goals.total } }]
            }));
        } else if (type === 'standings') {
            const table = items[0]?.league?.standings?.[0] || [];
            output.response = [{ league: { standings: [table.map(t => ({ rank: t.rank, team: t.team, points: t.points, all: t.all, form: t.form }))] } }];
        } else if (type === 'fixtures' || type === 'live') {
            output.response = items.map(m => ({
                id: m.fixture.id, 
                date: m.fixture.date, 
                status: m.fixture.status.short, 
                home: m.teams.home.name, 
                homeCrest: m.teams.home.logo, 
                away: m.teams.away.name, 
                awayCrest: m.teams.away.logo,
                goals: m.goals
            }));
        } else if (type === 'h2h') {
            output.response = {
                match: { score: 'VS' },
                history: items.map(m => ({
                    date: new Date(m.fixture.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
                    stadium: m.fixture.venue.name, 
                    score: `${m.teams.home.name} ${m.goals.home ?? 0}-${m.goals.away ?? 0} ${m.teams.away.name}`
                }))
            };
        } else if (type === 'match_details') {
            const m = items[0];
            if (m) {
                output.response = {
                    match: {
                        home: m.teams.home.name, homeLogo: m.teams.home.logo,
                        away: m.teams.away.name, awayLogo: m.teams.away.logo,
                        score: `${m.goals.home ?? 0} - ${m.goals.away ?? 0}`
                    },
                    timeline: (m.events || []).map(e => ({ time: e.time.elapsed + "'", type: e.type, detail: `${e.detail} (${e.player.name})`, icon: e.type === 'Goal' ? '⚽️' : (e.type === 'Card' ? '🟨' : '⏱') }))
                };
            }
        }

        // Save to cache
        fs.writeFileSync(cacheFile, JSON.stringify(output));
        res.json(output);

    } catch (error) {
        console.error("❌ API Error:", error.message);
        res.status(500).json({ error: 'Failed' });
    }
});

// --- 2. SERVE REACT FRONTEND ---
// This tells Express to look inside the 'dist' folder for static files
app.use(express.static(path.join(__dirname, 'dist')));

// --- 3. CATCH-ALL ROUTE (The Nuclear Regex Fix) ---
// This regex /(.*)/ blindly accepts any URL and sends index.html
// This bypasses the Render/Express version conflict completely.
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});


const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));