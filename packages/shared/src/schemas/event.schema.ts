import { z } from 'zod';

/** Caps chosen so one batch stays comfortably under the 1 MB body limit. */
export const MAX_BATCH_SIZE = 250;
export const MAX_PROPERTY_KEYS = 40;
export const MAX_STRING_LENGTH = 1024;

export const eventKindSchema = z.enum(['pageview', 'track', 'identify', 'error']);

export const propertyValueSchema = z.union([
  z.string().max(MAX_STRING_LENGTH),
  z.number().finite(),
  z.boolean(),
  z.null(),
]);

export const eventPropertiesSchema = z
  .record(z.string().min(1).max(64), propertyValueSchema)
  .refine((o) => Object.keys(o).length <= MAX_PROPERTY_KEYS, {
    message: `at most ${MAX_PROPERTY_KEYS} properties per event`,
  });

/**
 * Only http(s). A bare `z.string().url()` also accepts `javascript:` and
 * `data:` URLs, which would let a client store a payload the dashboard then
 * renders as a link.
 */
export const httpUrlSchema = z
  .string()
  .url()
  .max(2048)
  .refine((value) => isHttpUrl(value), { message: 'url must use http or https' });

function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

export const incomingEventSchema = z.object({
  kind: eventKindSchema,
  name: z.string().min(1).max(128),
  anonymousId: z.string().min(8).max(128),
  userId: z.string().min(1).max(128).optional(),
  sessionId: z.string().min(8).max(128),
  timestamp: z.string().datetime({ offset: true }).optional(),
  url: httpUrlSchema.optional(),
  referrer: z.string().max(2048).optional(),
  properties: eventPropertiesSchema.optional(),
});

/**
 * The ingest envelope only.
 *
 * Events are deliberately left as `unknown` here: validating them at this
 * boundary would reject a 250-event batch over one malformed event. Each event
 * is parsed individually during ingestion with `incomingEventSchema`, so the
 * good ones are stored and the response reports which indices failed.
 */
export const ingestBodySchema = z.object({
  events: z.array(z.unknown()).min(1).max(MAX_BATCH_SIZE),
  /** Optional client SDK version, recorded for debugging. */
  sdk: z.string().max(64).optional(),
});

export type IngestBody = z.infer<typeof ingestBodySchema>;

/** Strict whole-batch validation, for a client that wants to check before sending. */
export const strictIngestBodySchema = ingestBodySchema.extend({
  events: z.array(incomingEventSchema).min(1).max(MAX_BATCH_SIZE),
});
