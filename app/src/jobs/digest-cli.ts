/** §5 digest, dry-run CLI. Telegram delivery activates when KUPA_TELEGRAM_TOKEN + chat ids exist. */
import { openDb } from '../lib/db.ts';
import { buildWeeklyDigest, buildMonthlyClose } from './digest.ts';

const db = openDb(process.env.KUPA_DB ?? './data/kupa.db');
const weekly = buildWeeklyDigest(db);
const monthly = buildMonthlyClose(db);
console.log('--- weekly ---');
console.log(weekly ?? '(silence — nothing crossed a threshold, and silence is information)');
console.log('--- monthly close ---');
console.log(monthly ?? '(no closed month yet)');
