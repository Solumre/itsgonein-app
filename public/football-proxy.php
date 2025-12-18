<?php
// Replace with your real API key
$apiKey = '258ebd52f0974d3da86a562b509bed14';

// Get the type of data requested (e.g., standings, scorers, or matches)
$type = $_GET['type'] ?? 'standings';

$urls = [
    'standings' => 'https://api.football-data.org/v4/competitions/PL/standings',
    'scorers'   => 'https://api.football-data.org/v4/competitions/PL/scorers',
    'matches'   => 'https://api.football-data.org/v4/competitions/PL/matches?status=SCHEDULED'
];

$url = $urls[$type] ?? $urls['standings'];

$ch = curl_init();
curl_setopt($ch, CURLOPT_URL, $url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, ['X-Auth-Token: ' . $apiKey]);

// Allow your React site to talk to this script
header('Access-Control-Allow-Origin: *');
header('Content-Type: application/json');

echo curl_exec($ch);
curl_close($ch);
?>