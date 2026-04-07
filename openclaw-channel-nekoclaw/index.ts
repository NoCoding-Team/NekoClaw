import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";
import { nekoclawPlugin } from "./src/channel.js";
import { setNekoClawyRuntime } from "./src/runtime.js";
import { startTunnelClient } from "./src/tunnel-client.js";
import { createNekoClawyTools } from "./src/tools.js";

const WORKSPACE_SESSION_PREFIX = "workspace:";

const plugin = {
  id: "nekoclaw",
  name: "NekoClaw",
  description: "NekoClaw AI cat companion workspace channel",
  configSchema: emptyPluginConfigSchema(),
  register(api: OpenClawPluginApi) {
    setNekoClawyRuntime(api.runtime);
    api.registerChannel({ plugin: nekoclawPlugin });

    const tunnelClient = startTunnelClient(api.config);

    try {
      const { handleWebhook } = require("openclaw-channel-learning/src/channel.js");
      tunnelClient.setLearningHandler(handleWebhook);
    } catch {
      console.warn("[nekoclaw] Learning channel not available for tunnel injection");
    }

    api.registerTool((ctx: { sessionKey?: string }) => {
      const wsId = ctx.sessionKey?.startsWith(WORKSPACE_SESSION_PREFIX)
        ? ctx.sessionKey.slice(WORKSPACE_SESSION_PREFIX.length)
        : undefined;
      return createNekoClawyTools(api.config, wsId);
    }, {
      optional: true,
      names: [
        "nekoclaw_workspace",
        "nekoclaw_topology",
        "nekoclaw_gene",
        "nekoclaw_instance",
      ],
    });
  },
};

export default plugin;
