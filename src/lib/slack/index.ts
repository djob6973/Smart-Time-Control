import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { query, execute } from "@/lib/db";

// ── Types ──────────────────────────────────────────────────────────────────

export interface SlackConfig {
  botToken:   string | null;
  channelId:  string | null;
  enabled:    boolean;
  autoNotify: boolean;
}

// ── DB helpers ─────────────────────────────────────────────────────────────

async function fetchConfig(): Promise<SlackConfig> {
  const rows = await query<{
    bot_token: string | null;
    channel_id: string | null;
    enabled: boolean;
    auto_notify: boolean;
  }>(`SELECT bot_token, channel_id, enabled, auto_notify FROM public.slack_config LIMIT 1`);

  if (rows.length === 0) {
    return { botToken: null, channelId: null, enabled: false, autoNotify: false };
  }
  const r = rows[0];
  return {
    botToken:   r.bot_token,
    channelId:  r.channel_id,
    enabled:    r.enabled,
    autoNotify: r.auto_notify,
  };
}

async function postSlackMessage(token: string, channel: string, text: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ channel, text }),
    });
    const json = await res.json() as { ok: boolean; error?: string };
    return json;
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "fetch error" };
  }
}

// ── Server functions ───────────────────────────────────────────────────────

export const getSlackConfig = createServerFn({ method: "GET" })
  .handler(async () => fetchConfig());

export const saveSlackConfig = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      botToken:   z.string().nullable(),
      channelId:  z.string().nullable(),
      enabled:    z.boolean(),
      autoNotify: z.boolean(),
    }),
  )
  .handler(async ({ data }) => {
    await execute(
      `INSERT INTO public.slack_config (bot_token, channel_id, enabled, auto_notify)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT ((true)) DO UPDATE
         SET bot_token   = EXCLUDED.bot_token,
             channel_id  = EXCLUDED.channel_id,
             enabled     = EXCLUDED.enabled,
             auto_notify = EXCLUDED.auto_notify,
             updated_at  = now()`,
      [data.botToken, data.channelId, data.enabled, data.autoNotify],
    );
  });

export const testSlackConnection = createServerFn({ method: "POST" })
  .inputValidator(z.object({ botToken: z.string(), channelId: z.string() }))
  .handler(async ({ data }) => {
    const result = await postSlackMessage(
      data.botToken,
      data.channelId,
      "✅ Conexión exitosa con *Smart Time Control*. Las notificaciones de Control de Jornada están activas.",
    );
    return result;
  });

// ── Jornada notification ───────────────────────────────────────────────────

const LABELS: Record<string, string> = {
  entrada:          "Entrada",
  salida_break:     "Break",
  regreso_break:    "Regreso de break",
  salida_almuerzo:  "Almuerzo",
  regreso_almuerzo: "Regreso de almuerzo",
  salida:           "Salida",
};

export const dispatchSlackJornada = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      tipo:         z.enum(["entrada", "salida_break", "regreso_break", "salida_almuerzo", "regreso_almuerzo", "salida"]),
      employeeName: z.string(),
      hora:         z.string(),
      areaName:     z.string().optional(),
    }),
  )
  .handler(async ({ data }) => {
    const cfg = await fetchConfig();
    if (!cfg.enabled || !cfg.botToken || !cfg.channelId) return;

    const label = LABELS[data.tipo] ?? data.tipo;
    const area  = data.areaName ? ` · ${data.areaName}` : "";
    const text  = `*${label}:* ${data.employeeName}${area} — ${data.hora}   <!subteam^S063DSM98AD>`;

    await postSlackMessage(cfg.botToken, cfg.channelId, text);
  });
