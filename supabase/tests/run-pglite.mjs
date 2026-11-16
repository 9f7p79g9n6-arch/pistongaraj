// Migration'ları ve erişim testlerini PGlite (Node içinde çalışan PostgreSQL) ile çalıştırır.
// PostgreSQL kurulu olmayan makinelerde (ör. Windows) `npm run db:test:local` ile kullanılır.
// run.sh ile aynı dosyaları aynı sırayla çalıştırır; psql'e özgü satırlar (\set, \echo, \g) burada çevrilir.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const db = await PGlite.create({ extensions: { pgcrypto } });

/** psql betiğini parçalara böler: her \echo bir başlık, aradaki SQL tek seferde çalışır. */
async function runPsqlScript(name, text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let buf = [];
  let title = null;
  const flush = async () => {
    const sql = buf.join('\n').trim();
    buf = [];
    if (!sql) return;
    try {
      await db.exec(sql);
    } catch (e) {
      throw new Error(`${name}${title ? ` → ${title}` : ''}: ${e.message}`);
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^\\set\b/.test(line)) continue;
    const echo = /^\\echo\s+'(.*)'\s*$/.exec(line);
    if (echo) {
      await flush();
      title = echo[1];
      console.log(`  ${title}`);
      continue;
    }
    buf.push(line.replace(/\s*\\g\s+\/dev\/null\s*$/, ';'));
  }
  await flush();
}

async function step(label, fn) {
  process.stdout.write(`→ ${label}\n`);
  await fn();
}

await step('Supabase taklidi', () => runPsqlScript('supabase_stub.sql', readFileSync(join(here, 'supabase_stub.sql'), 'utf8')));
for (const f of readdirSync(join(root, 'supabase/migrations')).filter((f) => f.endsWith('.sql')).sort()) {
  await step(f, () => runPsqlScript(f, readFileSync(join(root, 'supabase/migrations', f), 'utf8')));
}
await step('Bakım hesabı: SQL ile TypeScript aynı sonucu veriyor mu', () =>
  runPsqlScript('due-parity', execFileSync(process.execPath, [join(here, 'due-parity.mjs')], { encoding: 'utf8' })));
for (const f of readdirSync(here).filter((f) => f.endsWith('.test.sql')).sort()) {
  // Dosyalar aynı veritabanında alfabetik sırayla çalışır (run.sh ile aynı); her dosya kendi kullanıcı kimliklerini kullanır.
  await step(`Erişim (RLS) testleri: ${f}`, () => runPsqlScript(f, readFileSync(join(here, f), 'utf8')));
}
console.log('✓ Tüm veritabanı testleri geçti');
await db.close();
