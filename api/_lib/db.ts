import { Pool } from 'pg'

// One shared pool. TLS is verified when DATABASE_CA_CERT is provided;
// on ANY Vercel deployment (production AND preview) a missing CA fails CLOSED
// (verification stays on, connections to an unverifiable server fail) - permissive
// TLS is only for truly local dev where no cert is available.
const ca = process.env.DATABASE_CA_CERT
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: ca
    ? { ca, rejectUnauthorized: true }
    : process.env.VERCEL
      ? { rejectUnauthorized: true }
      : { rejectUnauthorized: false },
})
