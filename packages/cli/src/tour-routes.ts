import type { IncomingMessage, ServerResponse } from 'node:http';
import {
  createTour,
  getTour,
  getToursForSession,
  addTourStep,
  updateTourStatus,
  type TourStatus,
} from './tours.js';
import { sendJson, sendError, withJsonBody } from './http-utils.js';

export function handleTourRoute(req: IncomingMessage, res: ServerResponse, pathname: string, url: URL): boolean {
  if (pathname === '/api/tours' && req.method === 'GET') {
    const sid = url.searchParams.get('session');
    if (!sid) {
      sendError(res, 400, 'Missing session parameter');
      return true;
    }
    const tours = getToursForSession(sid);
    sendJson(res, tours);
    return true;
  }

  if (pathname === '/api/tours' && req.method === 'POST') {
    withJsonBody(res, req, 'Failed to create tour', (body) => {
      const { sessionId, topic, body: tourBody } = body;
      if (!sessionId || !topic) {
        sendError(res, 400, 'Missing required fields: sessionId, topic');
        return;
      }
      const tour = createTour(sessionId as string, topic as string, (tourBody as string) || '');
      sendJson(res, tour);
    });
    return true;
  }

  const tourStepsMatch = pathname.match(/^\/api\/tours\/([^/]+)\/steps$/);
  if (tourStepsMatch && req.method === 'POST') {
    withJsonBody(res, req, 'Failed to add tour step', (body) => {
      const { filePath, startLine, endLine, body: stepBody, annotation, viewMode, side } = body;
      if (!filePath || typeof startLine !== 'number' || typeof endLine !== 'number') {
        sendError(res, 400, 'Missing required fields: filePath, startLine, endLine');
        return;
      }
      if (viewMode !== undefined && viewMode !== 'code' && viewMode !== 'diff') {
        sendError(res, 400, 'viewMode must be code or diff');
        return;
      }
      if (side !== undefined && side !== 'old' && side !== 'new') {
        sendError(res, 400, 'side must be old or new');
        return;
      }
      const step = addTourStep(
        tourStepsMatch[1],
        filePath as string,
        startLine,
        endLine,
        (stepBody as string) || '',
        (annotation as string) || '',
        (viewMode as 'code' | 'diff' | undefined) ?? 'code',
        (side as 'old' | 'new' | undefined) ?? 'new',
      );
      sendJson(res, step);
    });
    return true;
  }

  const tourMatch = pathname.match(/^\/api\/tours\/([^/]+)$/);
  if (tourMatch && req.method === 'GET') {
    const tour = getTour(tourMatch[1]);
    if (!tour) {
      sendError(res, 404, 'Tour not found');
      return true;
    }
    sendJson(res, tour);
    return true;
  }

  if (tourMatch && req.method === 'PATCH') {
    withJsonBody(res, req, 'Failed to update tour', (body) => {
      const { status } = body;
      if (!status) {
        sendError(res, 400, 'Missing status');
        return;
      }
      updateTourStatus(tourMatch![1], status as TourStatus);
      sendJson(res, { ok: true });
    });
    return true;
  }

  return false;
}
