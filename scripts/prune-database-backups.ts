import { prunePostgresBackups } from '../src/database/backup.ts';

try {
  const directory = process.argv[2];
  const keep = Number(process.argv[3]);
  if (directory === undefined || directory.trim() === '')
    throw new Error('backup directory argument is required.');
  const apply = process.argv.includes('--apply');
  const removals = await prunePostgresBackups({
    directory,
    keep,
    dryRun: !apply,
  });
  console.log(
    `${apply ? 'Pruned' : 'Would prune'} ${removals.length} managed backup(s).`,
  );
  for (const removal of removals) console.log(removal);
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Backup pruning failed.',
  );
  process.exitCode = 1;
}
