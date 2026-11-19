// docs/APP-STORE.md içindeki mağaza metinlerinin karakter sınırlarını kontrol eder.
import { readFileSync } from 'node:fs';
const md = readFileSync(new URL('../docs/APP-STORE.md', import.meta.url), 'utf8');
const row = (label) => md.match(new RegExp(`\\| ${label}[^|]*\\| ([^|]+) \\|`))[1].trim();
const section = (h) => md.split(`### ${h}`)[1].split(/\n### |\n## /)[0].trim();
const checks = [
  ['Ad', row('Ad \\(en çok 30\\)'), 30],
  ['Alt başlık', row('Alt başlık \\(en çok 30\\)'), 30],
  ['Tanıtım metni', section('Tanıtım metni (en çok 170, sürüm göndermeden değiştirilebilir)'), 170],
  ['Anahtar kelimeler', section('Anahtar kelimeler (en çok 100, virgülle, boşluksuz)'), 100],
  ['Açıklama', section('Açıklama (en çok 4000)'), 4000],
];
let bad = 0;
for (const [name, text, max] of checks) {
  const n = [...text].length;
  console.log(`${n <= max ? '✓' : '✗'} ${name}: ${n}/${max}`);
  if (n > max) bad++;
}
const kw = section('Anahtar kelimeler (en çok 100, virgülle, boşluksuz)');
if (/\s/.test(kw)) { console.log('✗ Anahtar kelimelerde boşluk var'); bad++; }
process.exitCode = bad ? 1 : 0;
