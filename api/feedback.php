<?php
/** POST {message, name?, email?, context?} → stores player feedback and emails it to the owner. */

declare(strict_types=1);
require __DIR__ . '/lib.php';

$in = ndc_input();
ndc_rate_limit('feedback', 20);

$message = trim(mb_substr((string) ($in['message'] ?? ''), 0, 2000));
$name = ndc_text($in['name'] ?? '', 80);
$email = strtolower(ndc_text($in['email'] ?? '', 190));
$context = ndc_text($in['context'] ?? '', 255);

if (mb_strlen($message) < 3) {
	ndc_json(422, ['error' => 'Please write a few words.']);
}
if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
	ndc_json(422, ['error' => 'Please check your email address (or leave it empty).']);
}

ndc_db()->prepare('INSERT INTO feedback (name, email, message, context, created_at, ip_hash) VALUES (?, ?, ?, ?, ?, ?)')
	->execute([$name, $email, $message, $context, gmdate('Y-m-d H:i:s'), ndc_ip_hash()]);

ndc_record_hit('feedback');

ndc_notify(
	'Naija Draft Club feedback' . ($name !== '' ? " from $name" : ''),
	"A player sent feedback:\n\n$message\n\n" .
	'From: ' . ($name ?: 'anonymous') . ($email !== '' ? " <$email>" : '') . "\n" .
	'Game: ' . ($context ?: '-') . "\n",
	$email
);

ndc_json(200, ['ok' => true]);
