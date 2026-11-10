import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { registerHttp } from '@gradeon/nest-kit';
import type { PoolManager, Registry } from '@gradeon/tenancy';
import { AppModule } from './app.module.js';
import { loadEnv, type Env } from './env.js';

/** Builds the school API. The console server passes its own registry and pools so both share one set of connections. */
export async function createApp(env: Env = loadEnv(), shared?: { registry: Registry; pools: PoolManager }): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule.register(env, shared),
    new FastifyAdapter({ trustProxy: true, bodyLimit: 256_000, routerOptions: { maxParamLength: 2048 } }),
    { logger: env.NODE_ENV === 'test' ? ['error'] : ['error', 'warn', 'log'], rawBody: true },
  );
  await registerHttp(app, env);
  app.enableShutdownHooks();
  return app;
}
