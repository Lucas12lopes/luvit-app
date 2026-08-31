export function fetchWithTimeout(url, options = {}, timeout = 9000) {
  const controller = new AbortController();
  const externalSignal = options.signal;
  const abort = () => controller.abort(externalSignal?.reason);
  if (externalSignal?.aborted) abort();
  else externalSignal?.addEventListener("abort", abort, { once: true });
  const timer = window.setTimeout(() => controller.abort(new DOMException("Timeout", "AbortError")), timeout);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => {
    window.clearTimeout(timer);
    externalSignal?.removeEventListener("abort", abort);
  });
}
