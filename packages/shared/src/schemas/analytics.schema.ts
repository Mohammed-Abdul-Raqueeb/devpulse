import { z } from 'zod';

export const granularitySchema = z.enum(['hour', 'day', 'week', 'month']);

export const metricSchema = z.enum([
  'events',
  'visitors',
  'sessions',
  'bounceRate',
  'avgSessionSeconds',
]);

/** Accepts both `2026-01-01` and a full ISO timestamp; the service normalises. */
const dateInput = z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'invalid date');

export const timeRangeSchema = z
  .object({ from: dateInput, to: dateInput })
  .refine((r) => Date.parse(r.from) < Date.parse(r.to), {
    message: '`from` must be before `to`',
    path: ['from'],
  });

export const metricQuerySchema = timeRangeSchema.and(
  z.object({
    metric: metricSchema,
    granularity: granularitySchema.default('day'),
    filters: z.record(z.string().max(64), z.string().max(256)).optional(),
  }),
);

export const breakdownQuerySchema = timeRangeSchema.and(
  z.object({
    dimension: z.enum(['url', 'referrer', 'country', 'device', 'browser', 'os', 'name']),
    limit: z.coerce.number().int().min(1).max(100).default(10),
  }),
);

export const funnelQuerySchema = timeRangeSchema.and(
  z.object({
    steps: z
      .array(z.object({ name: z.string().min(1).max(80), eventName: z.string().min(1).max(128) }))
      .min(2)
      .max(8),
    windowDays: z.coerce.number().int().min(1).max(90).default(7),
  }),
);

export type MetricQueryInput = z.infer<typeof metricQuerySchema>;
export type BreakdownQueryInput = z.infer<typeof breakdownQuerySchema>;
export type FunnelQueryInput = z.infer<typeof funnelQuerySchema>;
