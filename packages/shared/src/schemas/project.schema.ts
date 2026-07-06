import { z } from 'zod';

export const slugSchema = z
  .string()
  .min(2)
  .max(48)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be lowercase words separated by hyphens');

export const originSchema = z
  .string()
  .max(255)
  .refine((v) => v === '*' || /^https?:\/\/[^/]+$/.test(v), {
    message: 'origin must be "*" or a scheme + host with no path',
  });

export const createProjectSchema = z.object({
  name: z.string().min(2).max(80),
  slug: slugSchema.optional(),
  allowedOrigins: z.array(originSchema).max(20).default([]),
  retentionDays: z.number().int().min(1).max(3650).default(365),
});

export const updateProjectSchema = createProjectSchema.partial().omit({ slug: true });

export type CreateProjectBody = z.infer<typeof createProjectSchema>;
export type UpdateProjectBody = z.infer<typeof updateProjectSchema>;
