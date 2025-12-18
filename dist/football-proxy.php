<?php
// 1. Core Security Headers
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, X-Auth-Token");
header("Content-Type: application/json");

// 2. Configuration
$apiKey = '258ebd52f0974d3da86a562b509bed14';

// 3. Dynamic Parameters
// Get the requested league (defaults to PL) and data type (defaults to standings)
$league = $_GET['league'] ?? 'PL'; 
$type = $_GET['type'] ?? 'standings';

// Supported League Codes:
// PL = Premier League, PD = La Liga, SA = Serie A, BL1 = Bundesliga, FL1 = Ligue 1, BSA = Brasileirão
$urls = [
    'standings' => "https://api.football-data.org/v4/competitions/$league/standings",
    'scorers'   => "https://api.football-data.org/v4/competitions/$league/scorers",
    'matches'   => "https://api.football-data.org/v4/competitions/$league/matches?status=SCHEDULED"
];

// Fallback logic
$url = $urls[$type] ?? $urls['standings'];

// 4. Optimized cURL Request
$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'X-Auth-Token: ' . $apiKey,
    'Accept: application/json'
]);

// SSL trust fix for production servers
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);

$response = curl_exec($ch);

// 5. Error Handling & Output
if (curl_errno($ch)) {
    http_response_code(500);
    echo json_encode(['error' => 'Proxy Error: ' . curl_error($ch)]);
} else {
    echo $response;
}

curl_close($ch);
?>