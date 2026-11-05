-- kind: expand
-- The statement and idle-transaction limits move from the connection string into the database's own defaults, so they still
-- apply through a connection pooler (poolers drop startup options). Long jobs (migrations, backups) lift them for their transaction.
DO $$ BEGIN
  EXECUTE format('ALTER DATABASE %I SET statement_timeout = 15000', current_database());
  EXECUTE format('ALTER DATABASE %I SET idle_in_transaction_session_timeout = 10000', current_database());
END $$;
