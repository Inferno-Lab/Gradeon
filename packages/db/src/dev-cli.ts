import { startDevPostgres } from './dev.js';

const dir = process.env.GRADEON_PG_DIR ?? '.gradeon-data/pg';
const server = await startDevPostgres({ dataDir: dir, port: Number(process.env.GRADEON_PG_PORT ?? 54329) });
console.log(`PostgreSQL ready: ${server.url}`);
const stop = () => void server.stop().then(() => process.exit(0));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => undefined, 1 << 30);
