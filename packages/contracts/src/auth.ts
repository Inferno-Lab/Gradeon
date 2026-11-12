import { z } from 'zod';
import { Permission } from './permissions.js';

export const ClientKind = z.enum(['web', 'mobile']);
export type ClientKind = z.infer<typeof ClientKind>;

export const LoginRequest = z.object({
  identifier: z.string().trim().min(3, 'Enter your email or phone').max(120),
  password: z.string().min(1, 'Enter your password').max(200),
  client: ClientKind.optional(),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

/** Step one succeeds with a challenge; the code goes to the user's phone or email (or the sandbox inbox on test). */
export const LoginChallenge = z.object({
  challengeId: z.string(),
  channel: z.enum(['sms', 'email']),
  maskedTo: z.string(),
  expiresInSeconds: z.number().int(),
  /** Present only on schools in demo mode, so the sign-in page can offer to fill it in. */
  demoCode: z.string().optional(),
});
export type LoginChallenge = z.infer<typeof LoginChallenge>;

export type LoginResponse =
  | { step: 'otp'; challenge: LoginChallenge }
  | { step: 'done'; tokens: TokenPair };

export const VerifyRequest = z.object({
  challengeId: z.string().min(1),
  code: z.string().regex(/^\d{6}$/, 'The code is 6 digits'),
  client: ClientKind.optional(),
});
export type VerifyRequest = z.infer<typeof VerifyRequest>;

/** Families sign in with a code alone: no password to forget. Staff always need their password first. */
export const CodeRequest = z.object({
  identifier: z.string().trim().min(3, 'Enter your phone number or email').max(120),
  client: ClientKind.optional(),
});
export type CodeRequest = z.infer<typeof CodeRequest>;

export const ResetStart = z.object({ identifier: z.string().trim().min(3, 'Enter your email or phone').max(120) });
export type ResetStart = z.infer<typeof ResetStart>;

/** A signed-in person changes their own password. */
export const PasswordChange = z.object({ current: z.string().min(1, 'Type your current password').max(200), next: z.string().min(8, 'Use at least 8 characters').max(200) });
export type PasswordChange = z.infer<typeof PasswordChange>;

export const ResetFinish = z.object({
  challengeId: z.string().min(1),
  code: z.string().regex(/^\d{6}$/, 'The code is 6 digits'),
  password: z.string().min(8, 'Use at least 8 characters').max(200),
});
export type ResetFinish = z.infer<typeof ResetFinish>;

export const RefreshRequest = z.object({
  refreshToken: z.string().min(20).optional(),
  client: ClientKind.optional(),
});
export type RefreshRequest = z.infer<typeof RefreshRequest>;

export interface SessionUser {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  initials: string;
  roles: string[];
  roleNames: string[];
  permissions: Permission[];
}

export interface TokenPair {
  accessToken: string;
  /** Present for the phone app. The websites keep the refresh token in an httpOnly cookie instead. */
  refreshToken?: string;
  expiresInSeconds: number;
  user: SessionUser;
}

export interface AccessClaims {
  sub: string;
  /** School slug (school tokens) or "console" for control-plane tokens. */
  aud: string;
  sid: string;
  name: string;
  perms: string[];
  /** users.token_version at issue time. A bump (role, password, logout-all) ends the token. */
  ver?: number;
  support?: boolean;
  /** "guardian" tokens may only use the family app's routes. Absent on older tokens and console tokens. */
  kind?: 'staff' | 'guardian' | 'student';
}
