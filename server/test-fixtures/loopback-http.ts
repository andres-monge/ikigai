import { createServer, type RequestListener, type Server } from 'node:http';
import type { Socket } from 'node:net';
import rawRequest from 'supertest';
import { afterEach } from 'vitest';

const ownedServers = new Map<Server, Set<Socket>>();

/** Close only listeners and connections created by this test fixture. */
export async function closeOwnedHttpFixtures() {
  const fixtures = [...ownedServers];
  ownedServers.clear();
  await Promise.all(fixtures.map(([server, sockets]) => new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    for (const socket of sockets) socket.destroy();
  })));
}

afterEach(closeOwnedHttpFixtures);

/** Bind a caller-owned server, rejecting and cleaning up failed binds. */
export async function listenOnLoopback(server: Server, port = 0) {
  await new Promise<void>((resolve, reject) => {
    const failed = (error: Error) => {
      server.close(() => reject(error));
    };
    server.once('error', failed);
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', failed);
      resolve();
    });
  });
  return server;
}

/** Await IPv4 loopback binding before Supertest reads the server address. */
export default async function request(app: RequestListener) {
  const server = createServer(app);
  const sockets = new Set<Socket>();
  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
  });
  await listenOnLoopback(server);
  ownedServers.set(server, sockets);
  return rawRequest(server);
}
