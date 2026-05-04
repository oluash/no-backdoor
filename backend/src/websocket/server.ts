/**
 * No-Backdoor System Architecture — WebSocket Server
 *
 * Creates a WebSocket.Server attached to the HTTP server with:
 *   - JWT authentication on connection upgrade
 *   - Room-based subscriptions (clients join rooms per task ID)
 *   - Broadcast methods: broadcastToRoom, broadcastToAll
 *   - Heartbeat/ping-pong to keep connections alive
 *   - Clean up on disconnect
 */

import type { Server as HTTPServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { WS_PATH, WS_HEARTBEAT_INTERVAL, WS_PING_TIMEOUT } from '@/config';
import { verifyAccessToken } from '@/middleware/auth';
import { logger } from '@/middleware/logger';

// =============================================================================
// Types
// =============================================================================

/** Extended WebSocket with metadata for our system */
interface ClientSocket extends WebSocket {
  /** Unique client ID */
  clientId: string;
  /** Authenticated user ID (null if anonymous) */
  userId: string | null;
  /** Set of room IDs this client has joined */
  rooms: Set<string>;
  /** Whether the client has responded to the latest ping */
  isAlive: boolean;
  /** When the socket was connected */
  connectedAt: Date;
}

/** WebSocket event message structure */
interface WSMessage<T = unknown> {
  event: string;
  data: T;
}

// =============================================================================
// Server State
// =============================================================================

let wss: WebSocketServer | null = null;
const clients = new Map<string, ClientSocket>();
const rooms = new Map<string, Set<string>>(); // roomId → Set<clientId>

/** Get connected client count */
export function getClientCount(): number {
  return clients.size;
}

/** Get room subscriber count */
export function getRoomCount(roomId: string): number {
  return rooms.get(roomId)?.size ?? 0;
}

// =============================================================================
// Server Creation
// =============================================================================

/**
 * Create and attach a WebSocket server to the HTTP server.
 *
 * @param httpServer  The HTTP server instance from Express
 * @returns           The WebSocketServer instance
 */
export function createWebSocketServer(httpServer: HTTPServer): WebSocketServer {
  wss = new WebSocketServer({
    server: httpServer,
    path: WS_PATH,
    // We handle auth in the 'connection' event after verification
    verifyClient: () => true,
  });

  logger.info('WebSocket server created', { path: WS_PATH });

  // Handle new connections
  wss.on('connection', (socket: WebSocket, request) => {
    handleConnection(socket as ClientSocket, request);
  });

  wss.on('error', (err) => {
    logger.error('WebSocket server error', { error: err.message });
  });

  // Start heartbeat interval
  startHeartbeat();

  return wss;
}

// =============================================================================
// Connection Handling
// =============================================================================

/**
 * Handle a new WebSocket connection with authentication.
 */
function handleConnection(socket: ClientSocket, request: import('http').IncomingMessage): void {
  // Initialize socket metadata
  socket.clientId = uuidv4();
  socket.userId = null;
  socket.rooms = new Set();
  socket.isAlive = true;
  socket.connectedAt = new Date();

  // Try to authenticate from query param: ?token=xxx
  const url = new URL(request.url || '/', `http://${request.headers.host}`);
  const token = url.searchParams.get('token');

  if (token) {
    try {
      const payload = verifyAccessToken(token);
      socket.userId = payload.sub;
      logger.debug('WebSocket client authenticated', {
        clientId: socket.clientId,
        userId: socket.userId,
      });
    } catch {
      logger.warn('WebSocket client authentication failed', {
        clientId: socket.clientId,
      });
      // Allow anonymous connections (they can still listen to public rooms)
    }
  }

  // Register client
  clients.set(socket.clientId, socket);

  logger.info('WebSocket client connected', {
    clientId: socket.clientId,
    userId: socket.userId,
    totalClients: clients.size,
  });

  // Send welcome message
  sendToSocket(socket, 'connected', {
    clientId: socket.clientId,
    authenticated: socket.userId !== null,
  });

  // --- Event handlers ---

  // Pong response — client is alive
  socket.on('pong', () => {
    socket.isAlive = true;
  });

  // Handle incoming messages
  socket.on('message', (rawData) => {
    try {
      const message = JSON.parse(rawData.toString()) as WSMessage;
      handleMessage(socket, message);
    } catch {
      sendToSocket(socket, 'error', {
        message: 'Invalid JSON message',
      });
    }
  });

  // Handle close
  socket.on('close', (code, reason) => {
    handleDisconnect(socket, code, reason);
  });

  // Handle errors
  socket.on('error', (err) => {
    logger.error('WebSocket client error', {
      clientId: socket.clientId,
      error: err.message,
    });
  });
}

/**
 * Handle incoming messages from clients.
 */
function handleMessage(socket: ClientSocket, message: WSMessage): void {
  logger.debug('WebSocket message received', {
    clientId: socket.clientId,
    event: message.event,
  });

  switch (message.event) {
    case 'subscribe': {
      // Subscribe to a room: { event: 'subscribe', data: { room: 'task_abc123' } }
      const roomId = (message.data as any)?.room;
      if (roomId && typeof roomId === 'string') {
        subscribeToRoom(socket, roomId);
      }
      break;
    }

    case 'unsubscribe': {
      // Unsubscribe from a room: { event: 'unsubscribe', data: { room: 'task_abc123' } }
      const roomId = (message.data as any)?.room;
      if (roomId && typeof roomId === 'string') {
        unsubscribeFromRoom(socket, roomId);
      }
      break;
    }

    case 'ping': {
      // Client ping — respond with pong
      sendToSocket(socket, 'pong', { timestamp: Date.now() });
      break;
    }

    default:
      sendToSocket(socket, 'error', {
        message: `Unknown event: ${message.event}`,
      });
  }
}

/**
 * Handle client disconnection — clean up rooms and registry.
 */
function handleDisconnect(
  socket: ClientSocket,
  code: number,
  reason: Buffer
): void {
  logger.info('WebSocket client disconnected', {
    clientId: socket.clientId,
    code,
    reason: reason.toString(),
    durationMs: Date.now() - socket.connectedAt.getTime(),
  });

  // Remove from all rooms
  for (const roomId of socket.rooms) {
    const roomClients = rooms.get(roomId);
    if (roomClients) {
      roomClients.delete(socket.clientId);
      if (roomClients.size === 0) {
        rooms.delete(roomId);
      }
    }
  }

  // Remove from clients map
  clients.delete(socket.clientId);
}

// =============================================================================
// Room Management
// =============================================================================

/**
 * Subscribe a socket to a room.
 */
function subscribeToRoom(socket: ClientSocket, roomId: string): void {
  if (socket.rooms.has(roomId)) {
    sendToSocket(socket, 'subscribed', { room: roomId, alreadySubscribed: true });
    return;
  }

  socket.rooms.add(roomId);

  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Set());
  }
  rooms.get(roomId)!.add(socket.clientId);

  sendToSocket(socket, 'subscribed', { room: roomId, subscriberCount: rooms.get(roomId)?.size });

  logger.debug('Client subscribed to room', {
    clientId: socket.clientId,
    roomId,
    roomSize: rooms.get(roomId)?.size,
  });
}

/**
 * Unsubscribe a socket from a room.
 */
function unsubscribeFromRoom(socket: ClientSocket, roomId: string): void {
  socket.rooms.delete(roomId);

  const roomClients = rooms.get(roomId);
  if (roomClients) {
    roomClients.delete(socket.clientId);
    if (roomClients.size === 0) {
      rooms.delete(roomId);
    }
  }

  sendToSocket(socket, 'unsubscribed', { room: roomId });

  logger.debug('Client unsubscribed from room', {
    clientId: socket.clientId,
    roomId,
  });
}

// =============================================================================
// Broadcast Methods
// =============================================================================

/**
 * Send a message to a specific socket.
 */
function sendToSocket<T>(socket: ClientSocket, event: string, data: T): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ event, data }));
  }
}

/**
 * Send a message to a specific client by ID.
 */
export function sendToClient<T>(clientId: string, event: string, data: T): boolean {
  const socket = clients.get(clientId);
  if (socket && socket.readyState === WebSocket.OPEN) {
    sendToSocket(socket, event, data);
    return true;
  }
  return false;
}

/**
 * Broadcast a message to all clients in a room.
 *
 * @param roomId  Room identifier (e.g., 'task_abc123', 'system_sys1')
 * @param event   Event name
 * @param data    Payload data
 * @returns       Number of clients the message was sent to
 */
export function broadcastToRoom<T>(roomId: string, event: string, data: T): number {
  const roomClients = rooms.get(roomId);
  if (!roomClients || roomClients.size === 0) {
    return 0;
  }

  const message = JSON.stringify({ event, data });
  let sent = 0;

  for (const clientId of roomClients) {
    const socket = clients.get(clientId);
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(message);
      sent++;
    }
  }

  logger.debug('Broadcast to room', { roomId, event, recipients: sent });
  return sent;
}

/**
 * Broadcast a message to all connected clients.
 *
 * @param event  Event name
 * @param data   Payload data
 * @returns      Number of clients the message was sent to
 */
export function broadcastToAll<T>(event: string, data: T): number {
  const message = JSON.stringify({ event, data });
  let sent = 0;

  for (const [, socket] of clients) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(message);
      sent++;
    }
  }

  logger.debug('Broadcast to all', { event, recipients: sent });
  return sent;
}

// =============================================================================
// Heartbeat / Ping-Pong
// =============================================================================

let heartbeatInterval: NodeJS.Timeout | null = null;

/**
 * Start the heartbeat interval that pings all clients
 * and terminates unresponsive connections.
 */
function startHeartbeat(): void {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
  }

  heartbeatInterval = setInterval(() => {
    for (const [clientId, socket] of clients) {
      if (!socket.isAlive) {
        // Client didn't respond to previous ping — terminate
        logger.debug('WebSocket client timed out', { clientId });
        socket.terminate();
        clients.delete(clientId);
        continue;
      }

      // Mark as not alive until pong is received
      socket.isAlive = false;
      socket.ping();
    }
  }, WS_HEARTBEAT_INTERVAL);

  // Ensure interval doesn't keep process alive (for tests)
  heartbeatInterval.unref?.();
}

// =============================================================================
// Graceful Shutdown
// =============================================================================

/**
 * Close all WebSocket connections and stop the server.
 * Call during graceful shutdown.
 */
export async function closeWebSocketServer(): Promise<void> {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }

  if (wss) {
    logger.info('Closing WebSocket server...');

    // Close all client connections gracefully
    for (const [, socket] of clients) {
      if (socket.readyState === WebSocket.OPEN) {
        socket.close(1001, 'Server shutting down');
      }
    }

    // Wait briefly for close frames to be sent
    await new Promise((resolve) => setTimeout(resolve, 500));

    wss.close();
    clients.clear();
    rooms.clear();
    wss = null;

    logger.info('WebSocket server closed');
  }
}
