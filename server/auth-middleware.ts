import type { Request, RequestHandler, Response } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import {
  AuthConfigurationError,
  getAuth,
  type RevelioAuth,
} from './auth.js';

export interface ProtectedIdentity {
  userId: string;
  email: string;
  name: string;
  image: string | null;
}

type SessionReader = Pick<RevelioAuth, 'api'>;

export async function resolveProtectedIdentity(
  request: Pick<Request, 'headers'>,
  auth: SessionReader = getAuth(),
): Promise<Readonly<ProtectedIdentity> | null> {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(request.headers),
  });

  if (!session?.user?.id) {
    return null;
  }

  return Object.freeze({
    userId: session.user.id,
    email: session.user.email,
    name: session.user.name,
    image: session.user.image ?? null,
  });
}

export function requireAuthWith(
  resolveAuth: () => SessionReader,
): RequestHandler {
  return async (request, response, next) => {
    try {
      const identity = await resolveProtectedIdentity(request, resolveAuth());
      if (!identity) {
        response.status(401).json({ error: 'Authentication required' });
        return;
      }

      response.locals.auth = identity;
      next();
    } catch (error) {
      if (error instanceof AuthConfigurationError) {
        response.status(503).json({ error: 'Authentication is unavailable' });
        return;
      }
      next(error);
    }
  };
}

export const requireAuth = requireAuthWith(getAuth);

export function getProtectedIdentity(
  response: Pick<Response, 'locals'>,
): Readonly<ProtectedIdentity> {
  const identity = response.locals.auth as Readonly<ProtectedIdentity> | undefined;
  if (!identity) {
    throw new Error('Protected identity was read before requireAuth');
  }
  return identity;
}
