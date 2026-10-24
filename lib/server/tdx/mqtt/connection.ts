import mqtt, { type MqttClient, type IClientOptions } from "mqtt";
import type {
  TdxMqttConnectionStatus,
  TdxMqttDiagnostics,
  TdxMqttManagerOptions,
} from "./types.ts";
import {
  tdxStreamCircuitBreaker,
  type TdxStreamCircuitBreaker,
  type StreamActiveEngine,
} from "./circuitBreaker.ts";

export const DEFAULT_TDX_MQTT_BROKER = "mqtts://mqtt.transportdata.tw:8883";
export const DEFAULT_BASE_BACKOFF_MS = 1_000;
export const DEFAULT_MAX_BACKOFF_MS = 5_000;

export interface MqttClientFactory {
  (brokerUrl: string, opts: IClientOptions): MqttClient;
}

export interface TdxMqttManager {
  connect(): Promise<MqttClient | null>;
  disconnect(): Promise<void>;
  subscribe(topics: string | string[], qos?: 0 | 1 | 2): Promise<boolean>;
  getDiagnostics(): TdxMqttDiagnostics;
  getClient(): MqttClient | null;
  getActiveEngine(): StreamActiveEngine;
  getCircuitBreaker(): TdxStreamCircuitBreaker;
}

export function calculateBackoffMs(
  attempt: number,
  baseMs: number = DEFAULT_BASE_BACKOFF_MS,
  maxMs: number = DEFAULT_MAX_BACKOFF_MS,
): number {
  if (attempt <= 0) return baseMs;
  const backoff = baseMs * Math.pow(2, attempt);
  return Math.min(backoff, maxMs);
}

export function createTdxMqttManager(
  options: TdxMqttManagerOptions = {},
  deps: {
    clientFactory?: MqttClientFactory;
    now?: () => Date;
    circuitBreaker?: TdxStreamCircuitBreaker;
  } = {},
): TdxMqttManager {
  const clientFactory: MqttClientFactory = deps.clientFactory ?? mqtt.connect;
  const now = deps.now ?? (() => new Date());
  const circuitBreaker: TdxStreamCircuitBreaker =
    deps.circuitBreaker ?? tdxStreamCircuitBreaker;

  const brokerUrl = options.brokerUrl || process.env.TDX_MQTT_BROKER_URL || DEFAULT_TDX_MQTT_BROKER;
  const username = options.username || process.env.TDX_MQTT_USERNAME;
  const password = options.password || process.env.TDX_MQTT_PASSWORD;
  const clientId = options.clientId || process.env.TDX_MQTT_CLIENT_ID;

  const baseBackoffMs = options.baseBackoffMs ?? DEFAULT_BASE_BACKOFF_MS;
  const maxBackoffMs = options.maxBackoffMs ?? DEFAULT_MAX_BACKOFF_MS;

  let client: MqttClient | null = null;
  let status: TdxMqttConnectionStatus = "disconnected";
  let lastConnectedAt: string | null = null;
  let lastDisconnectedAt: string | null = null;
  let reconnectAttempts = 0;
  let messagesReceived = 0;
  let lastError: string | null = null;

  const subscribedTopics = new Set<string>();

  function isConfigured(): boolean {
    return Boolean(username && password && clientId);
  }

  function getActiveEngine(): StreamActiveEngine {
    return circuitBreaker.getActiveEngine();
  }

  function getDiagnostics(): TdxMqttDiagnostics {
    return {
      status,
      configured: isConfigured(),
      broker: brokerUrl,
      clientId: clientId ?? null,
      subscribedTopics: Array.from(subscribedTopics),
      lastConnectedAt,
      lastDisconnectedAt,
      reconnectAttempts,
      messagesReceived,
      lastError,
      activeEngine: getActiveEngine(),
      circuit: circuitBreaker.getCircuitStatus(),
    };
  }

  async function connect(): Promise<MqttClient | null> {
    if (!isConfigured()) {
      return null;
    }

    // Singleton invariant: do not open secondary connections
    if (client && (status === "connected" || status === "connecting" || status === "reconnecting")) {
      return client;
    }

    status = "connecting";

    const mqttOptions: IClientOptions = {
      clientId,
      username,
      password,
      clean: options.clean ?? true,
      connectTimeout: options.connectTimeoutMs ?? 30_000,
      reconnectPeriod: baseBackoffMs,
      rejectUnauthorized: true,
    };

    try {
      client = clientFactory(brokerUrl, mqttOptions);

      client.on("connect", () => {
        status = "connected";
        lastConnectedAt = now().toISOString();
        reconnectAttempts = 0;
        lastError = null;

        // Notify circuit breaker of successful connection/probe
        circuitBreaker.recordConnectionSuccess();

        // Auto-resubscribe active topics upon reconnect
        if (subscribedTopics.size > 0 && client) {
          const topics = Array.from(subscribedTopics);
          client.subscribe(topics, { qos: 1 });
        }
      });

      client.on("reconnect", () => {
        status = "reconnecting";
        reconnectAttempts += 1;
        // Dynamically cap backoff
        if (client) {
          const nextBackoff = calculateBackoffMs(reconnectAttempts, baseBackoffMs, maxBackoffMs);
          client.options.reconnectPeriod = nextBackoff;
        }
      });

      client.on("close", () => {
        if (status !== "reconnecting") {
          status = "disconnected";
        }
        lastDisconnectedAt = now().toISOString();
        circuitBreaker.recordDisconnect(now().getTime());
      });

      client.on("error", (err: Error) => {
        status = "error";
        // Sanitize error message to ensure credentials are never leaked
        const sanitizedMsg = (err.message || "Unknown MQTT error")
          .replace(password || "", "[REDACTED]")
          .replace(username || "", "[USER]");
        lastError = sanitizedMsg;
        circuitBreaker.recordDisconnect(now().getTime());
      });

      client.on("message", () => {
        messagesReceived += 1;
      });

      return client;
    } catch (err: unknown) {
      status = "error";
      const msg = err instanceof Error ? err.message : String(err);
      lastError = msg.replace(password || "", "[REDACTED]");
      circuitBreaker.recordDisconnect(now().getTime());
      return null;
    }
  }

  async function disconnect(): Promise<void> {
    if (!client) {
      status = "disconnected";
      return;
    }

    return new Promise((resolve) => {
      client?.end(false, {}, () => {
        status = "disconnected";
        lastDisconnectedAt = now().toISOString();
        client = null;
        resolve();
      });
    });
  }

  async function subscribe(topics: string | string[], qos: 0 | 1 | 2 = 1): Promise<boolean> {
    const topicList = Array.isArray(topics) ? topics : [topics];
    for (const t of topicList) {
      subscribedTopics.add(t);
    }

    if (!client || status !== "connected") {
      return false;
    }

    return new Promise((resolve) => {
      client?.subscribe(topicList, { qos }, (err) => {
        if (err) {
          lastError = err.message;
          resolve(false);
        } else {
          resolve(true);
        }
      });
    });
  }

  function getClient(): MqttClient | null {
    return client;
  }

  return {
    connect,
    disconnect,
    subscribe,
    getDiagnostics,
    getClient,
    getActiveEngine,
    getCircuitBreaker: () => circuitBreaker,
  };
}

/** Production process-wide singleton for TDX MQTTS connection */
export const tdxMqttManager: TdxMqttManager = createTdxMqttManager();
