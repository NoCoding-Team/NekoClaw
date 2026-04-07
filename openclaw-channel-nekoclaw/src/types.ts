export type NekoClawyAccountConfig = {
  enabled?: boolean;
  apiUrl?: string;
  workspaceId: string;
  instanceId: string;
  apiToken: string;
};

export type NekoClawyChannelConfig = {
  accounts?: Record<string, NekoClawyAccountConfig>;
  tunnelUrl?: string;
};

export type ResolvedNekoClawyAccount = {
  accountId: string;
  enabled: boolean;
  configured: boolean;
  apiUrl: string;
  workspaceId: string;
  instanceId: string;
  apiToken: string;
};

export type CollaborationPayload = {
  workspace_id: string;
  source_instance_id: string;
  target: string;
  text: string;
  depth: number;
};
