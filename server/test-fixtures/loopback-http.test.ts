import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import express from 'express';
import type { Socket } from 'node:net';
import { describe, expect, it } from 'vitest';
import request, { closeOwnedHttpFixtures, listenOnLoopback } from './loopback-http.js';

describe('loopback HTTP fixture', () => {
  it('rejects an occupied-port bind and releases the failed listener', async () => {
    const occupied = await listenOnLoopback(createServer());
    const failed = createServer();
    try {
      await expect(listenOnLoopback(failed, (occupied.address() as AddressInfo).port))
        .rejects.toMatchObject({ code: 'EADDRINUSE' });
      expect(failed.listening).toBe(false);
      expect(failed.listenerCount('error')).toBe(0);
    } finally {
      await new Promise<void>((resolve, reject) => occupied.close(error => error ? reject(error) : resolve()));
    }
  });

  it('serves an ordinary fluent request on IPv4 loopback', async () => {
    const app = express();
    app.get('/fixture', (incoming, response) => {
      response.json({ address: incoming.socket.localAddress });
    });
    const response = await (await request(app)).get('/fixture').expect(200);
    expect(response.body).toEqual({ address: '127.0.0.1' });
  });

  it('closes an owned listener and active connection after cancellation', async () => {
    const app = express();
    let accepted!: Socket;
    let accept!: () => void;
    const connected = new Promise<void>((resolve) => { accept = resolve; });
    app.get('/pending', (incoming, response) => {
      accepted = incoming.socket;
      response.write('started');
      accept();
    });
    const pending = (await request(app)).get('/pending');
    pending.end(() => {});
    await connected;
    pending.abort();
    await closeOwnedHttpFixtures();
    expect(accepted.destroyed).toBe(true);
  });
});
