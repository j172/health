import { tdxMqttManager } from "./connection.ts";
import { TDX_MQTT_TOPIC_METRO_ALERT, isMetroAlertTopic } from "./topics.ts";
import { handleMetroAlertMessage } from "./metroAlertHandler.ts";

let isWorkerStarted = false;

/**
 * Initializes and starts the background TDX MQTTS worker.
 * Subscribes to Metro & LRT disruption topics at QoS 1 and routes incoming messages.
 * Idempotent: calling multiple times will not create duplicate listeners.
 */
export async function startTdxMqttWorker(): Promise<boolean> {
  if (isWorkerStarted) {
    return true;
  }

  const client = await tdxMqttManager.connect();
  if (!client) {
    return false;
  }

  isWorkerStarted = true;

  // Subscribe to all Metro and Light Rail disruption topics with wildcard
  await tdxMqttManager.subscribe([TDX_MQTT_TOPIC_METRO_ALERT], 1);

  client.on("message", (topic: string, message: Buffer) => {
    if (isMetroAlertTopic(topic)) {
      handleMetroAlertMessage(topic, message).catch((err) => {
        console.error(`[TDX-MQTT] Failed to process message from ${topic}:`, err);
      });
    }
  });

  return true;
}

export function isTdxMqttWorkerRunning(): boolean {
  return isWorkerStarted;
}
