/**
 * Kullanım koşulları onayı. Girişte onay alınır; koşullar değişince (LEGAL_VERSION) ya da daha önce onay
 * vermemiş mevcut kullanıcılar için uygulama açılışında bir kez sorulur. Apple 1.2: kullanıcı içeriği olan
 * uygulamada koşulların kabulü zorunludur.
 */
import { LEGAL_VERSION } from '@piston/core';
import { Link } from 'expo-router';
import { createContext, useContext, useState } from 'react';
import { Pressable, View } from 'react-native';

import { colors, space } from '@/constants/theme';
import { RepoError } from '@/data/repo';
import { repo } from '@/data/store';
import { Button, ErrorText, Muted, Screen, Stack, Text } from './ui';

/** Kök düzen, onay verildiğini bu bağlamla öğrenir */
export const TermsAcceptedContext = createContext<() => void>(() => {});
export const useTermsAccepted = () => useContext(TermsAcceptedContext);

export function TermsGate({ onAccepted }: { onAccepted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const accept = async () => {
    setBusy(true);
    setErr(null);
    try {
      await repo.recordConsent('terms', true, LEGAL_VERSION);
      onAccepted();
    } catch (e) {
      setErr(e instanceof RepoError ? e.message : 'Kaydedilemedi. İnternet bağlantını kontrol edip tekrar dene.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="Kullanım koşulları">
      <Stack gap={space.lg}>
        <Text>Devam etmeden önce kullanım koşullarımızı onaylaman gerekiyor.</Text>
        <Muted>
          OTOM’da paylaşılan içerik herkese görünür. Hakaret, taciz, müstehcen ya da yanıltıcı içeriğe ve başkasının kişisel
          verisini izinsiz paylaşmaya tolerans gösterilmez. Uygunsuz içeriği ve kişileri şikâyet edebilir, engelleyebilirsin;
          şikâyetler 24 saat içinde incelenir.
        </Muted>
        <View style={{ gap: space.sm }}>
          <Link href="/legal/kosullar" asChild>
            <Pressable accessibilityRole="link"><Text v="smallStrong" color={colors.brandDark}>Kullanım koşullarını oku</Text></Pressable>
          </Link>
          <Link href="/legal/gizlilik" asChild>
            <Pressable accessibilityRole="link"><Text v="smallStrong" color={colors.brandDark}>Gizlilik politikasını oku</Text></Pressable>
          </Link>
        </View>
        <ErrorText>{err}</ErrorText>
        <Button title="Okudum, kabul ediyorum" variant="primary" onPress={accept} loading={busy} />
        <Muted small>Kabul etmek istemezsen Profil’den çıkış yapabilir ya da hesabını silebilirsin.</Muted>
      </Stack>
    </Screen>
  );
}
