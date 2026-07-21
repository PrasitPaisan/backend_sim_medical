import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

// Every service instantiates its own Pool (no shared DB module in this
// codebase) with identical connection config — centralized here so the
// SSL handling below only needs to exist once. Managed Postgres providers
// (Supabase, RDS, etc.) require SSL; the local Docker Postgres used in dev
// doesn't offer it at all, so this is opt-in via DB_SSL rather than always
// on. rejectUnauthorized: false because these providers' certs commonly
// aren't in Node's default trust store — this still encrypts the
// connection, it just doesn't verify the server cert chain.
export function createPool(config: ConfigService): Pool {
  const sslEnabled = ['true', '1'].includes(
    (config.get<string>('DB_SSL') ?? '').toLowerCase(),
  );

  return new Pool({
    host: config.get<string>('DB_HOST') ?? 'localhost',
    port: Number(config.get<number>('DB_PORT') ?? 5432),
    user: config.get<string>('DB_USER') ?? 'postgres',
    password: config.get<string>('DB_PASSWORD') ?? 'postgres',
    database: config.get<string>('DB_NAME') ?? 'electronic_shell',
    ssl: sslEnabled ? { rejectUnauthorized: false } : undefined,
  });
}
