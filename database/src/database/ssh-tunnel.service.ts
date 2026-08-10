import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { Client } from 'ssh2';
import * as net from 'net';
import * as crypto from 'crypto';

export interface SshTunnelConfig {
  sshHost: string;
  sshPort: number;
  sshUsername: string;
  sshAuthMethod: 'password' | 'privateKey';
  sshPassword?: string;
  sshPrivateKey?: string;
  // Target database that we're tunneling to
  targetHost: string;
  targetPort: number;
  // TOFU host key verification: stored fingerprint from first successful connect
  sshHostKeyFingerprint?: string;
}

export interface TunnelInfo {
  localHost: string; // always '127.0.0.1'
  localPort: number; // dynamically assigned
  tunnel: Client; // ssh2 Client instance
  hostKeyFingerprint: string; // SHA-256 fingerprint of the server's host key
}

interface TunnelEntry {
  client: Client;
  server: net.Server;
  localPort: number;
  activeConnections: number;
  hostKeyFingerprint: string;
  refCount: number;
}

/** Callback invoked when a tunnel drops unexpectedly. */
export type TunnelDropCallback = (tunnelKey: string) => void;

@Injectable()
export class SshTunnelService implements OnModuleDestroy {
  private readonly tunnels = new Map<string, TunnelEntry>();
  private readonly pendingTunnels = new Map<string, Promise<TunnelInfo>>();
  private onTunnelDrop: TunnelDropCallback | null = null;

  private static readonly SSH_CONNECT_TIMEOUT_MS = 10_000;
  private static readonly LOCAL_HOST = '127.0.0.1';

  constructor(
    @InjectPinoLogger(SshTunnelService.name)
    private readonly logger: PinoLogger,
  ) {}

  /**
   * Register a callback to be invoked when a tunnel drops unexpectedly.
   * Used by DynamicConnectionService to invalidate pools.
   */
  setTunnelDropCallback(callback: TunnelDropCallback): void {
    this.onTunnelDrop = callback;
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.info('Shutting down all SSH tunnels');
    const keys = Array.from(this.tunnels.keys());
    await Promise.allSettled(keys.map((key) => this.closeTunnel(key)));
  }

  /**
   * Build the map key for a given tunnel config.
   */
  private buildKey(config: SshTunnelConfig): string {
    return `${config.sshHost}:${config.sshPort}:${config.sshUsername}:${config.targetHost}:${config.targetPort}`;
  }

  /**
   * Returns an existing tunnel if connected, or creates a new one.
   * Handles concurrent requests for the same tunnel by deduplicating in-flight creations.
   */
  async getOrCreateTunnel(config: SshTunnelConfig): Promise<TunnelInfo> {
    const key = this.buildKey(config);

    // Check for an existing, healthy tunnel
    const existing = this.tunnels.get(key);
    if (existing) {
      existing.refCount++;
      this.logger.debug({ key, refCount: existing.refCount }, 'Reusing existing SSH tunnel');
      return {
        localHost: SshTunnelService.LOCAL_HOST,
        localPort: existing.localPort,
        tunnel: existing.client,
        hostKeyFingerprint: existing.hostKeyFingerprint,
      };
    }

    // Deduplicate concurrent creation requests for the same tunnel
    const pending = this.pendingTunnels.get(key);
    if (pending) {
      this.logger.debug({ key }, 'Waiting for in-flight tunnel creation');
      return pending;
    }

    const promise = this.createTunnel(key, config);
    this.pendingTunnels.set(key, promise);

    try {
      const result = await promise;
      return result;
    } finally {
      this.pendingTunnels.delete(key);
    }
  }

  /**
   * Release a reference to a tunnel. Only closes when refCount reaches 0.
   * Used by DynamicConnectionService when a pool using this tunnel is evicted.
   */
  async releaseTunnel(key: string): Promise<void> {
    const entry = this.tunnels.get(key);
    if (!entry) {
      return;
    }

    entry.refCount--;
    this.logger.debug({ key, refCount: entry.refCount }, 'Released tunnel reference');

    if (entry.refCount <= 0) {
      await this.closeTunnel(key);
    }
  }

  /**
   * Force-close a specific tunnel by key. Cleans up the SSH client, local server,
   * and removes from the map regardless of refCount.
   */
  async closeTunnel(key: string): Promise<void> {
    const entry = this.tunnels.get(key);
    if (!entry) {
      return;
    }

    this.tunnels.delete(key);
    this.logger.info({ key }, 'Closing SSH tunnel');

    // Close the local TCP server (stops accepting new connections)
    await new Promise<void>((resolve) => {
      entry.server.close(() => resolve());
    });

    // Destroy the SSH client
    entry.client.end();
    entry.client.destroy();
  }

  /**
   * Create a new SSH tunnel: establishes SSH connection, starts local TCP server,
   * and pipes connections through SSH forwardOut.
   */
  private async createTunnel(key: string, config: SshTunnelConfig): Promise<TunnelInfo> {
    const client = new Client();

    // Establish SSH connection (returns host key fingerprint)
    const hostKeyFingerprint = await this.connectSsh(client, config);
    this.logger.info(
      { key, sshHost: config.sshHost, sshPort: config.sshPort },
      'SSH connection established',
    );

    // Create local TCP server that forwards through SSH
    const server = await this.createLocalForwardServer(key, client, config);
    const address = server.address() as net.AddressInfo;
    const localPort = address.port;

    const entry: TunnelEntry = {
      client,
      server,
      localPort,
      activeConnections: 0,
      hostKeyFingerprint,
      refCount: 1,
    };
    this.tunnels.set(key, entry);

    // Handle SSH client lifecycle events
    this.attachClientListeners(key, client, server);

    this.logger.info(
      { key, localPort, targetHost: config.targetHost, targetPort: config.targetPort },
      'SSH tunnel created',
    );

    return {
      localHost: SshTunnelService.LOCAL_HOST,
      localPort,
      tunnel: client,
      hostKeyFingerprint,
    };
  }

  /**
   * Promise wrapper around ssh2 Client.connect().
   * Rejects on authentication failure, timeout, or connection error.
   * Returns the SHA-256 fingerprint of the server's host key (for TOFU verification).
   */
  private connectSsh(client: Client, config: SshTunnelConfig): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      let hostKeyFingerprint = '';

      const timeout = setTimeout(() => {
        client.end();
        client.destroy();
        reject(
          new Error(
            `SSH connection to ${config.sshHost}:${config.sshPort} timed out after ${SshTunnelService.SSH_CONNECT_TIMEOUT_MS}ms`,
          ),
        );
      }, SshTunnelService.SSH_CONNECT_TIMEOUT_MS);

      client.once('ready', () => {
        clearTimeout(timeout);
        resolve(hostKeyFingerprint);
      });

      client.once('error', (err: Error) => {
        clearTimeout(timeout);
        const message = this.describeAuthError(err, config);
        reject(new Error(message));
      });

      const connectConfig: any = {
        host: config.sshHost,
        port: config.sshPort,
        username: config.sshUsername,
        readyTimeout: SshTunnelService.SSH_CONNECT_TIMEOUT_MS,
        keepaliveInterval: 30_000,
        keepaliveCountMax: 3,
        // TOFU host key verification
        hostVerifier: (key: Buffer) => {
          hostKeyFingerprint = crypto
            .createHash('sha256')
            .update(key)
            .digest('base64');

          // If we have a stored fingerprint, verify it matches
          if (config.sshHostKeyFingerprint) {
            if (config.sshHostKeyFingerprint !== hostKeyFingerprint) {
              this.logger.error(
                {
                  sshHost: config.sshHost,
                  sshPort: config.sshPort,
                  expected: config.sshHostKeyFingerprint,
                  received: hostKeyFingerprint,
                },
                'SSH HOST KEY MISMATCH — possible MITM attack. Connection rejected.',
              );
              return false; // Reject connection
            }
            this.logger.debug(
              { sshHost: config.sshHost },
              'SSH host key verified successfully',
            );
          } else {
            // First connection (TOFU) — trust and log the fingerprint
            this.logger.info(
              {
                sshHost: config.sshHost,
                sshPort: config.sshPort,
                fingerprint: hostKeyFingerprint,
              },
              'SSH host key accepted on first use (TOFU). Fingerprint will be stored.',
            );
          }
          return true; // Accept connection
        },
      };

      if (config.sshAuthMethod === 'password') {
        if (!config.sshPassword) {
          clearTimeout(timeout);
          reject(new Error('SSH auth method is "password" but no password was provided'));
          return;
        }
        connectConfig.password = config.sshPassword;
      } else if (config.sshAuthMethod === 'privateKey') {
        if (!config.sshPrivateKey) {
          clearTimeout(timeout);
          reject(new Error('SSH auth method is "privateKey" but no private key was provided'));
          return;
        }
        connectConfig.privateKey = config.sshPrivateKey;
      }

      client.connect(connectConfig);
    });
  }

  /**
   * Create a local net.Server on 127.0.0.1:0 that forwards each incoming
   * TCP connection through the SSH tunnel via forwardOut.
   */
  private createLocalForwardServer(
    key: string,
    client: Client,
    config: SshTunnelConfig,
  ): Promise<net.Server> {
    return new Promise<net.Server>((resolve, reject) => {
      const server = net.createServer((socket) => {
        this.handleIncomingConnection(key, client, config, socket);
      });

      server.on('error', (err) => {
        this.logger.error({ err, key }, 'Local forward server error');
        reject(err);
      });

      server.listen(0, SshTunnelService.LOCAL_HOST, () => {
        resolve(server);
      });
    });
  }

  /**
   * Handle an incoming local TCP connection by opening a forwarded channel
   * through the SSH tunnel and piping data bidirectionally.
   */
  private handleIncomingConnection(
    key: string,
    client: Client,
    config: SshTunnelConfig,
    socket: net.Socket,
  ): void {
    const entry = this.tunnels.get(key);
    if (entry) {
      entry.activeConnections++;
    }

    const srcIP = socket.remoteAddress || SshTunnelService.LOCAL_HOST;
    const srcPort = socket.remotePort || 0;

    client.forwardOut(
      srcIP,
      srcPort,
      config.targetHost,
      config.targetPort,
      (err, stream) => {
        if (err) {
          this.logger.error(
            { err, key, targetHost: config.targetHost, targetPort: config.targetPort },
            'SSH forwardOut failed',
          );
          socket.destroy();
          this.decrementConnections(key);
          return;
        }

        // Pipe data bidirectionally
        socket.pipe(stream);
        stream.pipe(socket);

        // Clean up on close from either side (guard against double-decrement)
        let decremented = false;
        const onClose = () => {
          if (decremented) return;
          decremented = true;
          this.decrementConnections(key);
        };

        socket.on('close', () => {
          stream.destroy();
          onClose();
        });

        stream.on('close', () => {
          socket.destroy();
          onClose();
        });

        socket.on('error', (socketErr) => {
          this.logger.warn({ err: socketErr, key }, 'Local socket error');
          stream.destroy();
        });

        stream.on('error', (streamErr) => {
          this.logger.warn({ err: streamErr, key }, 'SSH stream error');
          socket.destroy();
        });
      },
    );
  }

  /**
   * Decrement the active connection counter for a tunnel entry.
   */
  private decrementConnections(key: string): void {
    const entry = this.tunnels.get(key);
    if (entry && entry.activeConnections > 0) {
      entry.activeConnections--;
    }
  }

  /**
   * Attach error/end/close listeners to the SSH client to handle tunnel drops.
   */
  private attachClientListeners(key: string, client: Client, server: net.Server): void {
    client.on('error', (err) => {
      this.logger.error({ err, key }, 'SSH client error, closing tunnel');
      this.cleanupOnDrop(key, server, client);
    });

    client.on('end', () => {
      this.logger.warn({ key }, 'SSH client ended unexpectedly');
      this.cleanupOnDrop(key, server, client);
    });

    client.on('close', () => {
      this.logger.warn({ key }, 'SSH client closed');
      this.cleanupOnDrop(key, server, client);
    });
  }

  /**
   * Clean up when a tunnel drops unexpectedly: close local server, remove from map,
   * and notify listeners so they can invalidate their pools.
   */
  private cleanupOnDrop(key: string, server: net.Server, client: Client): void {
    if (!this.tunnels.has(key)) {
      return; // Already cleaned up
    }
    this.tunnels.delete(key);
    server.close(() => {
      this.logger.debug({ key }, 'Local forward server closed after tunnel drop');
    });
    client.destroy();

    // Notify DynamicConnectionService to invalidate pools using this tunnel
    if (this.onTunnelDrop) {
      this.onTunnelDrop(key);
    }
  }

  /**
   * Produce a descriptive error message for SSH authentication failures.
   */
  private describeAuthError(err: Error, config: SshTunnelConfig): string {
    const base = `SSH connection to ${config.sshHost}:${config.sshPort} failed`;
    const msg = err.message || '';

    if (msg.includes('All configured authentication methods failed')) {
      return `${base}: authentication failed for user "${config.sshUsername}" using ${config.sshAuthMethod}. Please verify your credentials.`;
    }

    if (msg.includes('ECONNREFUSED')) {
      return `${base}: connection refused. Ensure the SSH server is running on ${config.sshHost}:${config.sshPort}.`;
    }

    if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo')) {
      return `${base}: host not found. Check that "${config.sshHost}" is a valid hostname.`;
    }

    if (msg.includes('ETIMEDOUT')) {
      return `${base}: connection timed out. The host may be unreachable or a firewall is blocking the connection.`;
    }

    return `${base}: ${msg}`;
  }
}
