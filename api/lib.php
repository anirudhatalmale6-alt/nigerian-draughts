<?php
/**
 * Shared helpers for the Naija Draft Club API (waiting list, feedback, stats).
 *
 * Settings live OUTSIDE the website folder (/home/<user>/ndc-private/config.php), so the database
 * password can never be downloaded. Locally, NDC_CONFIG points to a test config.
 */

declare(strict_types=1);

$ndcConfig = getenv('NDC_CONFIG') ?: dirname(__DIR__, 2) . '/ndc-private/config.php';
if (!is_file($ndcConfig)) {
	http_response_code(500);
	exit('Not configured');
}
require $ndcConfig; // defines NDC_DSN, NDC_DB_USER, NDC_DB_PASS, NDC_OWNER_EMAIL (comma-separated), NDC_MAIL_FROM, NDC_SALT

function ndc_db(): PDO {
	static $pdo = null;
	if ($pdo) {
		return $pdo;
	}
	$pdo = new PDO(NDC_DSN, NDC_DB_USER, NDC_DB_PASS, [
		PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
		PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
	]);
	$sqlite = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite';
	$id = $sqlite ? 'INTEGER PRIMARY KEY AUTOINCREMENT' : 'INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY';
	$opts = $sqlite ? '' : ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4';
	$pdo->exec("CREATE TABLE IF NOT EXISTS waitlist (
		id $id,
		name VARCHAR(80) NOT NULL,
		email VARCHAR(190) NOT NULL UNIQUE,
		whatsapp VARCHAR(24) NOT NULL DEFAULT '',
		city VARCHAR(60) NOT NULL DEFAULT '',
		created_at VARCHAR(20) NOT NULL,
		ip_hash CHAR(64) NOT NULL
	)$opts");
	$pdo->exec("CREATE TABLE IF NOT EXISTS feedback (
		id $id,
		name VARCHAR(80) NOT NULL DEFAULT '',
		email VARCHAR(190) NOT NULL DEFAULT '',
		message TEXT NOT NULL,
		context VARCHAR(255) NOT NULL DEFAULT '',
		created_at VARCHAR(20) NOT NULL,
		ip_hash CHAR(64) NOT NULL
	)$opts");
	$pdo->exec("CREATE TABLE IF NOT EXISTS hits (
		id $id,
		ip_hash CHAR(64) NOT NULL,
		action VARCHAR(20) NOT NULL,
		at INT NOT NULL
	)$opts");
	return $pdo;
}

function ndc_json(int $status, array $data): void {
	http_response_code($status);
	header('Content-Type: application/json; charset=utf-8');
	header('Cache-Control: no-store');
	echo json_encode($data, JSON_UNESCAPED_UNICODE);
	exit;
}

/** POSTed JSON body; anything else is refused. */
function ndc_input(): array {
	if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
		ndc_json(405, ['error' => 'POST only']);
	}
	$data = json_decode((string) file_get_contents('php://input'), true);
	if (!is_array($data)) {
		ndc_json(400, ['error' => 'Invalid request']);
	}
	// Honeypot: a hidden field real visitors never fill.
	if (!empty($data['website'])) {
		ndc_json(200, ['ok' => true]);
	}
	return $data;
}

/** One-line text: trimmed, control characters removed, length capped. */
function ndc_text($value, int $max): string {
	$value = preg_replace('/[\x00-\x1F\x7F]+/u', ' ', (string) $value) ?? '';
	return mb_substr(trim($value), 0, $max);
}

function ndc_ip_hash(): string {
	return hash('sha256', NDC_SALT . '|' . ($_SERVER['REMOTE_ADDR'] ?? ''));
}

/**
 * At most $max successful actions of this kind per address per hour. Only successes are counted
 * (ndc_record_hit), so a player correcting a typo is never locked out. The limit is generous because
 * many mobile users in Nigeria share one network address.
 */
function ndc_rate_limit(string $action, int $max): void {
	$db = ndc_db();
	$now = time();
	$db->prepare('DELETE FROM hits WHERE at < ?')->execute([$now - 86400]);
	$q = $db->prepare('SELECT COUNT(*) FROM hits WHERE ip_hash = ? AND action = ? AND at > ?');
	$q->execute([ndc_ip_hash(), $action, $now - 3600]);
	if ((int) $q->fetchColumn() >= $max) {
		ndc_json(429, ['error' => 'Too many attempts. Please try again later.']);
	}
}

function ndc_record_hit(string $action): void {
	ndc_db()->prepare('INSERT INTO hits (ip_hash, action, at) VALUES (?, ?, ?)')->execute([ndc_ip_hash(), $action, time()]);
}

function ndc_waiting_count(): int {
	return (int) ndc_db()->query('SELECT COUNT(*) FROM waitlist')->fetchColumn();
}

/** Plain-text notification to the club owner. Failure to send never loses the saved entry. */
function ndc_notify(string $subject, string $body, string $replyTo = ''): bool {
	$headers = [
		'From: Naija Draft Club <' . NDC_MAIL_FROM . '>',
		'Content-Type: text/plain; charset=UTF-8',
	];
	if ($replyTo !== '' && filter_var($replyTo, FILTER_VALIDATE_EMAIL)) {
		$headers[] = 'Reply-To: ' . $replyTo;
	}
	$subject = mb_encode_mimeheader(str_replace(["\r", "\n"], ' ', $subject), 'UTF-8');
	// One message per recipient: the host's sendmail refuses a combined "a, b" list, and a bad
	// address must never stop the others from getting the notification.
	$sent = false;
	foreach (array_filter(array_map('trim', explode(',', NDC_OWNER_EMAIL))) as $to) {
		$sent = @mail($to, $subject, $body, implode("\r\n", $headers), '-f' . NDC_MAIL_FROM) || $sent;
	}
	return $sent;
}
