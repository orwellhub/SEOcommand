import type { AlertChannel } from "./types";

/** New websites begin with the approved delivery policy; other channels stay opt-in. */
export const DEFAULT_ALERT_CHANNELS: AlertChannel[] = ["email"];
