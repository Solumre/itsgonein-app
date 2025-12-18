<?php
// 1. HEADERS
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, X-Auth-Token");
header("Content-Type: application/json");

// 2. CONFIGURATION
// ⚠️ Your Football-Data.org Key
$apiKey = '3872efd6b7d1421bb5065cf191ff6bcf'; 

// 3. MAPPING
$leagueMap = [
    '39'  => 'PL',   // Premier League
    '140' => 'PD',   // La Liga
    '78'  => 'BL1',  // Bundesliga
    '135' => 'SA',   // Serie A
    '61'  => 'FL1',  // Ligue     '88'  => 'DED',  // Eredivisie
    '71'  => 'BSA',  // Brasileirao
    '94'  => 'PPL',  // Primeira Liga
];

$leagueId = $_GET['league'] ?? '39';
$type = $_GET['type'] ?? 'standings';
$competionCode = $leagueMap[$leagueId] ?? 'PL';

// 4. BUILD URL
$baseUrl = "https://api.football-data.org/v4/competitions/$competionCode";
$url = "";

if ($type === 'standings') {
    $url = "$baseUrl/standings";
} 
elseif ($type === 'scorers') {
    $url = "$baseUrl/scorers";
} 
elseif ($type === 'fixtures') {
    // Fetch SCHEDULED and LIVE matches
    $url = "$baseUrl/matches?status=SCHEDULED,LIVE,IN_PLAY,PAUSED,FINISHED"; 
}

// 5. REQUEST (Fetch Data First)
$curl = curl_init();
curl_setopt_array($curl, [
    CURLOPT_URL => $url,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_HTTPHEADER => [
        "X-Auth-Token: " . $apiKey
    ],
]);
$response = curl_exec($curl);
curl_close($curl);

// 6. ADAPTER (Transform Data AFTER fetching it)
$data = json_decode($response, true);
$output = ['response' => []];

if ($type === 'standings' && isset($data['standings'][0]['table'])) {
    $cleanTable = [];
    foreach ($data['standings'][0]['table'] as $t) {
        $cleanTable[] = [
            'rank' => $t['position'],
            'team' => ['id' => $t['team']['id'], 'name' => $t['team']['name'], 'logo' => $t['team']['crest'], 'id_clean' => $t['team']['tla']],
            'points' => $t['points'],
            'all' => ['played' => $t['playedGames'], 'win' => $t['won'], 'draw' => $t['draw'], 'lose' => $t['lost']],
            'form' => str_replace(',', '', $t['form'] ?? '')
        ];
    }
    $output['response'][] = ['league' => ['standings' => [$cleanTable]]];
}
elseif ($type === 'scorers' && isset($data['scorers'])) {
    foreach ($data['scorers'] as $s) {
        $output['response'][] = [
            'player' => ['name' => $s['player']['name'], 'photo' => 'https://crests.football-data.org/generic.png'], 
            'statistics' => [['team' => ['name' => $s['team']['name']], 'goals' => ['total' => $s['goals']]]]
        ];
    }
}
elseif ($type === 'fixtures' && isset($data['matches'])) {
    $count = 0;
    foreach ($data['matches'] as $m) {
        if ($m['status'] !== 'FINISHED') {
            $output['response'][] = [
                'fixture' => [
                    'id' => $m['id'],
                    'date' => $m['utcDate'],
                    'status' => ['short' => $m['status']]
                ],
                'teams' => [
                    'home' => ['name' => $m['homeTeam']['name'], 'logo' => $m['homeTeam']['crest']],
                    'away' => ['name' => $m['awayTeam']['name'], 'logo' => $m['awayTeam']['crest']]
                ],
                'goals' => [
                    'home' => $m['score']['fullTime']['home'], 
                    'away' => $m['score']['fullTime']['away']
                ]
            ];
            $count++;
            if ($count >= 15) break; 
        }
    }
}

echo json_encode($output);
?>