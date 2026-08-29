<?php

declare(strict_types=1);

require_once __DIR__ . '/src/bootstrap.php';

use NewsScraper\Integration\Php\PackagePreflight;

$arguments = array_slice($argv, 1);
if (count(array_diff($arguments, ['--sync'])) > 0 || count($arguments) !== count(array_unique($arguments))) {
    fwrite(STDERR, "preflight_failed category=invalid_argument\n");
    exit(2);
}

try {
    $result = PackagePreflight::run(
        __DIR__,
        dirname(__DIR__) . DIRECTORY_SEPARATOR . 'ns-private',
        in_array('--sync', $arguments, true),
    );
    fwrite(STDOUT, 'preflight_ok version=' . $result['version'] . ' checks=' . implode(',', $result['checks']) . "\n");
    exit(0);
} catch (\InvalidArgumentException $error) {
    fwrite(STDERR, 'preflight_failed category=' . $error->getMessage() . "\n");
    exit(2);
} catch (\Throwable) {
    fwrite(STDERR, "preflight_failed category=internal_error\n");
    exit(2);
}
