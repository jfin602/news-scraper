<?php

declare(strict_types=1);

namespace NewsScraper\Integration\Php;

interface LocalFilesystem
{
    public function writeExclusive(string $path, string $contents): void;
    public function rename(string $from, string $to): void;
    public function read(string $path): string;
    public function exists(string $path): bool;
    public function isFile(string $path): bool;
    public function isLink(string $path): bool;
    /** @return array<int, string> */
    public function entries(string $path): array;
    public function delete(string $path): void;
}

final class NativeLocalFilesystem implements LocalFilesystem
{
    public function writeExclusive(string $path, string $contents): void
    {
        $handle = @fopen($path, 'x+b');
        if ($handle === false) throw new LocalStateException('Local temporary file cannot be opened.');
        try {
            $offset = 0;
            while ($offset < strlen($contents)) {
                $written = fwrite($handle, substr($contents, $offset));
                if ($written === false || $written === 0) throw new LocalStateException('Local temporary file cannot be written.');
                $offset += $written;
            }
            if (!fflush($handle)) throw new LocalStateException('Local temporary file cannot be flushed.');
        } finally {
            fclose($handle);
        }
        @chmod($path, 0600);
    }
    public function rename(string $from, string $to): void { if (!@rename($from, $to)) throw new LocalStateException('Local atomic rename failed.'); }
    public function read(string $path): string { $value = @file_get_contents($path); if ($value === false) throw new LocalStateException('Local state cannot be read.'); return $value; }
    public function exists(string $path): bool { return file_exists($path); }
    public function isFile(string $path): bool { return is_file($path); }
    public function isLink(string $path): bool { return is_link($path); }
    public function entries(string $path): array { $entries = @scandir($path); if ($entries === false) throw new LocalStateException('Local state cannot be listed.'); return $entries; }
    public function delete(string $path): void { if (!@unlink($path)) throw new LocalStateException('Local stale generation cannot be removed.'); }
}

final class FilesystemProfileStateStore implements ProfileSynchronizationStore
{
    private const SCHEMA_VERSION = 1;
    private ProfileStatePaths $paths;

    public function __construct(string $stateRoot, private readonly LocalFilesystem $filesystem = new NativeLocalFilesystem())
    {
        $this->paths = new ProfileStatePaths($stateRoot);
    }

    public function load(string $profileKey): LocalProfileState
    {
        $manifest = $this->readManifest($profileKey, false);
        if ($manifest === null) return new LocalProfileState($profileKey, null, false, null);
        $active = null;
        if ($manifest['activeGeneration'] !== null) $active = $this->readGeneration($profileKey, $manifest);
        return new LocalProfileState($profileKey, $active, $manifest['disabled'], $this->dateOrNull($manifest['lastSuccessfulSyncAt']));
    }

    public function health(string $profileKey): LocalProfileHealth
    {
        $manifest = $this->readManifest($profileKey, false);
        if ($manifest === null) return new LocalProfileHealth($profileKey, null, null, null, null, null, null, false, null, null, null, false, 'news-scraper-php');
        return new LocalProfileHealth($profileKey, $this->dateOrNull($manifest['lastAttemptAt']), $this->dateOrNull($manifest['lastSuccessfulSyncAt']), $manifest['syncResult'], $manifest['durationSeconds'], $manifest['itemCount'], $manifest['pageCount'], $manifest['unchanged'], $manifest['snapshotRevision'], $manifest['etag'], $manifest['failureCategory'], $manifest['disabled'], $manifest['adapterVersion']);
    }

    public function readForPhase6(string $profileKey, LocalProfileUsabilityResolver $resolver, SynchronizationClock $clock): LocalProfileRead
    {
        try {
            $state = $this->load($profileKey);
            return new LocalProfileRead($state->active, $resolver->resolve($state, $clock->now()), $this->health($profileKey));
        } catch (LocalStateException) {
            return new LocalProfileRead(null, new LocalProfileUsability(LocalProfileUsability::UNAVAILABLE, null), new LocalProfileHealth($profileKey, null, null, 'local_unavailable', null, null, null, false, null, null, 'local_state_invalid', false, 'news-scraper-php'));
        }
    }

    public function activate(ProfileActivation $activation): void
    {
        $this->ensureDirectories($activation->profileKey);
        $generation = 'g-' . bin2hex(random_bytes(16)) . '.json';
        $payload = $this->encodeGeneration($activation);
        $directory = $this->paths->profileDirectory($activation->profileKey);
        $temporary = $directory . DIRECTORY_SEPARATOR . '.' . $generation . '.tmp';
        $final = $directory . DIRECTORY_SEPARATOR . 'generations' . DIRECTORY_SEPARATOR . $generation;
        $this->filesystem->writeExclusive($temporary, $payload);
        $this->filesystem->rename($temporary, $final);

        $previous = $this->readManifest($activation->profileKey, false);
        $manifest = $this->manifestForFacts($activation->profileKey, $previous, $activation->facts, false);
        $manifest['activeGeneration'] = $generation;
        $manifest['previousGeneration'] = $previous['activeGeneration'] ?? null;
        $manifest['snapshotRevision'] = $activation->snapshotRevision;
        $manifest['etag'] = $activation->etag;
        $manifest['apiVersion'] = $activation->apiVersion;
        $manifest['generatedAt'] = $activation->generatedAt;
        $this->commitManifest($activation->profileKey, $manifest);
        try { $this->pruneGenerations($activation->profileKey, $generation, $manifest['previousGeneration']); } catch (\Throwable) { /* activation is committed; pruning is best-effort */ }
    }

    public function recordUnchanged(UnchangedSynchronization $unchanged): void
    {
        $current = $this->readManifest($unchanged->profileKey, true);
        if ($current['activeGeneration'] === null) throw new LocalStateException('Cannot record unchanged state without an active generation.');
        $manifest = $this->manifestForFacts($unchanged->profileKey, $current, $unchanged->facts, false);
        $manifest['etag'] = $unchanged->etag;
        $this->commitManifest($unchanged->profileKey, $manifest);
    }

    public function markDisabled(string $profileKey, SynchronizationFacts $facts): void
    {
        $current = $this->readManifest($profileKey, false);
        $manifest = $this->manifestForFacts($profileKey, $current, $facts, true);
        $this->commitManifest($profileKey, $manifest);
    }

    public function recordFailure(string $profileKey, SynchronizationFacts $facts): void
    {
        $current = $this->readManifest($profileKey, false);
        $this->commitManifest($profileKey, $this->manifestForFacts($profileKey, $current, $facts, is_array($current) ? $current['disabled'] : false));
    }

    /** @return array<string, mixed>|null */
    private function readManifest(string $profileKey, bool $required): ?array
    {
        $directory = $this->paths->profileDirectory($profileKey);
        $this->assertSafeReadDirectory($this->paths->root());
        $this->assertSafeReadDirectory($this->paths->root() . DIRECTORY_SEPARATOR . 'profiles');
        $this->assertSafeReadDirectory($directory);
        $path = $directory . DIRECTORY_SEPARATOR . 'manifest.json';
        if (!$this->filesystem->exists($path)) {
            if ($required) throw new LocalStateException('Committed local state is missing.');
            return null;
        }
        $this->assertSafeFile($path);
        try { $data = json_decode($this->filesystem->read($path), true, 64, JSON_THROW_ON_ERROR); } catch (\Throwable) { throw new LocalStateException('Committed local state is invalid.'); }
        if (!is_array($data) || array_is_list($data) || ($data['schemaVersion'] ?? null) !== self::SCHEMA_VERSION || ($data['profileKey'] ?? null) !== $profileKey || ($data['profileIdentity'] ?? null) !== hash('sha256', $profileKey)) throw new LocalStateException('Committed local state does not match the Profile.');
        foreach (['activeGeneration', 'previousGeneration', 'snapshotRevision', 'etag', 'apiVersion', 'generatedAt', 'lastAttemptAt', 'lastSuccessfulSyncAt', 'syncResult', 'durationSeconds', 'itemCount', 'pageCount', 'unchanged', 'failureCategory', 'disabled', 'adapterVersion'] as $key) if (!array_key_exists($key, $data)) throw new LocalStateException('Committed local state is incomplete.');
        foreach (['activeGeneration', 'previousGeneration', 'snapshotRevision', 'etag', 'apiVersion', 'generatedAt', 'lastAttemptAt', 'lastSuccessfulSyncAt', 'syncResult', 'failureCategory'] as $key) if ($data[$key] !== null && !is_string($data[$key])) throw new LocalStateException('Committed local state has invalid metadata.');
        if (!is_bool($data['disabled']) || !is_bool($data['unchanged']) || !is_string($data['adapterVersion']) || ($data['durationSeconds'] !== null && (!is_float($data['durationSeconds']) && !is_int($data['durationSeconds']) || $data['durationSeconds'] < 0)) || ($data['itemCount'] !== null && (!is_int($data['itemCount']) || $data['itemCount'] < 0)) || ($data['pageCount'] !== null && (!is_int($data['pageCount']) || $data['pageCount'] < 0))) throw new LocalStateException('Committed local state has invalid health.');
        if ($data['activeGeneration'] !== null && (preg_match('/^g-[a-f0-9]{32}\.json$/D', $data['activeGeneration']) !== 1 || $data['apiVersion'] !== 'v1' || $data['snapshotRevision'] === null)) throw new LocalStateException('Committed local active state is invalid.');
        return $data;
    }

    /** @param array<string,mixed> $manifest */
    private function readGeneration(string $profileKey, array $manifest): ActiveProfileSnapshot
    {
        $generationDirectory = $this->paths->profileDirectory($profileKey) . DIRECTORY_SEPARATOR . 'generations';
        $this->assertSafeReadDirectory($generationDirectory);
        $path = $generationDirectory . DIRECTORY_SEPARATOR . $manifest['activeGeneration'];
        $this->assertSafeFile($path);
        try { $data = json_decode($this->filesystem->read($path), true, 64, JSON_THROW_ON_ERROR); } catch (\Throwable) { throw new LocalStateException('Committed generation is invalid.'); }
        if (!is_array($data) || array_is_list($data) || ($data['profileKey'] ?? null) !== $profileKey || ($data['apiVersion'] ?? null) !== $manifest['apiVersion'] || ($data['snapshotRevision'] ?? null) !== $manifest['snapshotRevision'] || ($data['generatedAt'] ?? null) !== $manifest['generatedAt'] || !is_array($data['profile'] ?? null) || !is_array($data['publication'] ?? null) || !is_array($data['items'] ?? null)) throw new LocalStateException('Committed generation does not match its manifest.');
        try { return new ActiveProfileSnapshot($profileKey, $this->profileFromArray($data['profile']), $this->publicationFromArray($data['publication']), $data['apiVersion'], $data['snapshotRevision'], $manifest['etag'], $data['generatedAt'], array_map(fn (mixed $item): DistributionArticle => $this->articleFromArray($item), $data['items']), array_key_exists('digest', $data) && $data['digest'] !== null ? DistributionDigestMapper::fromArray($data['digest']) : null); } catch (\Throwable) { throw new LocalStateException('Committed generation has invalid item data.'); }
    }

    /** @return array<string,mixed> */
    private function manifestForFacts(string $profileKey, ?array $current, SynchronizationFacts $facts, bool $disabled): array
    {
        return [
            'schemaVersion' => self::SCHEMA_VERSION, 'profileKey' => $profileKey, 'profileIdentity' => hash('sha256', $profileKey),
            'activeGeneration' => $current['activeGeneration'] ?? null, 'previousGeneration' => $current['previousGeneration'] ?? null,
            'snapshotRevision' => $current['snapshotRevision'] ?? null, 'etag' => $current['etag'] ?? null, 'apiVersion' => $current['apiVersion'] ?? null, 'generatedAt' => $current['generatedAt'] ?? null,
            'lastAttemptAt' => $facts->attemptedAt->format(DATE_ATOM), 'lastSuccessfulSyncAt' => $facts->lastSuccessfulSyncAt?->format(DATE_ATOM),
            'syncResult' => $facts->outcome, 'durationSeconds' => $facts->durationSeconds, 'itemCount' => $facts->itemCount, 'pageCount' => $facts->pageCount,
            'unchanged' => $facts->unchanged, 'failureCategory' => $facts->failureCategory, 'disabled' => $disabled, 'adapterVersion' => $facts->adapterVersion,
        ];
    }

    /** @param array<string,mixed> $manifest */
    private function commitManifest(string $profileKey, array $manifest): void
    {
        $this->ensureDirectories($profileKey);
        try { $contents = json_encode($manifest, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES); } catch (\Throwable) { throw new LocalStateException('Local manifest cannot be encoded.'); }
        $directory = $this->paths->profileDirectory($profileKey);
        $temporary = $directory . DIRECTORY_SEPARATOR . '.manifest-' . bin2hex(random_bytes(12)) . '.tmp';
        $this->filesystem->writeExclusive($temporary, $contents);
        $this->filesystem->rename($temporary, $directory . DIRECTORY_SEPARATOR . 'manifest.json');
    }

    private function ensureDirectories(string $profileKey): void
    {
        foreach ([$this->paths->root(), $this->paths->root() . DIRECTORY_SEPARATOR . 'profiles', $this->paths->profileDirectory($profileKey), $this->paths->profileDirectory($profileKey) . DIRECTORY_SEPARATOR . 'generations'] as $directory) {
            if (is_link($directory) || (file_exists($directory) && !is_dir($directory))) throw new LocalStateException('Unsafe local state directory.');
            if (!is_dir($directory) && !@mkdir($directory, 0700, true) && !is_dir($directory)) throw new LocalStateException('Local state directory cannot be created.');
            @chmod($directory, 0700);
        }
    }

    private function assertSafeFile(string $path): void
    {
        if ($this->filesystem->isLink($path) || !$this->filesystem->isFile($path)) throw new LocalStateException('Unsafe local state file.');
    }

    private function assertSafeReadDirectory(string $path): void
    {
        if ($this->filesystem->isLink($path) || ($this->filesystem->exists($path) && !is_dir($path))) {
            throw new LocalStateException('Unsafe local state directory.');
        }
    }

    private function pruneGenerations(string $profileKey, string $active, ?string $previous): void
    {
        $directory = $this->paths->profileDirectory($profileKey) . DIRECTORY_SEPARATOR . 'generations';
        foreach ($this->filesystem->entries($directory) as $entry) {
            if (preg_match('/^g-[a-f0-9]{32}\.json$/D', $entry) !== 1 || $entry === $active || $entry === $previous) continue;
            $path = $directory . DIRECTORY_SEPARATOR . $entry;
            $this->assertSafeFile($path);
            $this->filesystem->delete($path);
        }
    }

    /** @return array<string,mixed> */
    private function encodeGeneration(ProfileActivation $activation): string
    {
        $data = ['profileKey' => $activation->profileKey, 'profile' => ['configKey' => $activation->profile->configKey, 'displayName' => $activation->profile->displayName], 'publication' => ['name' => $activation->publication->name], 'apiVersion' => $activation->apiVersion, 'snapshotRevision' => $activation->snapshotRevision, 'generatedAt' => $activation->generatedAt, 'items' => array_map(fn (DistributionArticle $item): array => $this->articleToArray($item), $activation->items), 'digest' => $activation->digest === null ? null : DistributionDigestMapper::toArray($activation->digest)];
        try { return json_encode($data, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES); } catch (\Throwable) { throw new LocalStateException('Generation cannot be encoded.'); }
    }

    /** @return array<string,mixed> */ private function articleToArray(DistributionArticle $item): array { return ['articleId'=>$item->articleId,'headline'=>$item->headline,'originalUrl'=>$item->originalUrl,'effectiveFeedDate'=>$item->effectiveFeedDate,'feedDateSource'=>$item->feedDateSource,'publishedAt'=>$item->publishedAt,'author'=>$item->author,'summary'=>$item->summary,'imageUrl'=>$item->imageUrl,'source'=>['configKey'=>$item->source->configKey,'displayName'=>$item->source->displayName],'categories'=>array_map(static fn (DistributionCategory $category): array => ['configKey'=>$category->configKey,'displayName'=>$category->displayName], $item->categories)]; }
    private function profileFromArray(mixed $data): DistributionProfile { if (!is_array($data) || !is_string($data['configKey'] ?? null) || !is_string($data['displayName'] ?? null)) throw new LocalStateException(); return new DistributionProfile($data['configKey'], $data['displayName']); }
    private function publicationFromArray(mixed $data): DistributionPublication { if (!is_array($data) || !is_string($data['name'] ?? null)) throw new LocalStateException(); return new DistributionPublication($data['name']); }
    private function articleFromArray(mixed $data): DistributionArticle { if (!is_array($data)) throw new LocalStateException(); $strings=['articleId','headline','originalUrl','effectiveFeedDate','feedDateSource']; foreach ($strings as $key) if (!is_string($data[$key] ?? null)) throw new LocalStateException(); foreach (['publishedAt','author','summary','imageUrl'] as $key) if (!array_key_exists($key,$data) || ($data[$key] !== null && !is_string($data[$key]))) throw new LocalStateException(); if (!is_array($data['source'] ?? null) || !is_string($data['source']['configKey'] ?? null) || !is_string($data['source']['displayName'] ?? null) || !is_array($data['categories'] ?? null)) throw new LocalStateException(); $categories=[]; foreach ($data['categories'] as $category) { if (!is_array($category) || !is_string($category['configKey'] ?? null) || !is_string($category['displayName'] ?? null)) throw new LocalStateException(); $categories[]=new DistributionCategory($category['configKey'],$category['displayName']); } return new DistributionArticle($data['articleId'],$data['headline'],$data['originalUrl'],$data['effectiveFeedDate'],$data['feedDateSource'],$data['publishedAt'],$data['author'],$data['summary'],$data['imageUrl'],new DistributionSource($data['source']['configKey'],$data['source']['displayName']),$categories); }
    private function dateOrNull(mixed $value): ?\DateTimeImmutable { if ($value === null) return null; if (!is_string($value) || preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/D', $value) !== 1) throw new LocalStateException('Invalid local timestamp.'); $date = \DateTimeImmutable::createFromFormat(DATE_ATOM, $value); $errors = \DateTimeImmutable::getLastErrors(); if ($date === false || ($errors !== false && ($errors['warning_count'] > 0 || $errors['error_count'] > 0))) throw new LocalStateException('Invalid local timestamp.'); return $date; }
}
