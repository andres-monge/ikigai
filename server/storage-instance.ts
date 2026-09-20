/** Live application storage singleton. Operator tooling must inject its own database. */
import { db } from './db.js';
import { PostgresStorage, type IStorage } from './storage.js';

export const storage: IStorage = new PostgresStorage({ database: db });
