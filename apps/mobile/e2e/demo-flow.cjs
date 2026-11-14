// Demo modunda uçtan uca akış testi. Kullanım:
//   npm run export:web -w mobile && npx serve -s apps/mobile/dist -l 8099   (ya da başka bir statik sunucu)
//   BASE_URL=${BASE} node apps/mobile/e2e/demo-flow.cjs
// SHOTS=1 verilirse ekran görüntüleri e2e/shots/ altına kaydedilir.
const {chromium}=require('playwright');
const path=require('path');
const BASE=process.env.BASE_URL||'${BASE}';
const assert=(cond,msg)=>{ if(!cond){ console.error('BAŞARISIZ:',msg); process.exitCode=1; } else console.log('✓',msg); };
(async()=>{
  const b=await chromium.launch();
  const p=await b.newPage({viewport:{width:390,height:844}});
  const errs=[];p.on('pageerror',e=>errs.push('PAGEERR '+e.message));p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE '+m.text())});
  p.on('dialog',d=>d.accept());
  const shot=async n=>{ if(process.env.SHOTS) await p.screenshot({path:path.join(__dirname,'shots',`${n}.png`)}); };
  await p.goto(`${BASE}/`);await p.waitForTimeout(2500);await shot('01-signin');
  // KVKK onayı olmadan dene
  await p.getByText('Demo ile gez').click();await p.waitForTimeout(400);
  assert(await p.getByText('aydınlatma metnini okuduğunu onayla').count()===1,'KVKK onayı olmadan giriş engelleniyor');
  await p.getByRole('switch',{name:'Aydınlatma metnini okudum'}).click();
  await p.getByText('Demo ile gez').click();await p.waitForTimeout(2000);await shot('02-home');
  assert(await p.getByText('Sıradaki işler').count()===1,'Ana sayfa hatırlatmaları gösteriyor');
  // bakım ekranı
  await p.getByText('Tümü').first().click();await p.waitForTimeout(1200);await shot('03-maint');
  assert(await p.getByText('44 gün gecikti').count()>0,'Gecikmiş bakım listeleniyor');
  // kural düzenle
  await p.getByText('Polen filtresi').last().click();await p.waitForTimeout(1000);await shot('04-rule');
  await p.goBack();await p.waitForTimeout(800);
  // işlem ekle: polen filtresi
  await p.getByText('Yapılan işlemi kaydet').last().click();await p.waitForTimeout(1000);
  await p.getByText('Polen filtresi',{exact:true}).last().click();
  await p.getByRole('textbox',{name:'Tutar (₺)'}).last().fill('340');
  await p.getByText('Kaydet',{exact:true}).last().click();await p.waitForTimeout(1200);await shot('05-maint-after');
  const stillOverdue = await p.getByText('44 gün gecikti').count();
  assert(stillOverdue===0,'İşlem kaydedilince gecikme kalkıyor');
  // yakıt ekranı
  await p.goto(`${BASE}/`);await p.waitForTimeout(1500);
  await p.getByText('Detay').first().click();await p.waitForTimeout(1200);await shot('06-fuel');
  // yakıt ekle: geriye km
  await p.getByText('Yakıt ekle').last().click();await p.waitForTimeout(1000);
  await p.getByRole('textbox',{name:'Kilometre'}).last().fill('140000');
  await p.getByRole('textbox',{name:'Miktar (L)'}).last().fill('40');
  await p.getByText('Kaydet',{exact:true}).last().click();await p.waitForTimeout(500);await shot('07-fuel-err');
  assert(await p.getByText(/önceki kayıttan/).count()===1,'Geriye giden kilometre reddediliyor');
  await p.getByRole('textbox',{name:'Kilometre'}).last().fill('149.400');
  await p.getByText('Kaydet',{exact:true}).last().click();await p.waitForTimeout(1200);
  assert(p.url().endsWith('/fuel'),'Geçerli yakıt kaydı kaydediliyor');
  // araç ekle doğrulama
  await p.goto(`${BASE}/vehicle/new`);await p.waitForTimeout(1500);
  await p.getByRole('textbox',{name:'Şasi numarası (isteğe bağlı)'}).fill('WF0XXXGCDXGO12345');
  await p.getByText('Garaja ekle').click();await p.waitForTimeout(500);await shot('08-new-err');
  assert(await p.getByText(/I, O ve Q/).count()===1 && await p.getByText('Markayı yaz ya da seç.').count()===1,'Araç formu hatalı şasi no ve eksik markayı yakalıyor');
  await p.getByText('Ford',{exact:true}).click();
  await p.getByRole('textbox',{name:'Model',exact:true}).fill('Transit Courier');
  await p.getByRole('textbox',{name:'Model yılı'}).fill('2020');
  await p.getByRole('textbox',{name:'Güncel kilometre'}).fill('86.300');
  await p.getByRole('textbox',{name:'Şasi numarası (isteğe bağlı)'}).fill('WF0XXXGCDXGA12345');
  await p.getByRole('textbox',{name:'Plaka (isteğe bağlı)'}).fill('34abc123');
  await p.getByText('Garaja ekle').click();await p.waitForTimeout(1500);await shot('09-new-maint');
  assert(p.url().endsWith('/maintenance'),'Araç eklenince bakım kurulumuna geçiliyor');
  // üçüncü araç -> plan sınırı
  await p.goto(`${BASE}/garage`);await p.waitForTimeout(1500);await shot('10-garage');
  assert(await p.getByText(/Araç sınırına ulaştın/).count()===1,'Ücretsiz planda 2 araç sınırı uygulanıyor');
  // profil
  await p.goto(`${BASE}/profile`);await p.waitForTimeout(1500);await shot('11-profile');
  // gösterge ışığı: fotoğraf (demo örnek sonucu) ve listeden seçme
  await p.goto(`${BASE}/lights`);await p.waitForTimeout(1500);
  await p.getByText('Yanıp sönüyor').click();
  const [chooser]=await Promise.all([p.waitForEvent('filechooser'), p.getByText('Galeriden seç').click()]);
  await chooser.setFiles(path.join(__dirname,'panel.jpg'));await p.waitForTimeout(2500);await shot('13-lights-result');
  assert(await p.getByText('Örnek sonuç · gerçek analiz değildir').count()===1,'Demo sonucu örnek olarak işaretli');
  assert(await p.getByText('Aracı kullanma',{exact:true}).count()>=1,'Yanıp sönen motor arıza lambası: aracı kullanma');
  await p.getByRole('radio',{name:'Sabit yanıyor'}).first().click();await p.waitForTimeout(300);
  assert(await p.getByText('Aracı kullanma',{exact:true}).count()===0 && await p.getByText('Sürebilirsin, kontrol ettir').count()>=1,'Sabit seçilince karar yumuşuyor');
  await p.getByText('Listeden seç').last().click();await p.waitForTimeout(500);
  await p.getByText('Kırmızı',{exact:true}).click();await p.waitForTimeout(300);
  await p.getByText('Yağ basıncı').click();await p.waitForTimeout(500);await shot('14-lights-oil');
  assert(await p.getByText('Aracı kullanma',{exact:true}).count()>=1 && await p.getByText(/motoru hemen durdur/).count()===1,'Listeden yağ basıncı: aracı kullanma');
  // claude.ai'de yayınlanmış sayfa: fotoğraf sayfanın Claude özelliğiyle analiz edilir (sahte "sample" ile)
  const p2=await b.newPage({viewport:{width:390,height:844}});
  const seen=[];p2.on('console',m=>{if(m.text().startsWith('SAMPLE_CALL'))seen.push(m.text())});
  await p2.addInitScript(()=>{
    const sample={
      limits: async()=>({maxPromptBytes:262144,images:{maxCount:5,maxInputBytes:20e6,mediaTypes:['image/jpeg']}}),
      json: async(input,opts)=>{ console.log('SAMPLE_CALL images='+(opts.images||[]).length+' tier='+opts.modelTier+' hasCatalog='+input.includes('- oil_pressure:'));
        return {image_quality:'ok',lights:[{catalog_id:'oil_pressure',color:'red',blinking:'unknown',confidence:'high',description:'Yağdanlık',meaning_if_unknown:''}]}; },
    };
    window.claude={use:async(n)=>n==='sample'?sample:null};
  });
  await p2.goto(`${BASE}/`);await p2.waitForTimeout(2000);
  await p2.getByRole('switch',{name:'Aydınlatma metnini okudum'}).click();await p2.getByText('Demo ile gez').click();await p2.waitForTimeout(1500);
  await p2.goto(`${BASE}/lights`);await p2.waitForTimeout(1500);
  assert(await p2.getByText(/Claude hesabıyla analiz edilir/).count()===1,'claude.ai görünümünde gerçek analiz açık');
  const [ch2]=await Promise.all([p2.waitForEvent('filechooser'), p2.getByText('Galeriden seç').click()]);
  await ch2.setFiles(path.join(__dirname,'panel.jpg'));await p2.waitForTimeout(2000);await p2.screenshot({path:path.join(__dirname,'shots','15-lights-live.png')}).catch(()=>{});
  assert(seen.length===1 && seen[0].includes('images=1') && seen[0].includes('tier=complex') && seen[0].includes('hasCatalog=true'),'Fotoğraf ve katalog Claude\'a gönderildi: '+seen.join());
  assert(await p2.getByText('Yağ basıncı',{exact:true}).count()===1 && await p2.getByText('Aracı kullanma',{exact:true}).count()>=1,'Claude\'un tanıdığı ışık katalog kararıyla gösteriliyor');
  assert(await p2.getByText('Örnek sonuç · gerçek analiz değildir').count()===0,'Gerçek analizde örnek etiketi yok');
  await p2.close();
  // Türkiye araçları: ceza, muayene, kaza (örnek Focus ile temiz oturum)
  { const p=await b.newPage({viewport:{width:390,height:844}}); p.on('pageerror',e=>errs.push('PAGEERR '+e.message));
  await p.goto(`${BASE}/`);await p.waitForTimeout(2000);
  await p.getByRole('switch',{name:'Aydınlatma metnini okudum'}).click();await p.getByText('Demo ile gez').click();await p.waitForTimeout(1500);
  assert(await p.getByText('Ceza indirimine 3 gün kaldı').count()===1,'Ana sayfada ceza indirimi uyarısı');
  assert(await p.getByText('Muayeneye 18 gün kaldı').count()===1,'Ana sayfada muayene hazırlığı uyarısı');
  await p.getByText('Ceza indirimine 3 gün kaldı').click();await p.waitForTimeout(1200);await shot('16-fines');
  assert(await p.getByText('1.625,25 ₺').count()>=1,'İndirimli tutar %25 düşük (2.167 → 1.625,25)');
  await p.getByText('Ceza ekle').last().click();await p.waitForTimeout(400);
  await p.getByRole('textbox',{name:'Ceza tarihi'}).last().fill('10.11.2026');
  await p.getByRole('textbox',{name:'Tebliğ tarihi'}).last().fill('05.11.2026');
  await p.getByRole('textbox',{name:'Tutar (₺)'}).last().fill('993');
  await p.getByText('Kaydet',{exact:true}).last().click();await p.waitForTimeout(400);
  assert(await p.getByText('Tebliğ tarihi ceza tarihinden önce olamaz.').count()===1,'Tebliğ ceza tarihinden önce olamaz');
  await p.getByText('Vazgeç',{exact:true}).last().click();await p.waitForTimeout(300);
  await p.getByText('Ödedim').last().click();await p.waitForTimeout(300);
  await p.getByText('Kaydet',{exact:true}).last().click();await p.waitForTimeout(1200);
  assert(await p.getByText('Ödenenler').count()===1 && await p.getByText('Ödenmemiş ceza yok').count()===1,'Ödenen ceza "Ödenenler"e geçiyor');
  await p.goto(`${BASE}/`);await p.waitForTimeout(1500);
  assert(await p.getByText(/Ceza indirimine/).count()===0,'Ödenince ana sayfa uyarısı kalkıyor');
  await p.getByText('Muayeneye 18 gün kaldı').click();await p.waitForTimeout(1200);
  await p.getByText('Arka park, plaka ve geri vites lambaları').click();await p.waitForTimeout(300);
  assert(await p.getByText('1 / 18 kontrol tamam').count()===1,'Muayene listesi işaretleniyor');
  await p.reload();await p.waitForTimeout(2000);await shot('17-inspection');
  assert(await p.getByText('1 / 18 kontrol tamam').count()===1,'Muayene işaretleri yeniden açınca korunuyor');
  await p.goto(`${BASE}/accident`);await p.waitForTimeout(1500);
  assert(await p.getByText(/112 · Acil çağrı/).count()===1,'Kaza asistanında 112 düğmesi');
  await p.getByText('Önce güvenlik').click();
  await p.getByRole('textbox',{name:'Plaka'}).last().fill('34 XYZ 99');await p.waitForTimeout(500);
  await p.reload();await p.waitForTimeout(2000);await shot('18-accident');
  assert(await p.getByRole('textbox',{name:'Plaka'}).last().inputValue()==='34 XYZ 99','Kaza notları yeniden açınca korunuyor');
  await p.close(); }
  // desktop width
  await p.setViewportSize({width:1280,height:900});await p.goto(`${BASE}/`);await p.waitForTimeout(1500);await shot('12-desktop');
  assert(errs.length===0,'Konsolda hata yok'+(errs.length?': '+errs.slice(0,3).join(' | '):''));
  await b.close();
})();
