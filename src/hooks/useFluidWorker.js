import { useEffect, useRef } from "react";

// Owns one CFD worker instance and exposes a simple request/response
// interface: postStep() fires a solve if the worker is idle, and the most
// recent result is always available synchronously via frameRef.
export function useFluidWorker(nx, ny) {
  const workerRef = useRef(null);
  const readyRef = useRef(false);
  const busyRef = useRef(false);
  const frameRef = useRef(null);
  const reqIdRef = useRef(0);

  useEffect(() => {
    const worker = new Worker(new URL("../workers/fluidWorker.js", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;

    worker.onmessage = (e) => {
      const msg = e.data;
      if (msg.type === "ready") {
        readyRef.current = true;
      } else if (msg.type === "frame") {
        frameRef.current = { u: msg.u, v: msg.v, dye: msg.dye, curl: msg.curl };
        busyRef.current = false;
      }
    };

    worker.onerror = (err) => {
      busyRef.current = false;
      console.error("fluid worker error:", err.message, err);
    };

    worker.postMessage({ type: "init", nx, ny });

    return () => {
      worker.terminate();
      workerRef.current = null;
      readyRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const postStep = (payload) => {
    const worker = workerRef.current;
    if (!worker || !readyRef.current || busyRef.current) return false;
    busyRef.current = true;
    reqIdRef.current += 1;
    worker.postMessage({ type: "step", requestId: reqIdRef.current, ...payload });
    return true;
  };

  return { postStep, frameRef };
}
