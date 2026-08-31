import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../shared/schema.js';
import type { Database } from './db.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL is required for storage integration tests.');

export const storageTestPool = new Pool({ connectionString });
export const storageTestDatabase = drizzle(storageTestPool, { schema }) as unknown as Database;
