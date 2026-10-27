<?php
/** GET → {waiting: n}, the public "players already waiting" counter. */

declare(strict_types=1);
require __DIR__ . '/lib.php';

ndc_json(200, ['waiting' => ndc_waiting_count()]);
