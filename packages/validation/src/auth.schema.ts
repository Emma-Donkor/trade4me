import { z } from 'zod';
import { nonEmptyString } from './common.schema';

const emailSchema = z.email();

/** README §8.2 auth endpoints. All inputs reject unknown keys (§P05 security). */
export const registerSchema = z.strictObject({
  email: emailSchema,
  password: z.string().min(8).max(128),
  name: nonEmptyString.max(120).optional(),
});

export const loginSchema = z.strictObject({
  email: emailSchema,
  password: nonEmptyString.max(128),
});

export const refreshSchema = z.strictObject({
  refreshToken: nonEmptyString.optional(),
});

export const logoutSchema = z.strictObject({
  refreshToken: nonEmptyString.optional(),
});

export const verifyEmailSchema = z.strictObject({
  token: nonEmptyString,
});

export const forgotPasswordSchema = z.strictObject({
  email: emailSchema,
});

export const resetPasswordSchema = z.strictObject({
  token: nonEmptyString,
  password: z.string().min(8).max(128),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
