import type { ApprovalStatus } from "@/types/database";

export interface CommandResult {
  ok: boolean;
  error_code?: string;
  message?: string;
  idempotent_replay?: boolean;
  entity_id?: string;
  [key: string]: unknown;
}

export interface CommandOptions {
  idempotencyKey?: string;
  correlationId?: string;
  expectedStatus?: ApprovalStatus;
}

export function assertCommandOk<T extends CommandResult>(result: T): T {
  if (!result?.ok) {
    const code = result?.error_code ?? "COMMAND_FAILED";
    const message = result?.message ?? "Command failed";
    throw new Error(`[${code}] ${message}`);
  }
  return result;
}
