// packages/core'daki ortak test vakalarından SQL üretir: public.compute_due aynı sonucu vermeli.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const cases = JSON.parse(readFileSync(join(here, '../../packages/core/test/fixtures/due-cases.json'), 'utf8'));
const lit = (v) => (v == null ? 'null' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

let sql = '\\set ON_ERROR_STOP 1\n';
for (const c of cases) {
  const r = c.rule;
  const e = c.expect;
  sql += `do $$ declare d record; begin
  select * into d from public.compute_due(${lit(r.kind)}::public.rule_kind, ${lit(r.everyKm)}, ${lit(r.everyMonths)}, ${lit(r.lastDoneKm)},
    ${lit(r.lastDoneOn)}::date, ${lit(r.dueOn)}::date, ${lit(r.remindBeforeKm)}, ${lit(r.remindBeforeDays)}, ${lit(c.odometer)}, ${lit(c.today)}::date);
  if d.status is distinct from ${lit(e.status)} or d.next_due_km is distinct from ${lit(e.nextDueKm)}::int
     or d.next_due_on is distinct from ${lit(e.nextDueOn)}::date or d.km_left is distinct from ${lit(e.kmLeft)}::int
     or d.days_left is distinct from ${lit(e.daysLeft)}::int then
    raise exception 'Uyuşmazlık [%]: %', ${lit(c.name)}, row_to_json(d);
  end if;
end $$;\n`;
}
sql += `\\echo '  ${cases.length} vaka eşleşti'\n`;
process.stdout.write(sql);
