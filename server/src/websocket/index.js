import { WebSocketServer } from 'ws';
import env from '../config/env.js';
import logger from '../config/logger.js';
import { verifyAccessToken } from '../services/authService.js';
import { executeInSession, getSessionOr404, getLab, getSessionOverview } from '../services/labService.js';

/**
 * Single WebSocket endpoint (/ws) used for:
 *  - real-time lab terminal I/O (interactive sessions)
 *  - instant in-app notifications
 *
 * Authentication reuses the JWT access token (httpOnly cookie
 * "cyberita_at" sent automatically by the browser, or ?token= for
 * programmatic clients).
 */

/** userId -> Set<socket> */
const clientsByUser = new Map();
/** sessionId -> Set<socket> */
const labRooms = new Map();

function parseCookies(header = '') {
  const cookies = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    cookies[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return cookies;
}

function authenticateSocket(req) {
  try {
    const cookies = parseCookies(req.headers.cookie || '');
    const url = new URL(req.url, 'http://localhost');
    const token = cookies.cyberita_at || url.searchParams.get('token') || '';
    if (!token) return null;
    const payload = verifyAccessToken(token);
    return { id: String(payload.sub), role: payload.role, name: payload.name, email: payload.email };
  } catch {
    return null;
  }
}

function addClient(userId, socket) {
  if (!clientsByUser.has(userId)) clientsByUser.set(userId, new Set());
  clientsByUser.get(userId).add(socket);
}

function removeClient(socket) {
  if (socket.userId && clientsByUser.has(socket.userId)) {
    clientsByUser.get(socket.userId).delete(socket);
    if (clientsByUser.get(socket.userId).size === 0) clientsByUser.delete(socket.userId);
  }
  if (socket.labSessions) {
    for (const sessionId of socket.labSessions) {
      const room = labRooms.get(sessionId);
      if (room) {
        room.delete(socket);
        if (room.size === 0) labRooms.delete(sessionId);
      }
    }
  }
}

function joinRoom(sessionId, socket) {
  if (!labRooms.has(sessionId)) labRooms.set(sessionId, new Set());
  labRooms.get(sessionId).add(socket);
  socket.labSessions.add(sessionId);
}

function send(socket, payload) {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(payload));
}

function broadcastRoom(sessionId, payload, except = null) {
  const room = labRooms.get(sessionId);
  if (!room) return;
  for (const socket of room) {
    if (socket === except) continue;
    send(socket, payload);
  }
}

/** Pushes notifications to every open socket of the given users. */
export function emitNotifications(userIds, payload) {
  const message = JSON.stringify({ type: 'notification', data: payload });
  for (const userId of userIds) {
    const sockets = clientsByUser.get(userId);
    if (!sockets) continue;
    for (const socket of sockets) {
      if (socket.readyState === socket.OPEN) socket.send(message);
    }
  }
}

export function connectedUserCount() {
  return clientsByUser.size;
}

async function handleLabAttach(socket, message) {
  const sessionId = Number(message.sessionId);
  if (!Number.isInteger(sessionId)) return send(socket, { type: 'error', message: 'Invalid session id.' });
  try {
    const session = await getSessionOr404(sessionId, socket.user);
    if (session.user_id !== socket.user.id) {
      return send(socket, { type: 'error', message: 'Only the session owner can use its terminal.' });
    }
    const lab = await getLab(session.lab_id, { staff: true });
    const overview = await getSessionOverview(session, { includeAnswers: false });
    joinRoom(sessionId, socket);
    send(socket, {
      type: 'lab.attached',
      sessionId,
      cwd: session.cwd,
      history: session.history,
      status: session.status,
      welcome: lab.terminal_welcome,
      steps: overview.steps.map((s) => ({
        id: s.id, title: s.title, completed: s.completed, verification: s.verification,
      })),
      progress: overview.progress,
      report: overview.report,
      student: overview.student,
    });
  } catch (error) {
    send(socket, { type: 'error', message: error.message });
  }
}

async function handleLabExec(socket, message) {
  const sessionId = Number(message.sessionId);
  const command = String(message.command || '');
  if (!command.trim()) return;
  try {
    const session = await getSessionOr404(sessionId, socket.user);
    if (session.user_id !== socket.user.id) {
      return send(socket, { type: 'error', message: 'Only the session owner can use its terminal.' });
    }
    const lab = await getLab(session.lab_id, { staff: true });
    const result = await executeInSession(session, lab, command);
    send(socket, {
      type: 'lab.output',
      requestId: message.requestId ?? null,
      sessionId,
      output: result.output,
      exitCode: result.exitCode,
      cwd: result.cwd,
      clear: result.clear,
    });
    if (result.completedSteps.length > 0 || result.completion) {
      const overview = await getSessionOverview(result.session, { includeAnswers: false });
      broadcastRoom(sessionId, {
        type: 'lab.progress',
        sessionId,
        completedSteps: result.completedSteps,
        completion: result.completion ?? null,
        progress: overview.progress,
        report: overview.report,
      });
    }
  } catch (error) {
    send(socket, { type: 'error', message: error.message, requestId: message.requestId ?? null, sessionId });
  }
}

export function initWebSocket(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: '/ws', maxPayload: 64 * 1024 });

  wss.on('connection', (socket, req) => {
    const user = authenticateSocket(req);
    if (!user) {
      send(socket, { type: 'auth.error', message: 'Authentication required.' });
      socket.close(4001, 'unauthorized');
      return;
    }
    socket.user = user;
    socket.userId = user.id;
    socket.labSessions = new Set();
    addClient(user.id, socket);
    send(socket, { type: 'ready', user: { id: user.id, name: user.name, role: user.role } });

    socket.on('message', async (raw) => {
      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        return send(socket, { type: 'error', message: 'Malformed message.' });
      }
      try {
        switch (message.type) {
          case 'lab.attach':
            await handleLabAttach(socket, message);
            break;
          case 'lab.exec':
            await handleLabExec(socket, message);
            break;
          case 'ping':
            send(socket, { type: 'pong', at: Date.now() });
            break;
          default:
            send(socket, { type: 'error', message: `Unknown message type "${message.type}".` });
        }
      } catch (error) {
        logger.warn('WebSocket message failed', { type: message?.type, error: error.message });
        send(socket, { type: 'error', message: error.message });
      }
    });

    socket.on('close', () => removeClient(socket));
    socket.on('error', (error) => logger.warn('WebSocket error', { error: error.message }));
  });

  logger.info('WebSocket endpoint ready at /ws', { env: env.nodeEnv });
  return wss;
}

export default initWebSocket;
