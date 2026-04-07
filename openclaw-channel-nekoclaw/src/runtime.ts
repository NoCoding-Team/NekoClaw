import type { PluginRuntime } from "openclaw/plugin-sdk";

let runtime: PluginRuntime | null = null;

export function setNekoClawyRuntime(next: PluginRuntime) {
  runtime = next;
}

export function getNekoClawyRuntime(): PluginRuntime {
  if (!runtime) {
    throw new Error("NekoClaw runtime not initialized");
  }
  return runtime;
}
