<?php

declare(strict_types=1);

namespace NewsScraper\Integration\Php;

final class HttpRequest
{
    /**
     * @param array<string, string> $headers
     */
    public function __construct(
        public readonly string $url,
        public readonly array $headers,
        public readonly int $timeoutSeconds,
        public readonly int $maxResponseBytes,
        public readonly bool $followRedirects = false,
    ) {
    }
}

final class HttpResponse
{
    /**
     * @param array<string, string> $headers
     */
    public function __construct(
        public readonly int $status,
        array $headers,
        public readonly string $body,
    ) {
        $normalized = [];
        foreach ($headers as $name => $value) {
            if (!is_string($name) || !is_string($value)) {
                continue;
            }
            $normalized[strtolower($name)] = trim($value);
        }
        $this->headers = $normalized;
    }

    /**
     * @return array<string, string>
     */
    public readonly array $headers;

    public function header(string $name): ?string
    {
        return $this->headers[strtolower($name)] ?? null;
    }
}

interface HttpTransport
{
    public function send(HttpRequest $request): HttpResponse;
}

final class TransportFailure extends \RuntimeException
{
}

final class NativeHttpTransport implements HttpTransport
{
    public function send(HttpRequest $request): HttpResponse
    {
        $headerLines = [];
        foreach ($request->headers as $name => $value) {
            $headerLines[] = $name . ': ' . $value;
        }

        $context = stream_context_create([
            'http' => [
                'method' => 'GET',
                'header' => implode("\r\n", $headerLines),
                'ignore_errors' => true,
                'follow_location' => 0,
                'max_redirects' => 0,
                'protocol_version' => 1.1,
                'timeout' => $request->timeoutSeconds,
            ],
            'ssl' => [
                'verify_peer' => true,
                'verify_peer_name' => true,
                'allow_self_signed' => false,
            ],
        ]);

        $stream = null;
        $previousHandler = set_error_handler(
            static function (): never {
                throw new \RuntimeException('stream failure');
            },
        );

        try {
            $stream = fopen($request->url, 'rb', false, $context);
            if ($stream === false) {
                throw new \RuntimeException('stream unavailable');
            }

            $body = stream_get_contents($stream, $request->maxResponseBytes + 1);
            if ($body === false || strlen($body) > $request->maxResponseBytes) {
                throw new \RuntimeException('response exceeded the configured limit');
            }

            $metadata = stream_get_meta_data($stream);
            $statusAndHeaders = $this->parseWrapperData($metadata['wrapper_data'] ?? null);

            return new HttpResponse(
                $statusAndHeaders['status'],
                $statusAndHeaders['headers'],
                $body,
            );
        } catch (\Throwable) {
            throw new TransportFailure('The upstream request could not be completed.');
        } finally {
            if (is_resource($stream)) {
                fclose($stream);
            }
            restore_error_handler();
        }
    }

    /**
     * @return array{status: int, headers: array<string, string>}
     */
    private function parseWrapperData(mixed $wrapperData): array
    {
        $lines = is_array($wrapperData) ? $wrapperData : [$wrapperData];
        $status = null;
        $headers = [];

        foreach ($lines as $line) {
            if (!is_string($line)) {
                continue;
            }
            if (preg_match('/^HTTP\/\S+\s+(\d{3})/i', $line, $matches) === 1) {
                $status = (int) $matches[1];
                $headers = [];
                continue;
            }
            $separator = strpos($line, ':');
            if ($separator === false) {
                continue;
            }
            $name = strtolower(trim(substr($line, 0, $separator)));
            $value = trim(substr($line, $separator + 1));
            if ($name !== '') {
                $headers[$name] = $value;
            }
        }

        if ($status === null) {
            throw new \RuntimeException('missing upstream status');
        }

        return ['status' => $status, 'headers' => $headers];
    }
}
