/**
 * Gösterge ışığı: fotoğraftan tanıma ya da listeden seçme.
 * Karar ("aracı kullanabilir miyim?") her zaman @piston/core içindeki katalogdan gelir; yapay zekâ yalnızca ışığı tanır.
 */
import {
  assessCatalogLight,
  assessLight,
  COLOR_LABEL,
  SEVERITY_VERDICT,
  WARNING_LIGHTS,
  worstSeverity,
  type Blinking,
  type DetectedLight,
  type LightAssessment,
  type LightColor,
  type LightSeverity,
} from '@piston/core';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { FUEL_LABEL } from '@/components/vehicle';
import { Button, Card, Chip, ErrorText, Muted, Pill, Row, Screen, Section, Segmented, Stack, Text, type Tone } from '@/components/ui';
import { colors, radius, space } from '@/constants/theme';
import { RepoError, type LightIdentification } from '@/data/repo';
import { repo, useApp } from '@/data/store';
import { canAnalyzePhotosHere } from '@/lib/artifact-ai';
import { env } from '@/lib/env';
import { pickDashboardPhoto, type PhotoSource } from '@/lib/photo';

const CONSENT_KEY = 'piston-ai-consent-v1';

const LAMP: Record<LightColor, string> = {
  red: colors.danger, amber: colors.warn, green: colors.success, blue: colors.info, white: colors.text, unknown: colors.neutral,
};
const SEVERITY_TONE: Record<LightSeverity, Tone> = { stop_now: 'bad', urgent: 'bad', soon: 'warn', info: 'info' };
const CONFIDENCE_LABEL = { high: 'Eminiz', medium: 'Büyük olasılıkla', low: 'Emin değiliz' } as const;
const QUALITY_TIP: Record<LightIdentification['quality'], string | null> = {
  ok: null,
  blurry: 'Fotoğraf bulanık. Telefonu sabit tutup ekrana odaklanarak tekrar çek.',
  too_dark: 'Fotoğraf çok karanlık. Kontak açıkken, flaşsız ve daha yakından çek.',
  glare: 'Ekranda parlama var. Telefonu biraz eğerek tekrar çek.',
  no_dashboard: 'Fotoğrafta gösterge paneli görünmüyor. Işığın yandığı paneli çek.',
};

type Mode =
  | { kind: 'start' }
  | { kind: 'analyzing'; uri: string }
  | { kind: 'result'; uri: string | null; detected: DetectedLight[]; quality: LightIdentification['quality']; demo: boolean; remaining: number | null }
  | { kind: 'list' };

export default function Lights() {
  const { active } = useApp();
  const [mode, setMode] = useState<Mode>({ kind: 'start' });
  const [userBlinking, setUserBlinking] = useState<Blinking>('unknown');
  const [consented, setConsented] = useState<boolean | null>(env.isDemo ? true : null);
  const [quota, setQuota] = useState<{ used: number; limit: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [liveAi, setLiveAi] = useState(false);

  useEffect(() => {
    if (env.isDemo) {
      canAnalyzePhotosHere().then(setLiveAi).catch(() => {});
      return;
    }
    AsyncStorage.getItem(CONSENT_KEY).then((v) => setConsented(v === '1')).catch(() => setConsented(false));
    repo.aiQuota().then(setQuota).catch(() => {});
  }, []);

  const giveConsent = async () => {
    setErr(null);
    try {
      await repo.recordConsent('ai_processing', true, env.kvkkTextVersion);
      await AsyncStorage.setItem(CONSENT_KEY, '1').catch(() => {});
      setConsented(true);
    } catch (e) {
      setErr(e instanceof RepoError ? e.message : 'İzin kaydedilemedi. Tekrar dene.');
    }
  };

  const analyze = async (source: PhotoSource) => {
    setErr(null);
    const picked = await pickDashboardPhoto(source);
    if (!picked.ok) {
      if (picked.reason === 'denied') setErr('Kamera izni verilmedi. Galeriden seçebilir ya da telefon ayarlarından izin verebilirsin.');
      if (picked.reason === 'failed') setErr('Fotoğraf hazırlanamadı. Tekrar dene.');
      return;
    }
    setMode({ kind: 'analyzing', uri: picked.photo.uri });
    try {
      const res = await repo.identifyWarningLights({
        imageBase64: picked.photo.base64,
        mediaType: picked.photo.mediaType,
        vehicle: active ? { make: active.make, model: active.model, year: String(active.modelYear), fuel: FUEL_LABEL[active.fuelType] } : null,
        note: userBlinking === 'yes' ? 'Işık yanıp sönüyor.' : userBlinking === 'no' ? 'Işık sabit yanıyor.' : '',
      });
      setMode({ kind: 'result', uri: picked.photo.uri, detected: res.lights, quality: res.quality, demo: res.isDemoSample, remaining: res.remaining });
      if (res.remaining != null && res.limit != null) setQuota({ used: res.limit - res.remaining, limit: res.limit });
    } catch (e) {
      setErr(e instanceof RepoError ? e.message : 'Fotoğraf şu an analiz edilemedi. Listeden seçerek devam edebilirsin.');
      setMode({ kind: 'start' });
    }
  };

  const pickFromList = (id: string) => {
    const l = WARNING_LIGHTS.find((x) => x.id === id)!;
    setMode({
      kind: 'result', uri: null, quality: 'ok', demo: false, remaining: null,
      detected: [{ catalogId: id, color: l.color, blinking: userBlinking, confidence: 'high', description: l.symbol, meaningIfUnknown: '' }],
    });
  };

  return (
    <Screen title="Gösterge ışığı" back>
      {mode.kind === 'start' && (
        <Stack gap={space.lg}>
          <Muted>Yanan ışığın fotoğrafını çek. Hangi ışık olduğunu ve aracı kullanmaya devam edip edemeyeceğini söyleyelim.</Muted>

          <Stack gap={space.sm}>
            <Text v="smallStrong" color={colors.textMuted}>Işık nasıl yanıyor?</Text>
            <Segmented<Blinking> value={userBlinking} onChange={setUserBlinking} options={[
              { value: 'no', label: 'Sabit' }, { value: 'yes', label: 'Yanıp sönüyor' }, { value: 'unknown', label: 'Bilmiyorum' },
            ]} />
            <Muted small>Fotoğraf yanıp sönmeyi gösteremez. Motor arıza lambasında bu bilgi kararı değiştirir.</Muted>
          </Stack>

          {consented === false ? (
            <Card style={{ gap: space.sm }} highlight>
              <Text v="bodyStrong">Fotoğraf analizi için izin</Text>
              <Muted small>
                Fotoğrafın, ışığı tanımak için yurt dışındaki yapay zekâ hizmet sağlayıcımıza (Anthropic) gönderilir. Fotoğraf bizde saklanmaz.
                İzin vermezsen ışığı listeden seçebilirsin.
              </Muted>
              <Button title="İzin ver ve devam et" variant="primary" small onPress={giveConsent} />
            </Card>
          ) : (
            <Stack gap={space.sm}>
              <Button title="Fotoğraf çek" icon="camera" variant="primary" onPress={() => analyze('camera')} disabled={consented == null} />
              <Button title="Galeriden seç" onPress={() => analyze('library')} disabled={consented == null} />
              {quota && <Muted small>Bu ay {quota.used} / {quota.limit} tanıma hakkını kullandın.</Muted>}
              {env.isDemo && (
                <Muted small>
                  {liveAi
                    ? 'Fotoğraf, bu sayfayı açan kişinin Claude hesabıyla analiz edilir. İlk kullanımda claude.ai izin ister.'
                    : 'Bu görünümde fotoğraf analiz edilemiyor; akışı göstermek için örnek bir sonuç döner.'}
                </Muted>
              )}
            </Stack>
          )}

          <Button title="Listeden seç" variant="ghost" onPress={() => setMode({ kind: 'list' })} />
          <ErrorText>{err}</ErrorText>

          <Card style={{ gap: space.xs, marginTop: space.sm }}>
            <Text v="smallStrong">İyi fotoğraf için</Text>
            <Muted small>Kontak açıkken, flaşsız, panele dik açıyla ve yakından çek. Yalnızca yanan ışıkların net göründüğünden emin ol.</Muted>
          </Card>
        </Stack>
      )}

      {mode.kind === 'analyzing' && (
        <Stack gap={space.lg} style={{ alignItems: 'center', paddingTop: space.xl }}>
          <Image source={{ uri: mode.uri }} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: radius.lg }} contentFit="cover" />
          <ActivityIndicator color={colors.brand} />
          <Muted>Işıklar inceleniyor…</Muted>
        </Stack>
      )}

      {mode.kind === 'result' && (
        <ResultView
          mode={mode}
          userBlinking={userBlinking}
          onRetry={() => setMode({ kind: 'start' })}
          onList={() => setMode({ kind: 'list' })}
        />
      )}

      {mode.kind === 'list' && <LightList onPick={pickFromList} onBack={() => setMode({ kind: 'start' })} />}
    </Screen>
  );
}

function ResultView({ mode, userBlinking, onRetry, onList }: {
  mode: Extract<Mode, { kind: 'result' }>; userBlinking: Blinking; onRetry: () => void; onList: () => void;
}) {
  // Kullanıcı yanıp sönme bilgisini verdiyse, fotoğraftan çıkarılamayan bu bilgi onunkiyle değiştirilir
  const [blinkOverride, setBlinkOverride] = useState<Record<number, Blinking>>({});
  const assessments: LightAssessment[] = useMemo(
    () => mode.detected.map((d, i) => assessLight({ ...d, blinking: blinkOverride[i] ?? (userBlinking !== 'unknown' ? userBlinking : d.blinking) })),
    [mode.detected, blinkOverride, userBlinking],
  );
  const worst = worstSeverity(assessments.map((a) => a.severity));
  const tip = QUALITY_TIP[mode.quality];

  return (
    <Stack gap={space.lg}>
      {mode.demo && <Pill tone="warn">Örnek sonuç · gerçek analiz değildir</Pill>}
      {mode.uri && <Image source={{ uri: mode.uri }} style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: radius.lg }} contentFit="cover" accessibilityLabel="Çektiğin fotoğraf" />}

      {worst ? (
        <View style={{ borderRadius: radius.lg, padding: space.lg, gap: 4, backgroundColor: worst === 'info' ? colors.card : worst === 'soon' ? '#FDF1DC' : '#FBE6E7', borderWidth: 1, borderColor: worst === 'info' ? colors.line : worst === 'soon' ? colors.warn : colors.danger }}
          accessibilityRole="alert">
          <Text v="title" color={worst === 'info' ? colors.text : worst === 'soon' ? colors.warnText : colors.danger}>{SEVERITY_VERDICT[worst].title}</Text>
          <Text v="body">{SEVERITY_VERDICT[worst].body}</Text>
        </View>
      ) : (
        <Card style={{ gap: space.xs }}>
          <Text v="bodyStrong">Yanan bir uyarı ışığı bulamadık</Text>
          <Muted small>{tip ?? 'Işık fotoğrafta net görünmüyor olabilir. Tekrar çek ya da listeden seç.'}</Muted>
        </Card>
      )}
      {worst && tip && <Muted small>{tip}</Muted>}

      {assessments.map((a, i) => (
        <Card key={i} style={{ gap: space.sm }}>
          <Row style={{ alignItems: 'flex-start' }}>
            <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: LAMP[a.color], marginTop: 4 }} accessibilityLabel={COLOR_LABEL[a.color]} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text v="bodyStrong">{a.name}</Text>
              <Row gap={6} style={{ flexWrap: 'wrap' }}>
                <Pill tone={SEVERITY_TONE[a.severity]}>{SEVERITY_VERDICT[a.severity].title}</Pill>
                <Pill tone="neutral">{COLOR_LABEL[a.color]}</Pill>
                {mode.uri && <Pill tone={a.confidence === 'high' ? 'ok' : a.confidence === 'medium' ? 'info' : 'neutral'}>{CONFIDENCE_LABEL[a.confidence]}</Pill>}
              </Row>
            </View>
          </Row>
          <Muted>{a.meaning}</Muted>
          {a.light?.blinkingSeverity && (
            <Segmented<Blinking> value={a.blinking === 'yes' ? 'yes' : 'no'} onChange={(b) => setBlinkOverride((p) => ({ ...p, [i]: b }))}
              options={[{ value: 'no', label: 'Sabit yanıyor' }, { value: 'yes', label: 'Yanıp sönüyor' }]} />
          )}
          {a.steps.length > 0 && (
            <Stack gap={6}>
              {a.steps.map((s, j) => (
                <Row key={j} gap={space.sm} style={{ alignItems: 'flex-start' }}>
                  <Text v="smallStrong" color={colors.textMuted}>{j + 1}.</Text>
                  <Text v="small" style={{ flex: 1 }}>{s}</Text>
                </Row>
              ))}
            </Stack>
          )}
          {a.basis === 'color_rule' && <Muted small>Bu ışığı kesin tanıyamadık; öneri ışığın rengine göre. Kullanım kılavuzundan ya da listeden kontrol et.</Muted>}
        </Card>
      ))}

      <Row gap={space.sm}>
        <Button title="Yeni fotoğraf" small style={{ flex: 1 }} onPress={onRetry} />
        <Button title="Listeden seç" small variant="ghost" style={{ flex: 1 }} onPress={onList} />
      </Row>
      {mode.remaining != null && <Muted small>Bu ay {mode.remaining} tanıma hakkın kaldı.</Muted>}
      <Muted small>
        Bu bilgi ön değerlendirmedir, teşhis değildir. Aracın farklı davranıyorsa (güç kaybı, ses, koku, duman) ya da emin değilsen aracı kullanma ve bir ustaya danış.
      </Muted>
    </Stack>
  );
}

const COLOR_GROUPS: { title: string; colors: LightColor[] }[] = [
  { title: 'Kırmızı', colors: ['red'] },
  { title: 'Sarı / turuncu', colors: ['amber'] },
  { title: 'Yeşil ve mavi', colors: ['green', 'blue', 'white'] },
];

function LightList({ onPick, onBack }: { onPick: (id: string) => void; onBack: () => void }) {
  const [group, setGroup] = useState(0);
  const list = WARNING_LIGHTS.filter((l) => COLOR_GROUPS[group]!.colors.includes(l.color));
  return (
    <Stack gap={space.md}>
      <Muted>Işığın rengini seç, sonra simgeye en çok benzeyeni bul.</Muted>
      <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
        {COLOR_GROUPS.map((g, i) => <Chip key={g.title} label={g.title} selected={group === i} onPress={() => setGroup(i)} />)}
      </Row>
      <Section title={`${COLOR_GROUPS[group]!.title} ışıklar`}>
        <Stack gap={space.sm}>
          {list.map((l) => {
            const a = assessCatalogLight(l.id)!;
            return (
              <Card key={l.id} onPress={() => onPick(l.id)} accessibilityLabel={`${l.name}, ${l.symbol}`}>
                <Row style={{ alignItems: 'flex-start' }}>
                  <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: LAMP[l.color], marginTop: 5 }} />
                  <View style={{ flex: 1 }}>
                    <Text v="bodyStrong">{l.name}</Text>
                    <Muted small>Simge: {l.symbol}</Muted>
                  </View>
                  <Pill tone={SEVERITY_TONE[a.severity]}>{SEVERITY_VERDICT[a.severity].title}</Pill>
                </Row>
              </Card>
            );
          })}
        </Stack>
      </Section>
      <Button title="Geri" variant="ghost" onPress={onBack} />
    </Stack>
  );
}
