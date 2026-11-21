import { SetMetadata } from '@nestjs/common';

export const COOKIE_AUTH_KEY = 'phase7:cookie-auth';

/** Marks routes whose credential is the httpOnly refresh cookie, not a bearer token. */
export const CookieAuth = () => SetMetadata(COOKIE_AUTH_KEY, true);
