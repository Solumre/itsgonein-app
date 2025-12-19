<?php
// 1. HEADERS
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, X-Auth-Token");
header("Content-Type: application/json");

// 2. CONFIGURATION
$apiKey = '3872efd6b7d1421bb5065cf191ff6bcf'; 
$cacheTime = 300; 

// 3. MAPPING
$leagueMap = [
    '39'  => 'PL',   '140' => 'PD',   '78'  => 'BL1',
    '135' => 'SA',   '61'  => 'FL1',  '88'  => 'DED',
    '71'  => 'BSA',  '94'  => 'PPL'
];

$leagueId = $_GET['league'] ?? '39';
$type = $_GET['type'] ?? 'standings';
$matchId = $_GET['match_id'] ?? null; // Added for Match Center
$competionCode = $leagueMap[$leagueId] ?? 'PL';

// 4. CACHE SETUP
// Unique cache file per match if match_id is provided
$cacheFile = $matchId ? "cache_match_{$matchId}.json" : "cache_{$competionCode}_{$type}.json";
$currentTime = time();

 if (file_exists($cacheFile) && ($currentTime - filemtime($cacheFile) < $cacheTime)) {
    echo file_get_contents($cacheFile);
    exit;
}

// 5. BUILD URL & HEADERS
$baseUrl = "https://api.football-data.org/v4";
$url = "";
$headers = [ "X-Auth-Token: " . $apiKey ];

if ($type === 'match_details' && $matchId) {
    // Specific match endpoint for the timeline
    $url = "$baseUrl/matches/$matchId";
} 
elseif ($type === 'standings') { 
    $url = "$baseUrl/competitions/$competionCode/standings"; 
} 
elseif ($type === 'scorers') { 
    $url = "$baseUrl/competitions/$competionCode/scorers"; 
} 
elseif ($type === 'fixtures') { 
    $url = "$baseUrl/competitions/$competionCode/matches?status=SCHEDULED,LIVE,IN_PLAY,PAUSED,FINISHED"; 
}

// 6. REQUEST API
$curl = curl_init();
curl_setopt_array($curl, [
    CURLOPT_URL => $url,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_HTTPHEADER => $headers,
]);
$response = curl_exec($curl);
$httpCode = curl_getinfo($curl, CURLINFO_HTTP_CODE);
curl_close($curl);

 if ($httpCode === 429 && file_exists($cacheFile)) {
    echo file_get_contents($cacheFile);
    exit;
}

// 8. ADAPTER (Transform Data)
$data = json_decode($response, true);
$output = ['response' => []];

// NEW: Match Details Adapter for Timeline
if ($type === 'match_details' && isset($data['id'])) {
    $events = [];
    
    // Extract goals for timeline
    if (isset($data['goals'])) {
        foreach ($data['goals'] as $g) {
            $events[] = [
                'time' => ($g['minute'] ?? '??') . "'",
                'type' => 'GOAL',
                'detail' => "Goal! " . ($g['scorer']['name'] ?? 'Unknown'),
                'icon' => '⚽️'
            ];
        }
    }

    // Sort events by time (descending)
    usort($events, function($a, $b) { 
        return (int)$b['time'] - (int)$a['time']; 
    });

    $output['response'] = [
        'match' => [
            'home' => $data['homeTeam']['name'],
            'homeLogo' => $data['homeTeam']['crest'],
            'away' => $data['awayTeam']['name'],
            'awayLogo' => $data['awayTeam']['crest'],
            'score' => ($data['score']['fullTime']['home'] ?? 0) . " - " . ($data['score']['fullTime']['away'] ?? 0)
        ],
        'timeline' => $events
    ];
}
// Existing Standings Adapter
elseif ($type === 'standings' && isset($data['standings'][0]['table'])) {
    $cleanTable = [];
    foreach ($data['standings'][0]['table'] as $t) {
        $cleanTable[] = [
            'rank' => $t['position'],
            'team' => ['id' => $t['team']['id'], 'name' => $t['team']['name'], 'logo' => $t['team']['crest']],
            'points' => $t['points'],
            'all' => ['played' => $t['playedGames'], 'win' => $t['won'], 'draw' => $t['draw'], 'lose' => $t['lost']],
            'form' => str_replace(',', '', $t['form'] ?? '')
        ];
    }
    $output['response'][] = ['league' => ['standings' => [$cleanTable]]];
}
// Existing Scorers Adapter
elseif ($type === 'scorers' && isset($data['scorers'])) {
    foreach ($data['scorers'] as $s) {
        $output['response'][] = [
            'player' => ['name' => $s['player']['name'], 'photo' => 'https://crests.football-data.org/generic.png'], 
            'statistics' => [['team' => ['name' => $s['team']['name']], 'goals' => ['total' => $s['goals']]]]
        ];
    }
}
// Existing Fixtures Adapter
elseif ($type === 'fixtures' && isset($data['matches'])) {
    $count = 0;
    foreach ($data['matches'] as $m) {
        if ($m['status'] !== 'FINISHED') {
            $output['response'][] = [
                'fixture' => [ 'id' => $m['id'], 'date' => $m['utcDate'], 'status' => ['short' => $m['status']] ],
                'teams' => [
                    'home' => ['name' => $m['homeTeam']['name'], 'logo' => $m['homeTeam']['crest']],
                    'away' => ['name' => $m['awayTeam']['name'], 'logo' => $m['awayTeam']['crest']]
                ],
                'goals' => [ 'home' => $m['score']['fullTime']['home'], 'away' => $m['score']['fullTime']['away'] ]
            ];
            $count++;
            if ($count >= 15) break; 
        }
    }
}

// 9. SAVE TO CACHE & OUTPUT
$finalJson = json_encode($output);
 if (!empty($output['response'])) {
    file_put_contents($cacheFile, $finalJson);
}
echo $finalJson;
?>