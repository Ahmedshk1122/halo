// BroadcastChannel wrapper shared by the control and stage windows. Both
// windows must be on the same origin (they are: both are served by Vite).

import type { ChannelMessage } from "../../shared/stage";

const CHANNEL = "halo";

export type Unsubscribe = () => void;

export class HaloChannel {
  private channel = new BroadcastChannel(CHANNEL);

  post(message: ChannelMessage): void {
    this.channel.postMessage(message);
  }

  subscribe(handler: (message: ChannelMessage) => void): Unsubscribe {
    const listener = (event: MessageEvent<ChannelMessage>) => handler(event.data);
    this.channel.addEventListener("message", listener);
    return () => this.channel.removeEventListener("message", listener);
  }

  close(): void {
    this.channel.close();
  }
}

/** Wall-clock milliseconds that are comparable across windows. */
export function now(): number {
  return performance.timeOrigin + performance.now();
}
