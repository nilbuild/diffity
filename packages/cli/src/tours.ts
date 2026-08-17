import { randomUUID } from 'node:crypto';
import { getDb } from './db.js';
import { unescapeMarkdown } from './unescape.js';

export type TourStatus = 'building' | 'ready';
export type TourStepViewMode = 'code' | 'diff';
export type TourStepSide = 'old' | 'new';

export interface TourStep {
  id: string;
  tourId: string;
  sortOrder: number;
  filePath: string;
  startLine: number;
  endLine: number;
  body: string;
  annotation: string;
  viewMode: TourStepViewMode;
  side: TourStepSide;
  createdAt: string;
}

export interface Tour {
  id: string;
  sessionId: string;
  ref: string;
  topic: string;
  body: string;
  status: TourStatus;
  createdAt: string;
  steps: TourStep[];
}

interface TourRow {
  id: string;
  session_id: string;
  topic: string;
  body: string;
  status: string;
  created_at: string;
  session_ref: string;
}

interface TourStepRow {
  id: string;
  tour_id: string;
  sort_order: number;
  file_path: string;
  start_line: number;
  end_line: number;
  body: string;
  annotation: string;
  view_mode: string;
  side: string;
  created_at: string;
}

function rowToTourStep(row: TourStepRow): TourStep {
  return {
    id: row.id,
    tourId: row.tour_id,
    sortOrder: row.sort_order,
    filePath: row.file_path,
    startLine: row.start_line,
    endLine: row.end_line,
    body: row.body,
    annotation: row.annotation,
    viewMode: row.view_mode as TourStepViewMode,
    side: row.side as TourStepSide,
    createdAt: row.created_at,
  };
}

function rowToTour(row: TourRow, steps: TourStep[]): Tour {
  return {
    id: row.id,
    sessionId: row.session_id,
    ref: row.session_ref,
    topic: row.topic,
    body: row.body,
    status: row.status as TourStatus,
    createdAt: row.created_at,
    steps,
  };
}

export function createTour(sessionId: string, topic: string, body: string): Tour {
  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();

  const cleanBody = unescapeMarkdown(body);
  const session = db.prepare('SELECT ref FROM review_sessions WHERE id = ?').get(sessionId) as
    | { ref: string }
    | undefined;
  if (!session) {
    throw new Error(`Unknown review session: ${sessionId}`);
  }

  db.prepare(
    'INSERT INTO tours (id, session_id, topic, body, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, sessionId, topic, cleanBody, now);

  return {
    id,
    sessionId,
    ref: session.ref,
    topic,
    body: cleanBody,
    status: 'building',
    createdAt: now,
    steps: [],
  };
}

export function getTour(id: string): Tour | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT t.*, s.ref AS session_ref
    FROM tours t
    JOIN review_sessions s ON s.id = t.session_id
    WHERE t.id = ?
  `).get(id) as TourRow | undefined;

  if (!row) {
    return null;
  }

  const stepRows = db.prepare(
    'SELECT * FROM tour_steps WHERE tour_id = ? ORDER BY sort_order ASC'
  ).all(id) as TourStepRow[];

  return rowToTour(row, stepRows.map(rowToTourStep));
}

export function getToursForSession(sessionId: string): Tour[] {
  const db = getDb();

  interface JoinedRow extends TourRow {
    s_id: string | null;
    s_sort_order: number | null;
    s_file_path: string | null;
    s_start_line: number | null;
    s_end_line: number | null;
    s_body: string | null;
    s_annotation: string | null;
    s_view_mode: string | null;
    s_side: string | null;
    s_created_at: string | null;
  }

  const rows = db.prepare(`
    SELECT t.*, rs.ref AS session_ref,
           s.id AS s_id, s.sort_order AS s_sort_order, s.file_path AS s_file_path,
           s.start_line AS s_start_line, s.end_line AS s_end_line,
           s.body AS s_body, s.annotation AS s_annotation,
           s.view_mode AS s_view_mode, s.side AS s_side, s.created_at AS s_created_at
    FROM tours t
    JOIN review_sessions rs ON rs.id = t.session_id
    LEFT JOIN tour_steps s ON s.tour_id = t.id
    WHERE t.session_id = ?
    ORDER BY t.created_at ASC, s.sort_order ASC
  `).all(sessionId) as JoinedRow[];

  const tours = new Map<string, Tour>();
  for (const row of rows) {
    let tour = tours.get(row.id);
    if (!tour) {
      tour = rowToTour(row, []);
      tours.set(row.id, tour);
    }
    if (row.s_id) {
      tour.steps.push({
        id: row.s_id,
        tourId: row.id,
        sortOrder: row.s_sort_order!,
        filePath: row.s_file_path!,
        startLine: row.s_start_line!,
        endLine: row.s_end_line!,
        body: row.s_body!,
        annotation: row.s_annotation!,
        viewMode: row.s_view_mode as TourStepViewMode,
        side: row.s_side as TourStepSide,
        createdAt: row.s_created_at!,
      });
    }
  }

  return Array.from(tours.values());
}

export function addTourStep(
  tourId: string,
  filePath: string,
  startLine: number,
  endLine: number,
  body: string,
  annotation: string,
  viewMode: TourStepViewMode = 'code',
  side: TourStepSide = 'new',
): TourStep {
  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();

  const maxRow = db.prepare(
    'SELECT COALESCE(MAX(sort_order), 0) AS max_order FROM tour_steps WHERE tour_id = ?'
  ).get(tourId) as { max_order: number };
  const sortOrder = maxRow.max_order + 1;

  const cleanBody = unescapeMarkdown(body);
  const cleanAnnotation = unescapeMarkdown(annotation);

  db.prepare(
    'INSERT INTO tour_steps (id, tour_id, sort_order, file_path, start_line, end_line, body, annotation, view_mode, side, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, tourId, sortOrder, filePath, startLine, endLine, cleanBody, cleanAnnotation, viewMode, side, now);

  return {
    id,
    tourId,
    sortOrder,
    filePath,
    startLine,
    endLine,
    body: cleanBody,
    annotation: cleanAnnotation,
    viewMode,
    side,
    createdAt: now,
  };
}

export function updateTourStatus(tourId: string, status: TourStatus): void {
  const db = getDb();
  db.prepare('UPDATE tours SET status = ? WHERE id = ?').run(status, tourId);
}
