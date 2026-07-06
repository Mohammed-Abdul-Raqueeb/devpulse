import { z } from 'zod';

/** Minimum length only. Composition rules push users toward predictable passwords. */
export const passwordSchema = z.string().min(10).max(200);

export const registerSchema = z.object({
  email: z.string().email().max(255).toLowerCase(),
  name: z.string().min(2).max(80),
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: z.string().email().max(255).toLowerCase(),
  password: z.string().min(1).max(200),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(16),
});

export type RegisterBody = z.infer<typeof registerSchema>;
export type LoginBody = z.infer<typeof loginSchema>;
