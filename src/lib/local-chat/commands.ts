// KhanhOS AI — Lệnh chat cục bộ (không cần DB)
// /help /about /status /models /settings /version /knowledge — đọc từ
// data/chatbot/commands.json. /help HIỆN/ẨN mục "chỉ dành cho chủ sở hữu"
// tuỳ role. Lệnh chạm DB (/give, /usage...) nằm ở admin-commands.ts.

import type { ChatbotData, EngineUserContext } from "./types";
import { LOCAL_MODELS } from "@/lib/models";
import { isOwnerRole } from "@/lib/auth/owner";

export interface CommandOutput {
  text: string;
  action?: string;
}

const NORULE_TTL_MINUTES = 120;
const noruleState = {
  enabled: false,
  createdBy: null as string | null,
  scope: "chat" as "chat" | "coding" | "agent" | "search" | "global",
  expiresAt: null as number | null,
  reason: "",
  grants: new Map<string, { token: string; scope: string; expiresAt: number; createdBy: string; used: boolean }>(),
};

function isOwnerOrAdmin(user?: EngineUserContext): boolean {
  return isOwnerRole(user?.email, user?.role) || user?.role === "admin";
}

function renderNoruleStatus(user?: EngineUserContext): string {
  const admin = isOwnerOrAdmin(user);
  if (!admin) {
    return "Bạn không có quyền sử dụng /norule. Chỉ owner/admin mới được bật override sandbox.";
  }

  const active = noruleState.enabled && noruleState.expiresAt && noruleState.expiresAt > Date.now();
  const remaining = active && noruleState.expiresAt ? Math.max(0, Math.ceil((noruleState.expiresAt - Date.now()) / 60000)) : 0;

  return [
    `Sandbox override: ${active ? "ĐANG BẬT" : "TẮT"}`,
    active ? `Phạm vi: ${noruleState.scope} • còn ${remaining} phút` : "Không có override đang hoạt động.",
    "Hệ thống vẫn ghi log, giới hạn phạm vi và không cho phép truy cập bí mật / quyền production-critical.",
    "Cú pháp: /norule true | /norule false | /norule status | /norule grant <token> <scope> <minutes> | /norule use <token> | /norule revoke <token>",
  ].join("\n");
}

/** Tách "/give plus a@b.c" → { name: "/give", args: ["plus", "a@b.c"], rest: "plus a@b.c" }. */
export function parseCommand(raw: string): { name: string; args: string[]; rest: string } | null {
  const m = raw.trim().match(/^\/([a-zA-Z0-9_-]+)(?:\s+([\s\S]*))?$/);
  if (!m) return null;
  const rest = (m[2] ?? "").trim();
  return {
    name: "/" + m[1].toLowerCase(),
    args: rest ? rest.split(/\s+/) : [],
    rest,
  };
}

function commandList(data: ChatbotData, owner: boolean): Array<[string, string]> {
  return Object.entries(data.commands)
    .filter(([name, def]) => owner || !def.owner_only)
    .map(([name, def]) => [name, def.description] as [string, string]);
}

function helpText(data: ChatbotData, user?: EngineUserContext): string {
  const owner = isOwnerOrAdmin(user);
  const lines: string[] = [];

  lines.push("Lệnh mình hiểu được:\n");
  for (const [name, desc] of commandList(data, false)) {
    lines.push(`**${name}** — ${desc}`);
  }

  if (owner) {
    lines.push("\n👑 **Lệnh chỉ dành cho chủ sở hữu:**\n");
    for (const [name, def] of Object.entries(data.commands)) {
      if (!def.owner_only) continue;
      const usage = def.usage ? ` \`${def.usage}\`` : "";
      lines.push(`**${name}**${usage} — ${def.description}`);
    }
  }

  lines.push(
    "\nNgoài lệnh, cứ gõ câu hỏi bình thường (tiếng Việt có dấu hoặc không đều được) — mình trả lời từ tri thức local. Gõ **/knowledge** để xem các chủ đề mình biết."
  );
  return lines.join("\n");

}

/** Chạy lệnh KHÔNG cần DB. Trả về text (đã markdown). */
export function runCommand(
  name: string,
  data: ChatbotData,
  user?: EngineUserContext,
  args: string[] = []
): CommandOutput | null {
  const def = data.commands[name];
  if (!def) return null;

  if (name === "/norule") {
    const role = user?.role;
    if (!isOwnerOrAdmin(user)) {
      return { text: "Bạn không có quyền sử dụng /norule. Chỉ owner/admin mới được bật override sandbox." };
    }

    const action = (args[0] ?? "status").toLowerCase();

    if (action === "true") {
      noruleState.enabled = true;
      noruleState.createdBy = role ?? "owner";
      noruleState.scope = "chat";
      noruleState.expiresAt = Date.now() + NORULE_TTL_MINUTES * 60000;
      noruleState.reason = "owner/admin sandbox override";
      return {
        text: `Override sandbox đã được bật. Phạm vi: ${noruleState.scope}. Hết hạn sau ${NORULE_TTL_MINUTES} phút. Vẫn ghi log và giới hạn quyền an toàn.`,
      };
    }

    if (action === "false") {
      noruleState.enabled = false;
      noruleState.createdBy = null;
      noruleState.expiresAt = null;
      noruleState.reason = "";
      return { text: "Override sandbox đã tắt. Trạng thái quay về chế độ chuẩn của rule engine." };
    }

    if (action === "status") {
      return { text: renderNoruleStatus(user) };
    }

    if (action === "grant") {
      const token = args[1];
      const scope = args[2] ?? "chat";
      const minutes = Number(args[3] ?? NORULE_TTL_MINUTES);
      if (!token) {
        return { text: "Cú pháp: /norule grant <token> <scope> <minutes>" };
      }
      const expiresAt = Date.now() + Math.max(15, Math.min(120, Number.isFinite(minutes) ? minutes : NORULE_TTL_MINUTES)) * 60000;
      noruleState.grants.set(token, {
        token,
        scope,
        expiresAt,
        createdBy: role ?? "owner",
        used: false,
      });
      return {
        text: `Token sandbox đã cấp: **${token}** • scope: **${scope}** • hết hạn: **${Math.max(15, Math.min(120, Number.isFinite(minutes) ? minutes : NORULE_TTL_MINUTES))} phút**`,
      };
    }

    if (action === "use") {
      const token = args[1];
      if (!token) {
        return { text: "Cú pháp: /norule use <token>" };
      }
      const grant = noruleState.grants.get(token);
      if (!grant || grant.used || grant.expiresAt < Date.now()) {
        return { text: `Token **${token}** không hợp lệ hoặc đã hết hạn.` };
      }
      grant.used = true;
      noruleState.enabled = true;
      noruleState.createdBy = role ?? "owner";
      noruleState.scope = (grant.scope as typeof noruleState.scope) ?? "chat";
      noruleState.expiresAt = grant.expiresAt;
      noruleState.reason = "token grant sandbox";
      return {
        text: `Token **${token}** hợp lệ. Sandbox đã được kích hoạt theo scope **${grant.scope}** trong thời gian còn lại.`,
      };
    }

    if (action === "revoke") {
      const token = args[1];
      if (!token) {
        return { text: "Cú pháp: /norule revoke <token>" };
      }
      const ok = noruleState.grants.delete(token);
      return { text: ok ? `Đã thu hồi token **${token}**.` : `Token **${token}** không tồn tại.` };
    }

    return { text: renderNoruleStatus(user) };
  }

  switch (name) {
    case "/help":
      return { text: helpText(data, user) };

    case "/status": {
      const st = data.stats;
      return {
        text:
          `Bộ máy **${data.system.engine.name}** v${data.system.engine.version} — chạy 100% cục bộ, không API ngoài.\n\n` +
          `• **${st.intents}** intent • **${st.patterns}** mẫu câu\n` +
          `• **${st.knowledge}** mục tri thức • **${st.faq}** FAQ\n` +
          `• **${st.topics}** chủ đề • **${st.conversations}** kịch bản follow-up\n` +
          (data.warnings.length
            ? `\n⚠ ${data.warnings.length} cảnh báo dữ liệu (xem /api/admin/chatbot)`
            : "\nDữ liệu sạch — không cảnh báo."),
      };
    }

    case "/models": {
      const lines = LOCAL_MODELS.map(
        (m) =>
          `• **${m.name}** (${m.id}) — ${m.description}${m.badge ? ` [${m.badge}]` : ""}`
      );
      return { text: "Bộ máy đang dùng:\n" + lines.join("\n") };
    }

    case "/knowledge": {
      const lines = data.topics.map(
        (t) => `• **${t.name}** — ${t.description ?? ""}`.trim()
      );
      return {
        text: "Các chủ đề trong tri thức local của mình:\n" + lines.join("\n"),
      };
    }

    default: {
      // /about /settings /version... — dùng "response" tĩnh trong data
      if (def.response) return { text: def.response };
      return { text: `**${name}** — ${def.description}` };
    }
  }
}

/** Text khi user gõ lệnh không tồn tại (kể cả lệnh owner khi thiếu quyền). */
export function unknownCommandText(
  name: string,
  data: ChatbotData,
  user?: EngineUserContext
): string {
  const owner = isOwnerOrAdmin(user);
  const known = commandList(data, owner).map(([n]) => n);
  return (
    `Mình không có lệnh **${name}**.\n\n` +
    `Các lệnh mình biết: ${known.join(", ")}.\n` +
    "Gõ **/help** để xem hướng dẫn chi tiết."
  );
}
