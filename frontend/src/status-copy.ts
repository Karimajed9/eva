import type { BackendState } from "../../shared/contract";

export function statusLabel(state: BackendState): string {
  switch (state) {
    case "up":
      return "CORE ONLINE";
    case "starting":
      return "CONNECTING";
    case "down":
      return "CORE OFFLINE";
    case "error":
      return "CORE ERROR";
  }
}

export function statusHeadline(state: BackendState): string {
  switch (state) {
    case "up":
      return "Standing by";
    case "starting":
      return "Coming online";
    case "down":
      return "Core offline";
    case "error":
      return "Attention required";
  }
}

export function orbTone(state: BackendState): "online" | "pending" | "offline" {
  if (state === "up") {
    return "online";
  }
  if (state === "starting") {
    return "pending";
  }
  return "offline";
}
