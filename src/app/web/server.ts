import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

import type { Express } from 'express';

import type { WebConfig } from './web-config.ts';

export interface WebServer {
  readonly server: Server;
  readonly host: string;
  readonly port: number;
  close(): Promise<void>;
}

export function startWebServer(
  app: Express,
  config: Pick<WebConfig, 'host' | 'port'>,
): Promise<WebServer> {
  return new Promise((resolve, reject) => {
    const server = app.listen(config.port, config.host);
    const onError = (error: Error) => reject(error);
    server.once('error', onError);
    server.once('listening', () => {
      server.off('error', onError);
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close();
        reject(new Error('Web listener did not report a TCP address'));
        return;
      }
      resolve(createLifecycle(server, address, config.host));
    });
  });
}

function createLifecycle(
  server: Server,
  address: AddressInfo,
  configuredHost: string,
): WebServer {
  let closePromise: Promise<void> | undefined;
  return {
    server,
    host: configuredHost,
    port: address.port,
    close() {
      closePromise ??= new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      return closePromise;
    },
  };
}
