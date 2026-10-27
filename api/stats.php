<?php
/** GET → {waiting: n}, the public "players already waiting" counter. */

declare(strict_types=1);
require __DIR__ . '/lib.php';

// Cached for a minute: thousands of visitors cost at most one database query per minute per browser.
ndc_json(200, ['waiting' => ndc_waiting_count()], 60);
