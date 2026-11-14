import { Link } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { CarArt } from '@/components/vehicle';
import { Button, ErrorText, Field, Muted, Screen, Stack, Text, Toggle } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { RepoError } from '@/data/repo';
import { repo } from '@/data/store';
import { env } from '@/lib/env';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function SignIn() {
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

  const verify = () => act(async () => {
    if (!/^\d{6}$/.test(code.trim())) throw new RepoError('OTP', 'E-postana gelen 6 haneli kodu gir.');
    await repo.verifyEmailCode(email.trim().toLowerCase(), code.trim());
    await consents();
  });

  const demo = () => act(async () => {
    if (!kvkk) throw new RepoError('KVKK', 'Devam etmek için aydınlatma metnini okuduğunu onayla.');
    await repo.startDemo();
    await consents();
  });

  return (
    <Screen>
        <View style={{ paddingTop: space.xl, gap: space.xl }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}>
            <View style={{ width: 36, height: 36, borderRadius: 9, backgroundColor: colors.neon, alignItems: 'center', justifyContent: 'center' }}>
              <Text v="title" color={colors.onNeon}>P</Text>
            </View>
            <Text v="section" style={{ letterSpacing: 2 }}>PISTON GARAGE</Text>
          </View>
          <View style={{ gap: space.sm }}>
            <Text v="display" accessibilityRole="header">Aracının bütün{'\n'}hayatı tek yerde.</Text>
            <Muted>Bakım hatırlatmaları, yakıt ve masraf takibi. Parça pazarı ve servisler yakında.</Muted>
          </View>
          <CarArt />

          <Stack gap={space.md}>
            {step === 'email' ? (
              <>
                {!env.isDemo && (
                  <Field label="E-posta" value={email} onChangeText={setEmail} placeholder="ornek@eposta.com"
                    autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" />
                )}
                <Toggle label="Aydınlatma metnini okudum" hint="Kişisel verilerin KVKK kapsamında işlenir." value={kvkk} onChange={setKvkk} />
                <Link href="/legal/kvkk" asChild>
                  <Pressable accessibilityRole="link"><Text v="smallStrong" color={colors.neon}>KVKK aydınlatma metnini oku</Text></Pressable>
                </Link>
                <Toggle label="Kampanya ve haber bildirimleri" hint="İsteğe bağlı. İstediğin zaman kapatabilirsin." value={marketing} onChange={setMarketing} />
                <ErrorText>{err}</ErrorText>
                {env.isDemo ? (
                  <>
                    <Button title="Demo ile gez" variant="primary" onPress={demo} loading={busy} />
                    <Muted small>Bu sürüm sunucuya bağlı değil. Girdiğin veriler yalnızca bu cihazda saklanır. Örnek araç ve kayıtlar “örnek” olarak işaretlidir.</Muted>
                  </>
                ) : (
                  <Button title="Giriş kodu gönder" variant="primary" onPress={sendCode} loading={busy} />
                )}
              </>
            ) : (
              <>
                <Muted>{email} adresine 6 haneli bir kod gönderdik.</Muted>
                <Field label="Doğrulama kodu" value={code} onChangeText={setCode} placeholder="123456" keyboardType="number-pad"
                  maxLength={6} autoComplete="one-time-code" textContentType="oneTimeCode" />
                <ErrorText>{err}</ErrorText>
                <Button title="Giriş yap" variant="primary" onPress={verify} loading={busy} />
                <Button title="E-postayı değiştir" variant="ghost" onPress={() => { setStep('email'); setCode(''); setErr(null); }} />
              </>
            )}
          </Stack>
        </View>
    </Screen>
  );
}
