// Plan morning-digest § 1. The contract every part of § 2 (page, JSON, board link, route
// tests) builds against. The reader lives in ./read.ts.

// One line of runs/<night>.jsonl: `at`, `job`, `status`, `owner`, optional `error`.
export type RunStatus = 'ok' | 'retry' | 'fail';

// One row per job in the night.
export type DigestRow = {
  job: string;
  // Owner of the job's last line. Kept as null in data; views render it as `—`.
  owner: string | null;
  // Lines for this job (every status counts as a run).
  runs: number;
  // Lines for this job with status `retry`.
  retries: number;
  // Status of the job's last line, in file order.
  lastStatus: RunStatus;
  // The most recent `error` seen for this job, even if a later line succeeded; null if none.
  lastError: string | null;
  // `at` of the job's first and last line, in file order, exactly as written in the log
  // (offset kept, never converted to UTC).
  firstAt: string;
  lastAt: string;
};

// Line counts per status over the whole night (good lines only). Shown on the status board.
export type StatusCounts = Record<RunStatus, number>;

export type Night = {
  // YYYY-MM-DD, as asked for.
  night: string;
  // Sorted by job (plain string order). Empty for an empty file: "nothing ran".
  rows: DigestRow[];
  counts: StatusCounts;
  // Lines that are not valid JSON or not a valid run line. Counted, never thrown.
  // Blank lines are ignored, not counted.
  badLines: number;
};

// Returns null when there is no runs/<night>.jsonl (or `night` is not YYYY-MM-DD): the page
// answers 404. An empty file returns a Night with zero rows. Reads only; never writes runsDir.
export type ReadNight = (runsDir: string, night: string) => Night | null;
