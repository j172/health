export type TdxMqttConnectionStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "error";

export interface TdxMqttCredentials {
  username?: string;
  password?: string;
  clientId?: string;
  brokerUrl?: string;
}

export interface TdxMqttDiagnostics {
  status: TdxMqttConnectionStatus;
  configured: boolean;
  broker: string;
  clientId: string | null;
  subscribedTopics: string[];
  lastConnectedAt: string | null;
  lastDisconnectedAt: string | null;
  reconnectAttempts: number;
  messagesReceived: number;
  lastError: string | null;
}

export interface TdxMqttManagerOptions {
  brokerUrl?: string;
  clientId?: string;
  username?: string;
  password?: string;
  clean?: boolean;
  connectTimeoutMs?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
}
