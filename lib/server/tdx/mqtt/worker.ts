import { tdxMqttManager } from "./connection.ts";
import {
  TDX_MQTT_TOPIC_METRO_ALERT,
  TDX_MQTT_TOPIC_TRA_ALERT,
  TDX_MQTT_TOPIC_THSR_ALERT,
  isMetroAlertTopic,
  isTraAlertTopic,
  isThsrAlertTopic,
} from "./topics.ts";
import { handleMetroAlertMessage } from "./metroAlertHandler.ts";
import { handleTraAlertMessage, handleThsrAlertMessage } from "./railAlertHandler.ts";
import { ensureColdStartSnapshot } from "./reconciliation.ts";
import {
  tdxStreamCircuitBreaker,
  type FallbackPollOutcome,
} from "./circuitBreaker.ts";

let isWorkerStarted = false;

/**
 * Initializes and starts the background TDX MQTTS worker.
 * Ensures cold-start snapshot baseline before starting MQTT, then
 * subscribes to Metro, LRT, TRA, and THSR disruption streams at QoS 1 and routes incoming messages.
 * Idempotent: calling multiple times will not create duplicate listeners.
 */
export async function startTdxMqttWorker(): Promise<boolean> {
  if (isWorkerStarted) {
    return true;
  }

  // Ensure active disruptions baseline via Cold-Start sequence (gracefully non-blocking)
  try {
    await ensureColdStartSnapshot();
  } catch (err) {
    console.warn("[TDX-MQTT] Cold-start snapshot initial warning:", err);
  }

  const client = await tdxMqttManager.connect();
  if (!client) {
    tdxStreamCircuitBreaker.recordDisconnect();
    return false;
  }

  isWorkerStarted = true;

  // Subscribe to Metro, LRT, TRA and THSR disruption streams at QoS 1
  await tdxMqttManager.subscribe(
    [
      TDX_MQTT_TOPIC_METRO_ALERT,
      TDX_MQTT_TOPIC_TRA_ALERT,
      TDX_MQTT_TOPIC_THSR_ALERT,
    ],
    1,
  );

  client.on("message", (topic: string, message: Buffer) => {
    if (isMetroAlertTopic(topic)) {
      handleMetroAlertMessage(topic, message).catch((err) => {
        console.error(`[TDX-MQTT] Failed to process message from ${topic}:`, err);
      });
    } else if (isTraAlertTopic(topic)) {
      handleTraAlertMessage(topic, message).catch((err) => {
        console.error(`[TDX-MQTT] Failed to process TRA message from ${topic}:`, err);
      });
    } else if (isThsrAlertTopic(topic)) {
      handleThsrAlertMessage(topic, message).catch((err) => {
        console.error(`[TDX-MQTT] Failed to process THSR message from ${topic}:`, err);
      });
    }
  });

  return true;
}

export function isTdxMqttWorkerRunning(): boolean {
  return isWorkerStarted;
}

/**
 * Supervisor tick: evaluates circuit state.
 * If in OPEN state, executes fallback polling (guarded by 80 requests/day safety quota and 3-hour interval).
 */
export async function runStreamSupervisorTick(deps: any = {}): Promise<FallbackPollOutcome> {
  tdxStreamCircuitBreaker.checkAndEvaluateState(deps.now ? deps.now() : undefined);
  return tdxStreamCircuitBreaker.executeFallbackPoll(deps);
}
