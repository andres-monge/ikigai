import { createAuthClient } from 'better-auth/react';

/** Same-origin client: sessions and OAuth state remain HttpOnly server cookies. */
export const authClient = createAuthClient();
