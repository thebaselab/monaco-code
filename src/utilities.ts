import type { WorkerConfig } from "@codingame/monaco-vscode-extensions-service-override";

export function decodeBase64(base64: string): string {
  return decodeURIComponent(escape(atob(base64)));
}

class Worker {
  constructor(public url: string | URL, public options?: WorkerOptions) {}
}

const fakeWorker = new Worker(
  new URL(
    "@codingame/monaco-vscode-api/workers/extensionHost.worker",
    import.meta.url
  ),
  { type: "module" }
);

export const workerConfig: WorkerConfig = {
  url: fakeWorker.url.toString(),
  options: fakeWorker.options,
};
