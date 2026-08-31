/** Better Auth CLI entrypoint; runtime code continues to initialize lazily. */
import { getAuth } from './auth.js';

export const auth = getAuth();
