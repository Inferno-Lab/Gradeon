#!/usr/bin/env bash
# Local development: wipe and restart the database and the server, then create the Greenfield demo school.
# Needs `pnpm install` and a built workspace (`pnpm build`) once. The admin runs separately: `pnpm --filter @gradeon/admin dev`.
set -e
cd "$(dirname "$0")/.."
powershell.exe -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { \$_.CommandLine -like '*${PWD##*/}*' -and \$_.Name -in 'postgres.exe','node.exe' -and \$_.CommandLine -notlike '*vite*' -and \$_.CommandLine -notlike '*claude*' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force -ErrorAction SilentlyContinue }" >/dev/null 2>&1 || true
# Linux and macOS (CI): the same stop, by command line.
command -v powershell.exe >/dev/null 2>&1 || { pkill -f "tsx src/dev-cli.ts"; pkill -f "tsx src/main.ts"; pkill -x postgres; } >/dev/null 2>&1 || true
sleep 2
rm -rf .gradeon-data
[ -f .env ] || cp .env.example .env
(cd packages/db && GRADEON_PG_DIR="$PWD/../../.gradeon-data/pg" GRADEON_PG_PORT=54329 nohup npx tsx src/dev-cli.ts > /tmp/pg.log 2>&1 &)
for i in $(seq 1 30); do grep -q ready /tmp/pg.log 2>/dev/null && break; sleep 1; done
(cd packages/db && node -e "import('pg').then(async ({default:pg})=>{const c=new pg.Client({connectionString:'postgres://gradeon:gradeon@127.0.0.1:54329/postgres'});await c.connect();await c.query('create database registry');await c.end()})")
(cd apps/server && set -a && . ../../.env && set +a && nohup npx tsx src/main.ts > /tmp/server.log 2>&1 &)
for i in $(seq 1 40); do curl -s localhost:4000/health >/dev/null 2>&1 && break; sleep 1; done
node tools/provision-demo.mjs
