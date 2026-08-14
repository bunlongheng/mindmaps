import { Pool } from 'pg'

// One shared pool. TLS is verified ONLY when DATABASE_CA_CERT is provided; without
// a CA the connection stays encrypted but unverified (rejectUnauthorized:false).
// The managed Postgres this app uses does not expose a verifiable CA chain, so
// fail-closed would take prod down - set DATABASE_CA_CERT in the platform env to
// enable full verification.
const ca = process.env.DATABASE_CA_CERT
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false },
})
