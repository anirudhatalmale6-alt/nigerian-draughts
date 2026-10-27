<?php
/** POST {name, email, whatsapp?, city?} → adds the player to the waiting list and emails the owner. */

declare(strict_types=1);
require __DIR__ . '/lib.php';

$in = ndc_input();
ndc_rate_limit('join', 20);

$name = ndc_text($in['name'] ?? '', 80);
$email = strtolower(ndc_text($in['email'] ?? '', 190));
$whatsapp = preg_replace('/[^\d+]/', '', ndc_text($in['whatsapp'] ?? '', 24)) ?? '';
$city = ndc_text($in['city'] ?? '', 60);

if (mb_strlen($name) < 2) {
	ndc_json(422, ['error' => 'Please enter your name.']);
}
if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
	ndc_json(422, ['error' => 'Please enter a valid email address.']);
}
if ($whatsapp !== '' && (strlen($whatsapp) < 7 || strlen($whatsapp) > 16)) {
	ndc_json(422, ['error' => 'Please check your WhatsApp number.']);
}

$db = ndc_db();
$exists = $db->prepare('SELECT id FROM waitlist WHERE email = ?');
$exists->execute([$email]);
if ($exists->fetchColumn()) {
	// Same answer as a new sign-up: the list never reveals who else is on it.
	ndc_json(200, ['ok' => true, 'waiting' => ndc_waiting_count()]);
}

$db->prepare('INSERT INTO waitlist (name, email, whatsapp, city, created_at, ip_hash) VALUES (?, ?, ?, ?, ?, ?)')
	->execute([$name, $email, $whatsapp, $city, gmdate('Y-m-d H:i:s'), ndc_ip_hash()]);
ndc_record_hit('join');
$count = ndc_waiting_count();

ndc_notify(
	"New Naija Draft Club sign-up: $name" . ($city !== '' ? " ($city)" : ''),
	"A new player joined the waiting list.\n\n" .
	"Name: $name\nEmail: $email\nWhatsApp: " . ($whatsapp ?: '-') . "\nCity: " . ($city ?: '-') . "\n\n" .
	"Players waiting so far: $count\n",
	$email
);

ndc_json(200, ['ok' => true, 'waiting' => $count]);
