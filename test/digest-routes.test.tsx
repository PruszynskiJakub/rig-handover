import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

// Routes only, through app.request(). The runs dir is a temp dir made here; the real runs/ is never read.

const JOBS = ['build/compile', 'lane/sync', 'notes/backup'];

const line = (at: string, job: string, status: string, owner: string | null, error: string | null) =>
  JSON.stringify({ at, job, status, owner, error });

let runsDir: string;
let app: ReturnType<typeof createApp>;

// The job column of the digest table, in the order the page renders it.
function jobsInHtml(html: string): string[] {
  return [...html.matchAll(/<tr[^>]*><td>([^<]*)<\/td>/g)].map((m) => m[1] ?? '');
}

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-routes-'));
  // Normal night. Lines are in no particular job order; the reader sorts them.
  writeFileSync(
    join(runsDir, '2026-10-29.jsonl'),
    [
      line('2026-10-29T01:00:00+01:00', 'lane/sync', 'ok', 'rook', null),
      line('2026-10-29T01:05:00+01:00', 'notes/backup', 'fail', 'rook', 'quota exceeded'),
      line('2026-10-29T01:10:00+01:00', 'build/compile', 'retry', 'ada', 'upstream 503'),
      line('2026-10-29T01:12:00+01:00', 'build/compile', 'ok', 'ada', null),
    ].join('\n') + '\n',
  );
  // Empty night: the file exists with no content.
  writeFileSync(join(runsDir, '2026-10-30.jsonl'), '');
  // Night with one truncated line among valid ones.
  writeFileSync(
    join(runsDir, '2026-10-31.jsonl'),
    [
      line('2026-10-31T01:00:00+01:00', 'lane/sync', 'ok', 'rook', null),
      '{"at":"2026-10-31T01:03:00+01:00","job":"build/compile","sta',
      line('2026-10-31T01:06:00+01:00', 'notes/backup', 'ok', 'rook', null),
    ].join('\n') + '\n',
  );
  app = createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  });
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

describe('GET /digest/:night (HTML)', () => {
  it('200 and lists each job for a night with a file', async () => {
    const res = await app.request('/digest/2026-10-29');
    const html = await res.text();
    expect(res.status).toBe(200);
    for (const job of JOBS) expect(html).toContain(job);
  });

  it('404 for a night with no file', async () => {
    const res = await app.request('/digest/2026-11-01');
    const html = await res.text();
    expect(res.status).toBe(404);
    expect(html).toContain('no log for night 2026-11-01');
  });

  it('says "nothing ran" for the empty night', async () => {
    const res = await app.request('/digest/2026-10-30');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('nothing ran');
  });

  it('200 for a night with a bad line and says how many were skipped', async () => {
    const res = await app.request('/digest/2026-10-31');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('1 bad line(s) skipped');
    expect(html).toContain('lane/sync');
    expect(html).toContain('notes/backup');
  });
});

describe('GET /api/digest/:night (JSON)', () => {
  it('200 and rows for a night with a file, sorted by job', async () => {
    const res = await app.request('/api/digest/2026-10-29');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { night: string; rows: { job: string }[] };
    expect(body.night).toBe('2026-10-29');
    expect(body.rows.map((r) => r.job)).toEqual(JOBS);
  });

  it('404 with an error body for a night with no file', async () => {
    const res = await app.request('/api/digest/2026-11-01');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no such night', night: '2026-11-01' });
  });

  it('200 with rows: [] for the empty night', async () => {
    const res = await app.request('/api/digest/2026-10-30');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { rows: unknown[]; badLines: number };
    expect(body.rows).toEqual([]);
    expect(body.badLines).toBe(0);
  });

  it('200 with badLines 1 and the valid rows still present', async () => {
    const res = await app.request('/api/digest/2026-10-31');
    expect(res.status).toBe(200);
    const body = (await res.json()) as { badLines: number; rows: { job: string }[] };
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['lane/sync', 'notes/backup']);
  });
});

describe('page and JSON agree', () => {
  it('list the same jobs in the same order for the same night', async () => {
    const html = await (await app.request('/digest/2026-10-29')).text();
    const json = (await (await app.request('/api/digest/2026-10-29')).json()) as {
      rows: { job: string }[];
    };
    expect(jobsInHtml(html)).toEqual(json.rows.map((r) => r.job));
    expect(jobsInHtml(html)).toEqual(JOBS);
  });
});
