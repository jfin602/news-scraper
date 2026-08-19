import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

const workspaceFiles = [
  {
    name: 'publication',
    unrelatedSelector:
      /data-(?:operations|source|endpoint|category|rule|article|review)-/u,
  },
  {
    name: 'operations',
    unrelatedSelector:
      /data-(?:publication|source|endpoint|category|rule|article|review)-/u,
  },
  {
    name: 'sources',
    unrelatedSelector:
      /data-(?:publication|operations|category-list|rule-|article|review)-/u,
  },
  {
    name: 'editorial',
    unrelatedSelector:
      /data-(?:publication|operations|source|endpoint|article|review)-/u,
  },
  {
    name: 'moderation',
    unrelatedSelector:
      /data-(?:publication|operations|source-list|endpoint|category-list|rule)-/u,
  },
] as const;

describe('admin workspace DOM ownership', () => {
  it('keeps each workspace registry local, used, and free of broad lint suppression', async () => {
    for (const workspace of workspaceFiles) {
      const source = await readFile(
        new URL(
          `../../src/app/web/admin/${workspace.name}.js`,
          import.meta.url,
        ),
        'utf8',
      );
      assert.doesNotMatch(
        source,
        /eslint-disable @typescript-eslint\/no-unused-vars/u,
        workspace.name,
      );

      const registry = source.match(/const elements = \{([\s\S]*?)\n\};/u);
      if (registry === null)
        throw new Error(`${workspace.name} has no elements registry`);
      const members = [
        ...(registry[1] ?? '').matchAll(/^\x20{2}(\w+): required\(/gmu),
      ].map((match) => match[1]);
      assert.ok(members.length > 0, `${workspace.name} owns controls`);
      for (const member of members) {
        assert.match(
          source.slice((registry.index ?? 0) + registry[0].length),
          new RegExp(`\\belements\\.${member}\\b`, 'u'),
          `${workspace.name}.${member} is consumed locally`,
        );
      }

      assert.doesNotMatch(registry[0], /data-workspace(?:-|\])/u);
      assert.doesNotMatch(registry[0], workspace.unrelatedSelector);
    }
  });
});
