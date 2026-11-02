import { Router } from 'express';

export const retiredLegacyRouter = Router();
retiredLegacyRouter.use(
  ['/analyze', '/action-plan', '/questionnaire', '/session', '/transcribe', '/analytics'],
  (_request, response) => {
    response.setHeader('cache-control', 'no-store');
    response.status(410).json({
      error: 'This legacy service has been retired',
      code: 'LEGACY_RETIRED',
    });
  },
);
