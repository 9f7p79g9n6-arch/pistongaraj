/**
 * Giriş: önce iki seçenek (Araç sahibi / İşletme), sonra aynı e-posta kodu ya da demo girişi.
 * İşletme seçilirse giriş sonrası uygulama OTOM SERVİS ile açılır (işletmesi yoksa "İşletme hesabı aç").
 */
import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Logo } from '@/components/brand';
import { Icon, type IconName } from '@/components/icons';
import { Button, Card, ErrorText, Field, Muted, Screen, Stack, Text, Toggle } from '@/components/ui';
import { colors, radius, shadow, space } from '@/constants/theme';
import { useBusiness, type AppMode } from '@/data/business-store';
import { RepoError } from '@/data/repo';
import { repo } from '@/data/store';
import { env } from '@/lib/env';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const OPTIONS: { mode: AppMode; icon: IconName; title: string; body: string }[] = [
  { mode: 'personal', icon: 'car', title: 'Araç sahibiyim', body: 'Bakım hatırlatmaları, yakıt, masraf ve servis kayıtların.' },
  { mode: 'business', icon: 'wrench', title: 'İşletmeyim', body: 'OTOM SERVİS: servis kaydı, müşteri, tahsilat ve ciro.' },
];

export default function SignIn() {
  const biz = useBusiness();
  const [mode, setMode] = useState<AppMode>('personal');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [kvkk, setKvkk] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const consents = async () => {
    await repo.recordConsent('kvkk_notice', true, env.kvkkTextVersion);
    await repo.recordConsent('marketing', marketing, env.kvkkTextVersion);
  };

  const act = async (fn: () => Promise<void>) => {
    setErr(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof RepoError ? e.message : 'Bir sorun oluştu. Tekrar dene.');
    } finally {
      setBusy(false);
    }
  };

  const sendCode = () => act(async () => {
    if (!kvkk) throw new RepoError('KVKK', 'Devam etmek için aydınlatma metnini okuduğunu onayla.');
    if (!EMAIL_RE.test(email.trim())) throw new RepoError('EMAIL', 'Geçerli bir e-posta adresi gir.');
    await repo.requestEmailCode(email.trim().toLowerCase());
    setStep('code');
  });

  // Seçilen mod giriş tamamlanmadan kaydedilir; giriş sonrası açılış ekranı buna göre seçilir
  const verify = () => act(async () => {
    if (!/^\d{6}$/.test(code.trim())) throw new RepoError('OTP', 'E-postana gelen 6 haneli kodu gir.');
    biz.setMode(mode);
    await repo.verifyEmailCode(email.trim().toLowerCase(), code.trim());
    await consents();
  });

  const demo = () => act(async () => {
    if (!kvkk) throw new RepoError('KVKK', 'Devam etmek için aydınlatma metnini okuduğunu onayla.');
    biz.setMode(mode);
    await repo.startDemo();
    await consents();
  });

  const chosen = OPTIONS.find((o) => o.mode === mode)!;

  return (
    <Screen>
      <View style={{ paddingTop: space.lg, gap: space.xl }}>
        <Logo size={34} />
        <View style={{ gap: space.sm }}>
          <Text v="display" accessibilityRole="header">Aracının bütün{'\n'}hayatı tek yerde.</Text>
          <Muted>Araç sahipleri ve servisler için. Nasıl kullanacağını seç.</Muted>
        </View>

        {step === 'email' ? (
          <Stack gap={space.md}>
            <View style={{ flexDirection: 'row', gap: space.md }} accessibilityRole="radiogroup">
              {OPTIONS.map((o) => {
                const on = o.mode === mode;
                return (
                  <Pressable key={o.mode} onPress={() => setMode(o.mode)} accessibilityRole="radio" accessibilityState={{ checked: on }}
                    accessibilityLabel={`${o.title}. ${o.body}`}
                    style={({ pressed }) => [{
                      flex: 1, backgroundColor: colors.card, borderRadius: radius.lg, padding: space.lg, gap: space.sm,
                      borderWidth: on ? 2 : 1, borderColor: on ? colors.brand : colors.line,
                    }, shadow, pressed && { opacity: 0.8 }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View style={{ width: 42, height: 42, borderRadius: 13, backgroundColor: on ? '#FDECEE' : colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                        <Icon name={o.icon} size={21} color={on ? colors.brand : colors.text} />
                      </View>
                      <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: on ? colors.brand : '#C5CAD1', alignItems: 'center', justifyContent: 'center' }}>
                        {on && <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brand }} />}
                      </View>
                    </View>
                    <Text v="bodyStrong">{o.title}</Text>
                    <Muted small>{o.body}</Muted>
                  </Pressable>
                );
              })}
            </View>

            <Card style={{ gap: space.sm }}>
              {!env.isDemo && (
                <Field label="E-posta" value={email} onChangeText={setEmail} placeholder="ornek@eposta.com"
                  autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
              )}
              <Toggle label="Aydınlatma metnini okudum" hint="Kişisel verilerin KVKK kapsamında işlenir." value={kvkk} onChange={(v) => { setKvkk(v); if (v) setErr(null); }} />
              <Link href="/legal/kvkk" asChild>
                <Pressable accessibilityRole="link"><Text v="smallStrong" color={colors.brandDark}>KVKK aydınlatma metnini oku</Text></Pressable>
              </Link>
              <Toggle label="Kampanya ve haber bildirimleri" hint="İsteğe bağlı. İstediğin zaman kapatabilirsin." value={marketing} onChange={setMarketing} />
            </Card>

            <ErrorText>{err}</ErrorText>
            {env.isDemo ? (
              <>
                <Button title={mode === 'business' ? 'İşletme olarak demo ile gez' : 'Demo ile gez'} variant="primary" onPress={demo} loading={busy} />
                <Muted small>Bu sürüm sunucuya bağlı değil. Girdiğin veriler yalnızca bu cihazda saklanır. Örnek araç ve kayıtlar “örnek” olarak işaretlidir.</Muted>
              </>
            ) : (
              <Button title="Giriş kodu gönder" variant="primary" onPress={sendCode} loading={busy} />
            )}
            <Muted small style={{ textAlign: 'center' }}>Aynı hesapla iki tarafı da kullanabilirsin; Profil’den geçiş yaparsın.</Muted>
          </Stack>
        ) : (
          <Card style={{ gap: space.md }}>
            <Muted small>{chosen.title}</Muted>
            <Muted>{email} adresine 6 haneli bir kod gönderdik.</Muted>
            <Field label="Doğrulama kodu" value={code} onChangeText={setCode} placeholder="123456" keyboardType="number-pad"
              maxLength={6} autoComplete="one-time-code" textContentType="oneTimeCode" />
            <ErrorText>{err}</ErrorText>
            <Button title="Giriş yap" variant="primary" onPress={verify} loading={busy} />
            <Button title="E-postayı değiştir" variant="ghost" onPress={() => { setStep('email'); setCode(''); setErr(null); }} />
          </Card>
        )}
      </View>
    </Screen>
  );
}
