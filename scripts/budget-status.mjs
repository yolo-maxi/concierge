// This command reads counters only. Run it as the service user.
import { DatabaseSync } from 'node:sqlite';
const path = process.argv[2];
if (!path) throw new Error('Supply the service budget database path.');
const db = new DatabaseSync(path, { readOnly: true });
console.log(JSON.stringify({ budget: db.prepare('SELECT start, requests, volume, blocked, until FROM budget WHERE id=1').get(), alerts: db.prepare('SELECT event, start, status FROM alerts ORDER BY event').all() }));
db.close();
