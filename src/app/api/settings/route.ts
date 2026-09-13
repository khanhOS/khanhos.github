// GET   /api/settings — Cài đặt user
// PATCH /api/settings — Cập nhật cài đặt

import { db } from "@/lib/db";
import { guard, ok, fail } from "@/lib/api-helpers";
import { settingsPatchSchema, firstZodError } from "@/lib/security/validation";
import { DEFAULT_MODEL_ID, isModelAvailable } from "@/lib/models";
import { isOwnerRole } from "@/lib/auth/owner";
import { decryptSecret, encryptSecret, maskSecret } from "@/lib/security/secrets";

async function getOrCreateSettings(userId: string) {
  return (
    (await db.userSettings.findUnique({ where: { userId } })) ??
    db.userSettings.create({ data: { userId } })
  );
}

export async function GET(req: Request) {
  const g = await guard(req, { requireAuth: true });
  if (g.response) return g.response;

  const settings = await getOrCreateSettings(g.user!.id);
  const providerApiKey = settings.providerApiKey
    ? (() => {
        try {
          return maskSecret(decryptSecret(settings.providerApiKey!));
        } catch {
          return "••••••••";
        }
      })()
    : null;
  return ok({
    settings: {
      defaultModelId: settings.defaultModelId ?? DEFAULT_MODEL_ID,
      providerApiKey: isOwnerRole(g.user!.email, g.user!.role) ? providerApiKey : null,
      providerApiKeyConfigured: Boolean(settings.providerApiKey),
      providerApiKeyName: isOwnerRole(g.user!.email, g.user!.role) ? settings.providerApiKeyName : null,
      providerModel: isOwnerRole(g.user!.email, g.user!.role) ? settings.providerModel : null,
      webSearchEnabled: settings.webSearchEnabled,
      reducedMotionPref: settings.reducedMotionPref ?? "system",
      theme: settings.theme ?? "system",
    },
  });
}

export async function PATCH(req: Request) {
  const g = await guard(req, { requireAuth: true });
  if (g.response) return g.response;
  const user = g.user!;

  const body = await req.json().catch(() => null);
  const parsed = settingsPatchSchema.safeParse(body);
  if (!parsed.success) return fail(400, firstZodError(parsed.error));

  // Validate model nếu có
  if (parsed.data.defaultModelId && !isModelAvailable(parsed.data.defaultModelId)) {
    return fail(400, "Model không hợp lệ hoặc chưa khả dụng");
  }

  const settings = await getOrCreateSettings(user.id);
  if (
    (parsed.data.providerApiKey !== undefined ||
      parsed.data.providerApiKeyName !== undefined ||
      parsed.data.providerModel !== undefined) &&
    !isOwnerRole(user.email, user.role)
  ) {
    return fail(403, "Chỉ owner mới được cấu hình API key.");
  }
  const updated = await db.userSettings.update({
    where: { userId: user.id },
    data: {
      ...(parsed.data.defaultModelId !== undefined
        ? { defaultModelId: parsed.data.defaultModelId }
        : {}),
      ...(parsed.data.providerApiKey !== undefined
        ? {
            providerApiKey: parsed.data.providerApiKey
              ? encryptSecret(parsed.data.providerApiKey)
              : null,
          }
        : {}),
      ...(parsed.data.providerModel !== undefined
        ? { providerModel: parsed.data.providerModel || null }
        : {}),
      ...(parsed.data.providerApiKeyName !== undefined
        ? { providerApiKeyName: parsed.data.providerApiKeyName || null }
        : {}),
      ...(parsed.data.webSearchEnabled !== undefined
        ? { webSearchEnabled: parsed.data.webSearchEnabled }
        : {}),
      ...(parsed.data.reducedMotionPref !== undefined
        ? { reducedMotionPref: parsed.data.reducedMotionPref }
        : {}),
      ...(parsed.data.theme !== undefined
        ? { theme: parsed.data.theme }
        : {}),
    },
  });

  return ok({
    settings: {
      defaultModelId: updated.defaultModelId ?? DEFAULT_MODEL_ID,
      providerApiKey: isOwnerRole(user.email, user.role)
        ? updated.providerApiKey
          ? "••••••••"
          : null
        : null,
      providerApiKeyConfigured: Boolean(updated.providerApiKey),
      providerApiKeyName: isOwnerRole(user.email, user.role) ? updated.providerApiKeyName : null,
      providerModel: isOwnerRole(user.email, user.role) ? updated.providerModel : null,
      webSearchEnabled: updated.webSearchEnabled,
      reducedMotionPref: updated.reducedMotionPref ?? "system",
      theme: updated.theme ?? "system",
    },
  });
}
