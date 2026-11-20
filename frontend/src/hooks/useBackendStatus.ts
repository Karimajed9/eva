import { useEffect, useState } from "react";
import type { AppInfo, BackendStatus } from "../../../shared/contract";

const bridgeMissing: BackendStatus = {
  state: "error",
  detail: "Desktop bridge unavailable. Launch JARVIS with the Electron shell.",
  health: null,
  checkedAt: null,
};

const contacting: BackendStatus = {
  state: "starting",
  detail: "Contacting the local core.",
  health: null,
  checkedAt: null,
};

function initialStatus(): BackendStatus {
  if (typeof window === "undefined" || !window.jarvis) {
    return bridgeMissing;
  }
  return contacting;
}

export function useBackendStatus(): BackendStatus {
  const [status, setStatus] = useState<BackendStatus>(initialStatus);

  useEffect(() => {
    const api = window.jarvis;
    if (!api) {
      setStatus(bridgeMissing);
      return;
    }

    let active = true;
    const unsubscribe = api.subscribeBackendStatus((next) => {
      if (active) {
        setStatus(next);
      }
    });

    void api.getBackendStatus().then((next) => {
      if (active) {
        setStatus(next);
      }
    }).catch(() => {
      if (active) {
        setStatus({
          state: "error",
          detail: "The desktop bridge returned an invalid status.",
          health: null,
          checkedAt: null,
        });
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return status;
}

export function useAppInfo(): AppInfo | null {
  const [info, setInfo] = useState<AppInfo | null>(null);

  useEffect(() => {
    const api = window.jarvis;
    if (!api) {
      return;
    }
    let active = true;
    void api.getAppInfo().then((next) => {
      if (active) {
        setInfo(next);
      }
    }).catch(() => {
      if (active) {
        setInfo(null);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  return info;
}
