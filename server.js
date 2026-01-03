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
    if (type === 'live') url = `${BASE_URL}/fixtures?live=all&league=${league}`;
    else if (type === 'fixtures') url = `${BASE_URL}/fixtures?league=${league}&season=${season}&next=15`;
    else if (type === 'match_details' && match_id) url = `${BASE_URL}/fixtures?id=${match_id}`;
    else if (type === 'standings') url = `${BASE_URL}/standings?season=${season}&league=${league}`;
    else if (type === 'scorers') url = `${BASE_URL}/players/topscorers?season=${season}&league=${league}`;
    else if (type === 'h2h' && match_id) {
        // H2H Logic remains same, but we will simplify the return
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

    console.log(`📡 FETCHING RAW: ${url}`);

    try {
        const response = await axios.get(url, { headers: { 'x-apisports-key': API_KEY } });
        
        // 🚨 THE FIX: Send the RAW response. Do not map, do not transform.
        // This ensures the frontend gets exactly the structure it expects (fixture.id, etc.)
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