/** Roles are coarse on purpose: a project is either read-only or fully managed. */
export type Role = 'owner' | 'admin' | 'viewer';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: string;
}

/** A user record including the password hash. Never leaves the API layer. */
export interface UserWithSecret extends User {
  passwordHash: string;
}

/** Decoded JWT payload. */
export interface AuthClaims {
  sub: string;
  email: string;
  role: Role;
  iat: number;
  exp: number;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}
