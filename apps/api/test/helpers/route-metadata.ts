import { RequestMethod, type Type } from '@nestjs/common';
import type { TestingModule } from '@nestjs/testing';
import { COOKIE_AUTH_KEY } from '../../src/common/decorators/cookie-auth';
import { IS_PUBLIC_KEY } from '../../src/common/decorators/public';
import { ROLES_KEY } from '../../src/common/decorators/roles';
import {
  normalizePath,
  type HttpMethod,
  type RouteAuth,
} from '../../src/common/openapi/route-catalog';
import type { ContractRoute } from './readme-contract';

// Nest 11 no longer re-exports these metadata keys from `@nestjs/common`.
const METHOD_METADATA = 'method';
const PATH_METADATA = 'path';

const METHOD_BY_ENUM: Record<number, HttpMethod | undefined> = {
  [RequestMethod.GET]: 'get',
  [RequestMethod.POST]: 'post',
  [RequestMethod.PATCH]: 'patch',
  [RequestMethod.DELETE]: 'delete',
};

interface ControllerWrapper {
  instance?: object;
  metatype?: Type<unknown>;
}

interface NestModuleLike {
  controllers?: Map<unknown, ControllerWrapper>;
  _controllers?: Map<unknown, ControllerWrapper>;
}

interface ContainerWithModules {
  container: { getModules(): Map<string, NestModuleLike> };
}

function authOf(handler: object, metatype: Type<unknown>): RouteAuth {
  if (
    Reflect.getMetadata(COOKIE_AUTH_KEY, handler) ||
    Reflect.getMetadata(COOKIE_AUTH_KEY, metatype)
  ) {
    return 'Cookie';
  }
  if (Reflect.getMetadata(IS_PUBLIC_KEY, handler) || Reflect.getMetadata(IS_PUBLIC_KEY, metatype)) {
    return 'Public';
  }
  const roles =
    Reflect.getMetadata(ROLES_KEY, handler) ?? Reflect.getMetadata(ROLES_KEY, metatype) ?? [];
  if (roles.includes('ADMIN')) return 'ADMIN';
  if (roles.includes('ANALYST')) return 'ANALYST';
  return 'Bearer';
}

/** Reads live Nest metadata rather than trusting a hand-written route list. */
export function liveRoutes(moduleRef: TestingModule): ContractRoute[] {
  const modules = (moduleRef as unknown as ContainerWithModules).container.getModules();
  const routes: ContractRoute[] = [];

  for (const module of modules.values()) {
    const controllers = module._controllers ?? module.controllers;
    for (const wrapper of controllers?.values() ?? []) {
      const instance = wrapper.instance;
      const metatype =
        wrapper.metatype ??
        (instance ? (Object.getPrototypeOf(instance).constructor as Type<unknown>) : undefined);
      if (!metatype) continue;
      const controllerPath = String(Reflect.getMetadata(PATH_METADATA, metatype) ?? '/');
      const prototype = metatype.prototype as Record<string, object>;

      for (const name of Object.getOwnPropertyNames(prototype)) {
        if (name === 'constructor') continue;
        const handler = prototype[name];
        if (typeof handler !== 'function') continue;
        const method = METHOD_BY_ENUM[Reflect.getMetadata(METHOD_METADATA, handler) as number];
        const routePath = Reflect.getMetadata(PATH_METADATA, handler);
        if (!method || routePath === undefined) continue;

        routes.push({
          method,
          path: normalizePath(`${controllerPath}/${String(routePath)}`),
          auth: authOf(handler, metatype),
        });
      }
    }
  }
  return routes;
}
