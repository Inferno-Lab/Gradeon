import 'reflect-metadata';
import { AppModule, loadEnv as loadApiEnv } from '@gradeon/api';
import { ConsoleModule, loadEnv as loadConsoleEnv, prepareRegistry } from '@gradeon/console-api';
import { ApiExceptionFilter, registerHttp } from '@gradeon/nest-kit';
import { poolManagerFromEnv, Registry } from '@gradeon/tenancy';
import { ConsoleLogger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { serveFrontends } from './static.js';

/**
 * One process for the test track and small installs: the school API and the console API side by side,
 * sharing one registry connection and one set of school pools. Large installs run them apart.
 */
const apiEnv = loadApiEnv();
const consoleEnv = loadConsoleEnv();
await prepareRegistry(consoleEnv);
const shared = { registry: new Registry({ url: apiEnv.REGISTRY_DATABASE_URL, secret: apiEnv.SECRETS_KEY }), pools: poolManagerFromEnv() };

@Module({ imports: [AppModule.register(apiEnv, shared), ConsoleModule.register(consoleEnv, shared)] })
class ServerModule {}

const app = await NestFactory.create<NestFastifyApplication>(ServerModule, new FastifyAdapter({ trustProxy: true, bodyLimit: 256_000 }), {
  // JSON lines in production, so the host's log search can filter by school and request; readable text locally.
  logger: new ConsoleLogger({ json: apiEnv.NODE_ENV === 'production', logLevels: ['error', 'warn', 'log'] }),
});
app.useGlobalFilters(new ApiExceptionFilter());
await registerHttp(app, apiEnv);
const served = await serveFrontends(app);
app.enableShutdownHooks();
await app.listen(apiEnv.PORT, apiEnv.HOST);
if (served.length) console.log(`Serving the admin and console from this process: ${served.join(' ')}`);
