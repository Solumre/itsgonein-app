<?php
// FOOTBALL-PROXY.PHP (FULL API-SPORTS DIRECT VERSION)
// 100% COMPLETE: Includes H2H, Standings, Timeline, Scorers, Live
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, x-apisports-key");
header("Content-Type: application/json");

// 1. YOUR NEW DIRECT KEY
// Copy this from the Dashboard where you just paid $19
$apiKey = '810540f6bee3ad8d1858e113b549c8c2'; 

// 2. CONFIGURATION
$leagueId = $_GET['league'] ?? '39'; // Premier League defaults to 39
$type = $_GET['type'] ?? 'fixtures';
$matchId = $_GET['match_id'] ?? null; 
$cacheTime = 300; // 5 Minutes Cache

// 3. CACHE SETUP
$cacheFile = "cache_" . md5($type . $matchId . $leagueId) . ".json";
if (file_exists($cacheFile) && (time() - filemtime($cacheFile) < $cacheTime)) {
    echo file_get_contents($cacheFile);
    exit;
}

// 4. API ROUTING (Direct Endpoints)
$baseUrl = "https://v3.football.api-sports.io";
$url = "";

if ($type === 'live') {
    $url = "$baseUrl/fixtures?live=all&league=$leagueId";
}
elseif ($type === 'fixtures') {
    // Get next 15 scheduled matches
    $url = "$baseUrl/fixtures?league=$leagueId&season=2023&next=15";
}
elseif ($type === 'match_details' && $matchId) {
    // Get stats, lineups, events for a specific match
    $url = "$baseUrl/fixtures?id=$matchId";
} 
elseif ($type === 'h2h' && $matchId) {
    // SPECIAL FETCH: We need Team IDs to get H2H
    // 1. Get Match Info first
    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => "$baseUrl/fixtures?id=$matchId",
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_HTTPHEADER => ["x-apisports-key: $apiKey"]
    ]);
    $matchRes = json_decode(curl_exec($ch), true);
    curl_close($ch);
    
    // 2. Use Team IDs to fetch H2H history
    if (!empty($matchRes['response'])) {
        $hID = $matchRes['response'][0]['teams']['home']['id'];
        $aID = $matchRes['response'][0]['teams']['away']['id'];
        $url = "$baseUrl/fixtures/headtohead?h2h=$hID-$aID&last=10";
    }
}
elseif ($type === 'standings') {
    $url = "$baseUrl/standings?season=2023&league=$leagueId";
}
elseif ($type === 'scorers') {
    $url = "$baseUrl/players/topscorers?season=2023&league=$leagueId";
}

// 5. EXECUTE REQUEST
// Note: Direct API uses 'x-apisports-key' header
$curl = curl_init();
curl_setopt_array($curl, [
    CURLOPT_URL => $url,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_HTTPHEADER => [ "x-apisports-key: $apiKey" ],
]);
$response = curl_exec($curl);
curl_close($curl);

// 6. ADAPTERS (Standardize Data for Frontend)
$data = json_decode($response, true);
$output = ['response' => []];
$items = $data['response'] ?? [];

// --- FIXTURES & LIVE ---
if ($type === 'fixtures' || $type === 'live') {
    foreach ($items as $m) {
        $output['response'][] = [
            'fixture' => [ 
                'id' => $m['fixture']['id'], 
                'date' => $m['fixture']['date'], 
                'status' => ['short' => $m['fixture']['status']['short']] 
            ],
            'teams' => [
                'home' => ['id' => $m['teams']['home']['id'], 'name' => $m['teams']['home']['name'], 'logo' => $m['teams']['home']['logo']],
                'away' => ['id' => $m['teams']['away']['id'], 'name' => $m['teams']['away']['name'], 'logo' => $m['teams']['away']['logo']]
            ],
            'goals' => [ 'home' => $m['goals']['home'], 'away' => $m['goals']['away'] ]
        ];
    }
}

// --- H2H HISTORY ---
elseif ($type === 'h2h') {
    $history = [];
    foreach ($items as $m) {
        $history[] = [
            'date' => date('d M Y', strtotime($m['fixture']['date'])),
            'score' => $m['teams']['home']['name'] . " " . 
                       ($m['goals']['home'] ?? 0) . "-" . 
                       ($m['goals']['away'] ?? 0) . " " . 
                       $m['teams']['away']['name']
        ];
    }
    $output['response'] = [
        'match' => ['score' => 'VS'], 
        'history' => $history
    ];
}

// --- MATCH DETAILS (Timeline & Stats) ---
elseif ($type === 'match_details') {
    $m = $items[0] ?? null;
    $events = [];
    
    // Process Timeline Events (Goals, Cards)
    if (isset($m['events'])) {
        foreach ($m['events'] as $e) {
            $icon = '⏱';
            if ($e['type'] === 'Goal') $icon = '⚽️';
            if ($e['type'] === 'Card') $icon = '🟨';
            if ($e['detail'] === 'Red Card') $icon = '🟥';
            
            $events[] = [
                'time' => $e['time']['elapsed'] . "'",
                'type' => $e['type'],
                'detail' => $e['detail'] . " (" . $e['player']['name'] . ")",
                'icon' => $icon
            ];
        }
    }
    
    $output['response'] = [
        'match' => [
            'home' => $m['teams']['home']['name'],
            'homeLogo' => $m['teams']['home']['logo'],
            'away' => $m['teams']['away']['name'],
            'awayLogo' => $m['teams']['away']['logo'],
            'score' => ($m['goals']['home'] ?? 0) . " - " . ($m['goals']['away'] ?? 0)
        ],
        'timeline' => $events
    ];
}

// --- STANDINGS ---
elseif ($type === 'standings') {
    $table = $items[0]['league']['standings'][0] ?? [];
    $cleanTable = [];
    foreach ($table as $t) {
        $cleanTable[] = [
            'rank' => $t['rank'],
            'team' => ['name' => $t['team']['name'], 'logo' => $t['team']['logo']],
            'points' => $t['points'],
            'all' => ['played' => $t['all']['played'], 'win' => $t['all']['win'], 'draw' => $t['all']['draw'], 'lose' => $t['all']['lose']],
            'form' => $t['form']
        ];
    }
    $output['response'][] = ['league' => ['standings' => [$cleanTable]]];
}

// --- TOP SCORERS ---
elseif ($type === 'scorers') {
    foreach ($items as $p) {
        $output['response'][] = [
            'player' => ['name' => $p['player']['name'], 'photo' => $p['player']['photo']],
            'statistics' => [[
                'team' => ['name' => $p['statistics'][0]['team']['name']],
                'goals' => ['total' => $p['statistics'][0]['goals']['total']]
            ]]
        ];
    }
}

// 7. OUTPUT & SAVE CACHE
$finalJson = json_encode($output);

// Only save to cache if we actually got data (prevents saving errors)
if (!empty($output['response'])) {
    file_put_contents($cacheFile, $finalJson);
}

echo $finalJson;
?>