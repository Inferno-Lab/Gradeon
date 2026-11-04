import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { registerHttp } from '@gradeon/nest-kit';
import { migrate, pg } from '@gradeon/db';
import type { PoolManager, Registry } from '@gradeon/tenancy';
import { ConsoleModule } from './console.module.js';
import { loadEnv, type Env } from './env.js';

/** Brings the registry database up to date before anything reads it. Safe to run on every start. */
export async function prepareRegistry(env: Env): Promise<number> {
  const pool = new pg.Pool({ connectionString: env.REGISTRY_DATABASE_URL, max: 1, connectionTimeoutMillis: 20_000 });
  try {
    return (await migrate(pool, 'registry')).length;
  } finally {
    await pool.end();
  }
}

export async function createConsoleApp(env: Env = loadEnv(), shared?: { registry: Registry; pools: PoolManager }): Promise<NestFastifyApplication> {
  await prepareRegistry(env);
  const app = await NestFactory.create<NestFastifyApplication>(ConsoleModule.register(env, shared), new FastifyAdapter({ trustProxy: true, bodyLimit: 256_000 }), {
    logger: env.NODE_ENV === 'test' ? ['error'] : ['error', 'warn', 'log'],
  });
  await registerHttp(app, env);
  app.enableShutdownHooks();
  return app;
}
