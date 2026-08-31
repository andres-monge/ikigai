import type { MethodModule } from '../../../shared/career-map/selector.js';

export interface MethodModuleRegistration {
  readonly key: MethodModule;
  readonly directory: string;
  readonly contentVersion: string;
}

export const METHOD_MODULE_REGISTRY = {
  'form-foundation': {
    key: 'form-foundation',
    directory: 'form-foundation',
    contentVersion: '1.0.2',
  },
  'create-purpose-paths': {
    key: 'create-purpose-paths',
    directory: 'create-purpose-paths',
    contentVersion: '1.0.2',
  },
  'design-path-project': {
    key: 'design-path-project',
    directory: 'design-path-project',
    contentVersion: '1.0.1',
  },
} as const satisfies Partial<Record<MethodModule, MethodModuleRegistration>>;

export type RegisteredMethodModuleKey = keyof typeof METHOD_MODULE_REGISTRY;

export const METHOD_MODULE_KEYS = Object.freeze(
  Object.keys(METHOD_MODULE_REGISTRY) as RegisteredMethodModuleKey[],
);

export function isRegisteredMethodModule(
  module: MethodModule | string,
): module is RegisteredMethodModuleKey {
  return Object.prototype.hasOwnProperty.call(METHOD_MODULE_REGISTRY, module);
}
