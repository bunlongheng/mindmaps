import { Pool } from 'pg'

// One shared pool. TLS is verified when DATABASE_CA_CERT is provided (production);
// without a CA it falls back to permissive TLS for local/dev where no cert is available.
const ca = process.env.DATABASE_CA_CERT

// Fail closed in prod: an unverified DB connection (rejectUnauthorized:false) accepts any
// certificate, which is a live MITM exposure. Local/preview stay permissive since a dev
// Postgres instance usually has no CA to provide.
if (process.env.VERCEL_ENV === 'production' && !ca) {
  throw new Error('DATABASE_CA_CERT is required in production - refusing to start with unverified DB TLS.')
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false },
})
