// KhanhOS AI — Settings modal: provider key/model, web search, reduced motion pref

"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useUIStore } from "@/store/use-ui-store";
import { useAuthStore } from "@/store/use-auth-store";
import { useChatStore } from "@/store/use-chat-store";
import { useToast } from "@/hooks/use-toast";
import type { UserSettings } from "@/types/chat";
import { Globe, Sparkles, Wand2, Info, Sun, Moon, Monitor, Cpu, CheckCircle2, CircleOff, KeyRound, Eye, EyeOff, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { isOwnerRole } from "@/lib/auth/owner";

interface RuntimeStatusInfo {
  available: boolean;
  runtime: string | null;
  defaultModel: string | null;
  error: string | null;
}

export function SettingsModal() {
  const open = useUIStore((s) => s.settingsModalOpen);
  const setOpen = useUIStore((s) => s.setSettingsModalOpen);
  const user = useAuthStore((s) => s.user);
  const { toast } = useToast();
  const { setTheme } = useTheme();

  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [runtime, setRuntime] = useState<RuntimeStatusInfo | null>(null);
  const [apiKeyDraft, setApiKeyDraft] = useState("");
  const [apiKeyNameDraft, setApiKeyNameDraft] = useState("");
  const [modelDraft, setModelDraft] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);

  // Load settings khi mở
  useEffect(() => {
    if (open && user) {
      fetch("/api/settings")
        .then((r) => r.json())
        .then((d) => {
          setSettings(d?.settings ?? null);
          setApiKeyDraft("");
          setApiKeyNameDraft(d?.settings?.providerApiKeyName ?? "");
          setModelDraft(d?.settings?.providerModel ?? "");
        })
        .catch(() => setSettings(null));
      fetch("/api/models")
        .then((r) => r.json())
        .then((d) => setRuntime(d?.runtime ?? null))
        .catch(() => setRuntime(null));
    }
  }, [open, user]);

  const patch = async (partial: Partial<UserSettings>) => {
    if (!settings) return;
    const next = { ...settings, ...partial };
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(partial),
      });
      if (!res.ok) {
        const d = await res.json();
        toast({ title: "Không lưu được cài đặt", description: d?.error, variant: "destructive" });
        return;
      }
      const saved = await res.json();
      setSettings(saved?.settings ?? next);
      // Sync trạng thái chat store
      if (partial.defaultModelId) {
        useChatStore.getState().setSelectedModelId(partial.defaultModelId);
      }
      if (partial.webSearchEnabled !== undefined) {
        useChatStore.getState().setWebSearchEnabled(partial.webSearchEnabled);
      }
      if (partial.theme) {
        setTheme(partial.theme);
      }
    } catch {
      toast({ title: "Lỗi kết nối khi lưu cài đặt", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="kh-glass-strong max-w-[420px] max-h-[85dvh] overflow-y-auto rounded-2xl border-foreground/10 p-0">
        <div className="px-6 pb-6 pt-5">
          <DialogHeader className="pb-4 text-left">
            <DialogTitle className="font-display text-lg font-semibold tracking-tight">
              Cài đặt
            </DialogTitle>
            <DialogDescription className="text-[13px]">
              Tuỳ chọn trải nghiệm KhanhOS AI của bạn.
            </DialogDescription>
          </DialogHeader>

          {!user ? (
            <div className="rounded-xl border border-foreground/10 bg-foreground/4 px-4 py-6 text-center text-sm text-muted-foreground">
              Đăng nhập để lưu cài đặt của bạn.
            </div>
          ) : !settings ? (
            <div className="space-y-2.5">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-xl bg-foreground/4" />
              ))}
            </div>
          ) : (
            <div className="space-y-2.5">
              {/* Giao diện (dark/light) */}
              <div className="rounded-xl border border-foreground/8 bg-foreground/4 p-4">
                <div className="flex items-center gap-2 pb-3">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Giao diện</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {([
                    { value: "dark", label: "Tối", icon: Moon },
                    { value: "light", label: "Sáng", icon: Sun },
                    { value: "system", label: "Hệ thống", icon: Monitor },
                  ] as const).map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      onClick={() => patch({ theme: value })}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-lg py-2.5 text-xs font-medium transition-all",
                        (settings.theme ?? "system") === value
                          ? "border border-primary/30 bg-primary/10 text-primary"
                          : "border border-transparent text-muted-foreground hover:bg-foreground/5"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {isOwnerRole(user.email, user.role) && (
                <div className="rounded-xl border border-foreground/8 bg-foreground/4 p-4">
                  <div className="flex items-center gap-2 pb-1">
                    <KeyRound className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">API key nhà cung cấp AI</span>
                  </div>
                  <p className="pb-3 text-xs leading-relaxed text-muted-foreground">
                    Key được mã hóa trên server và chỉ dùng cho tài khoản owner. Không hiển thị đầy đủ sau khi lưu.
                  </p>
                  <label className="mb-2 block text-xs font-medium text-foreground/80">Model ID</label>
                  <input
                    type="text"
                    value={modelDraft}
                    onChange={(e) => setModelDraft(e.target.value)}
                    onBlur={() => {
                      const value = modelDraft.trim();
                      if (value !== (settings.providerModel ?? "")) void patch({ providerModel: value || null });
                    }}
                    placeholder="openai/gpt-4o-mini hoặc meta-llama/llama-3.3-70b-instruct:free"
                    className="mb-3 h-9 w-full rounded-lg border border-foreground/10 bg-background/40 px-3 text-xs outline-none transition-colors focus:border-primary/50"
                    autoComplete="off"
                  />
                  <label className="mb-2 block text-xs font-medium text-foreground/80">API key name</label>
                  <input
                    type="text"
                    value={apiKeyNameDraft}
                    onChange={(e) => setApiKeyNameDraft(e.target.value)}
                    onBlur={() => {
                      const value = apiKeyNameDraft.trim();
                      if (value !== (settings.providerApiKeyName ?? "")) {
                        void patch({ providerApiKeyName: value || null });
                      }
                    }}
                    placeholder="OpenRouter key chính"
                    className="mb-3 h-9 w-full rounded-lg border border-foreground/10 bg-background/40 px-3 text-xs outline-none transition-colors focus:border-primary/50"
                    autoComplete="off"
                  />
                  <div className="flex gap-2">
                    <div className="relative min-w-0 flex-1">
                      <input
                        type={showApiKey ? "text" : "password"}
                        value={apiKeyDraft}
                        onChange={(e) => setApiKeyDraft(e.target.value)}
                        placeholder={settings.providerApiKeyConfigured ? "Đã cấu hình — nhập key mới để thay thế" : "sk-or-v1-…"}
                        className="h-9 w-full rounded-lg border border-foreground/10 bg-background/40 px-3 pr-9 text-xs outline-none transition-colors focus:border-primary/50"
                        autoComplete="off"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey((v) => !v)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        aria-label={showApiKey ? "Ẩn API key" : "Hiện API key"}
                      >
                        {showApiKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </button>
                    </div>
                    <button
                      type="button"
                      disabled={!apiKeyDraft.trim() || saving}
                      onClick={() => {
                        const value = apiKeyDraft.trim();
                        if (!value) return;
                        setApiKeyDraft("");
                        void patch({ providerApiKey: value });
                      }}
                      className="rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-50"
                    >
                      Lưu
                    </button>
                    {settings.providerApiKeyConfigured && (
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => patch({ providerApiKey: null })}
                        className="rounded-lg border border-destructive/25 px-2.5 text-destructive hover:bg-destructive/10 disabled:opacity-50"
                        aria-label="Xóa API key"
                        title="Xóa API key"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
                    {settings.providerApiKeyConfigured ? "API key đã được cấu hình." : "Chưa có API key riêng."}
                  </p>
                </div>
              )}

              {/* Trạng thái hệ AI cục bộ (sự thật — không fake) */}
              <div className="rounded-xl border border-foreground/8 bg-foreground/4 p-4">
                <div className="flex items-center gap-2 pb-1">
                  <Cpu className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Hệ AI cục bộ</span>
                </div>
                {runtime === null ? (
                  <p className="pt-1 text-xs text-muted-foreground">Đang kiểm tra runtime…</p>
                ) : runtime.available ? (
                  <div className="space-y-1 pt-1 text-xs">
                    <p className="flex items-center gap-1.5 text-foreground/80">
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
                      Model AI thật đang chạy: <span className="font-medium">{runtime.defaultModel ?? "—"}</span>
                    </p>
                    <p className="text-muted-foreground">
                      Runtime: {runtime.runtime === "ollama" ? "Ollama (cục bộ)" : runtime.runtime} — không gọi API ngoài.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1 pt-1 text-xs">
                    <p className="flex items-center gap-1.5 text-muted-foreground">
                      <CircleOff className="h-3.5 w-3.5" />
                      Chưa có model AI cục bộ — đang dùng bộ máy tri thức local.
                    </p>
                    <p className="text-muted-foreground/70">
                      Chạy <code className="rounded bg-foreground/8 px-1 py-px text-[10px]">bash scripts/setup-ollama.sh</code> trên máy chủ để bật model thật.
                    </p>
                  </div>
                )}
              </div>

              {/* Web search mặc định */}
              <div className="flex items-center justify-between rounded-xl border border-foreground/8 bg-foreground/4 p-4">
                <div className="pr-4">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium">Tự động tìm kiếm web</span>
                  </div>
                  <p className="pt-0.5 text-xs text-muted-foreground">
                    Bật mặc định khi gửi tin nhắn mới.
                  </p>
                </div>
                <Switch
                  checked={settings.webSearchEnabled}
                  onCheckedChange={(v) => patch({ webSearchEnabled: v })}
                  aria-label="Bật tìm kiếm web mặc định"
                />
              </div>

              {/* Motion preference */}
              <div className="rounded-xl border border-foreground/8 bg-foreground/4 p-4">
                <div className="flex items-center gap-2 pb-3">
                  <Wand2 className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">Hiệu ứng chuyển động</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(["system", "on", "off"] as const).map((pref) => (
                    <button
                      key={pref}
                      onClick={() => patch({ reducedMotionPref: pref })}
                      className={cn(
                        "rounded-lg py-2 text-xs font-medium transition-all",
                        settings.reducedMotionPref === pref
                          ? "border border-primary/30 bg-primary/10 text-primary"
                          : "border border-transparent text-muted-foreground hover:bg-foreground/5"
                      )}
                    >
                      {pref === "system" ? "Hệ thống" : pref === "on" ? "Giảm" : "Đầy đủ"}
                    </button>
                  ))}
                </div>
                <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground/70">
                  <Info className="mt-0.5 h-3 w-3 shrink-0" />
                  “Giảm” áp dụng khi hệ điều hành bật prefers-reduced-motion.
                </p>
              </div>

              {/* Trạng thái lưu */}
              <p className="text-right text-[11px] text-muted-foreground/60">
                {saving ? "Đang lưu…" : "Tự động lưu"}
              </p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
