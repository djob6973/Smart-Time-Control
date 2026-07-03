import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { query, execute } from "@/lib/db";

export interface CustomHoliday {
  date: string;        // YYYY-MM-DD
  is_holiday: boolean; // true = forzar festivo, false = forzar NO festivo
  description: string;
  created_at: string;
  updated_at: string;
}

export const getCustomHolidays = createServerFn({ method: "GET" })
  .handler(async () => {
    return query<CustomHoliday>(
      `SELECT date::text, is_holiday, description, created_at, updated_at
       FROM public.custom_holidays
       ORDER BY date ASC`,
    );
  });

export const upsertCustomHoliday = createServerFn({ method: "POST" })
  .inputValidator(z.object({
    date:        z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    is_holiday:  z.boolean(),
    description: z.string().max(200).default(""),
  }))
  .handler(async ({ data }) => {
    await execute(
      `INSERT INTO public.custom_holidays (date, is_holiday, description)
       VALUES ($1, $2, $3)
       ON CONFLICT (date) DO UPDATE
         SET is_holiday  = EXCLUDED.is_holiday,
             description = EXCLUDED.description,
             updated_at  = NOW()`,
      [data.date, data.is_holiday, data.description],
    );
  });

export const deleteCustomHoliday = createServerFn({ method: "POST" })
  .inputValidator(z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }))
  .handler(async ({ data }) => {
    await execute(
      `DELETE FROM public.custom_holidays WHERE date = $1`,
      [data.date],
    );
  });

/** Carga todos los overrides como un Map<fecha, is_holiday> para uso en el motor. */
export const loadHolidayOverrides = createServerFn({ method: "GET" })
  .handler(async () => {
    const rows = await query<{ date: string; is_holiday: boolean }>(
      `SELECT date::text, is_holiday FROM public.custom_holidays`,
    );
    return Object.fromEntries(rows.map((r) => [r.date, r.is_holiday]));
  });
