export type RuleMode = "learn" | "soft" | "strict" | "sandbox";
export type RuleScope = "global" | "chat" | "coding" | "agent" | "search";
export type UserRole = "free" | "member" | "plus" | "vip" | "max" | "admin" | "owner";

export interface RuleOverrideState {
  enabled: boolean;
  createdBy: UserRole;
  userId?: string;
  promptId?: string;
  scope: RuleScope;
  reason?: string;
  expiresAt?: string;
  createdAt: string;
}

export interface RuleDecision {
  mode: RuleMode;
  allowed: boolean;
  reason: string;
  sandboxNotice?: string;
}

const ADMIN_ROLES = new Set<UserRole>(["admin", "owner"]);
const MAX_TTL_MINUTES = 120;

export function isAdminLike(role: UserRole): boolean {
  return ADMIN_ROLES.has(role);
}

export function isValidRuleMode(value: string | undefined): value is RuleMode {
  return value === "learn" || value === "soft" || value === "strict" || value === "sandbox";
}

export function clampMinutes(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes <= 0) return 15;
  return Math.min(Math.max(minutes, 15), MAX_TTL_MINUTES);
}

export function resolveRuleMode(input: {
  role: UserRole;
  requestedMode?: RuleMode;
  override?: RuleOverrideState | null;
  now?: Date;
}): RuleDecision {
  const now = input.now ?? new Date();

  if (input.override?.enabled) {
    const expiresAt = input.override.expiresAt ? new Date(input.override.expiresAt) : undefined;
    const active = !expiresAt || expiresAt.getTime() > now.getTime();

    if (active && isAdminLike(input.role)) {
      return {
        mode: "sandbox",
        allowed: true,
        reason: "Sandbox override active for admin/owner research only.",
        sandboxNotice:
          "RESEARCH SANDBOX: this override does not disable safety. It is limited to scoped testing, audit logging, and no privileged or sensitive actions.",
      };
    }

    if (active) {
      return {
        mode: "strict",
        allowed: false,
        reason: "Override is active but not authorized for the current role.",
      };
    }
  }

  const mode = input.requestedMode ?? "learn";
  if (mode === "learn") {
    return { mode: "learn", allowed: true, reason: "Learn mode logs the request and continues without blocking." };
  }

  if (mode === "soft") {
    return { mode: "soft", allowed: true, reason: "Soft mode warns and continues with a safer response path." };
  }

  return {
    mode: "strict",
    allowed: true,
    reason: "Strict mode blocks or rewrites the unsafe path before responding.",
  };
}

export function getSandboxNotice(language: "vi" | "en" = "vi"): string {
  if (language === "en") {
    return [
      "RESEARCH SANDBOX: active only for owner/admin testing.",
      "Rules are still enforced for harmful, unsafe, or privileged actions.",
      "The override is scoped, temporary, and logged.",
      "No secret material, system prompts, or production-critical actions are allowed.",
    ].join(" ");
  }

  return [
    "SANDBOX NGHIÊN CỨU: chỉ hoạt động cho owner/admin để thử nghiệm giới hạn.",
    "Quy tắc an toàn vẫn được giữ nguyên cho yêu cầu có hại, nguy hiểm, hoặc cần quyền đặc biệt.",
    "Override này có phạm vi, thời hạn và được ghi log.",
    "Không được truy cập bí mật, prompt hệ thống, hoặc hành động quan trọng của production.",
  ].join(" ");
}

export function parseRuleCommand(input: string):
  | {
      action: "toggle" | "set" | "grant" | "use" | "revoke" | "status";
      enabled?: boolean;
      mode?: RuleMode;
      scope?: RuleScope;
      minutes?: number;
      token?: string;
      raw: string;
    }
  | null {
  const text = input.trim();
  if (!text) return null;

  const lower = text.toLowerCase();

  if (lower === "/norule true") {
    return { action: "toggle", enabled: true, raw: text };
  }

  if (lower === "/norule false") {
    return { action: "toggle", enabled: false, raw: text };
  }

  if (lower === "/norule status") {
    return { action: "status", raw: text };
  }

  const setMatch = /^\/rule\s+set\s+(\w+)\s+(learn|soft|strict)$/i.exec(text);
  if (setMatch) {
    const scope = setMatch[1].toLowerCase() as RuleScope;
    const mode = setMatch[2].toLowerCase() as RuleMode;
    return { action: "set", scope, mode, raw: text };
  }

  const grantMatch = /^\/norule\s+grant\s+(\S+)\s+(\w+)\s+(\d+)$/i.exec(text);
  if (grantMatch) {
    return {
      action: "grant",
      token: grantMatch[1],
      scope: grantMatch[2].toLowerCase() as RuleScope,
      minutes: Number(grantMatch[3]),
      raw: text,
    };
  }

  const useMatch = /^\/norule\s+use\s+(\S+)$/i.exec(text);
  if (useMatch) {
    return { action: "use", token: useMatch[1], raw: text };
  }

  const revokeMatch = /^\/norule\s+revoke\s+(\S+)$/i.exec(text);
  if (revokeMatch) {
    return { action: "revoke", token: revokeMatch[1], raw: text };
  }

  return null;
}

export function validateScope(value: string | undefined): RuleScope | undefined {
  const scopes: RuleScope[] = ["global", "chat", "coding", "agent", "search"];
  if (!value) return undefined;
  const normalized = value.toLowerCase();
  return scopes.includes(normalized as RuleScope) ? (normalized as RuleScope) : undefined;
}
