<?php
// 1. HEADERS
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, X-Auth-Token");
header("Content-Type: application/json");

// 2. CONFIGURATION
$apiKey = '3872efd6b7d1421bb5065cf191ff6bcf'; 
$cacheTime = 300; // Cache for 5 minutes (300 seconds)

// 3. MAPPING
$leagueMap = [
    '39'  => 'PL',   '140' => 'PD',   '78'  => 'BL1',
    '135' => 'SA',   '61'  => 'FL1',  '88'  => 'DED',
    '71'  => 'BSA',  '94'  => 'PPL'
];

$leagueId = $_GET['league'] ?? '39';
$type = $_GET['type'] ?? 'standings';
$competionCode = $leagueMap[$leagueId] ?? 'PL';

// 4. CACHE SETUP
$cacheFile = "cache_{$competionCode}_{$type}.json";
$currentTime = time();

// CHECK CACHE: If file exists and is less than 5 mins old, USE IT.
if (file_exists($cacheFile) && ($currentTime - filemtime($cacheFile) < $cacheTime)) {
    echo file_get_contents($cacheFile);
    exit;
}

// 5. IF NO CACHE, BUILD URL
$baseUrl = "https://api.football-data.org/v4/competitions/$competionCode";
$url = "";

if ($type === 'standings') { $url = "$baseUrl/standings"; } 
elseif ($type === 'scorers') { $url = "$baseUrl/scorers"; } 
elseif ($type === 'fixtures') { $url = "$baseUrl/matches?status=SCHEDULED,LIVE,IN_PLAY,PAUSED,FINISHED"; }

// 6. REQUEST API
$curl = curl_init();
curl_setopt_array($curl, [
    CURLOPT_URL => $url,
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_HTTPHEADER => [ "X-Auth-Token: " . $apiKey ],
]);
$response = curl_exec($curl);
$httpCode = curl_getinfo($curl, CURLINFO_HTTP_CODE);
curl_close($curl);

// 7. RATE LIMIT PROTECTION
// If API says "Too Many Requests" (429), serve old cache even if expired
if ($httpCode === 429 && file_exists($cacheFile)) {
    echo file_get_contents($cacheFile);
    exit;
}

// 8. ADAPTER (Transform Data)
$data = json_decode($response, true);
$output = ['response' => []];

if ($type === 'standings' && isset($data['standings'][0]['table'])) {
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
// Only save if we actually got data (not empty)
if (!empty($output['response'])) {
    file_put_contents($cacheFile, $finalJson);
}
echo $finalJson;
?>