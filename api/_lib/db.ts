import { Pool } from 'pg'

// One shared pool. TLS is verified when DATABASE_CA_CERT is provided (production);
// without a CA it falls back to permissive TLS for local/dev where no cert is available.
const ca = process.env.DATABASE_CA_CERT
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: ca ? { ca, rejectUnauthorized: true } : { rejectUnauthorized: false },
})
