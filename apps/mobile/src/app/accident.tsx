/**
 * Kaza asistanı: adım adım rehber, fotoğraf listesi ve karşı taraf bilgileri.
 * Karşı tarafın bilgileri kişisel veridir; yalnızca bu cihazda saklanır, sunucuya gönderilmez.
 */
import { ACCIDENT_PHOTOS, ACCIDENT_STEPS, EMERGENCY_NUMBERS, type AccidentRecord } from '@piston/core';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';

import { Icon } from '@/components/icons';
import { Button, Card, Field, Muted, Row, Screen, Section, Stack, Text } from '@/components/ui';
import { colors, radius, space } from '@/constants/theme';
import { useApp } from '@/data/store';
import { confirm } from '@/lib/confirm';

const KEY = 'piston-accident-draft-v1';

function emptyRecord(vehicleId: string): AccidentRecord {
  return {
    id: String(Date.now()), vehicleId, happenedAt: new Date().toISOString(), location: '', otherPlate: '', otherName: '',
    otherPhone: '', otherInsurer: '', otherPolicyNo: '', witness: '', notes: '', photosTaken: [], stepsDone: [],
  };
}

export default function Accident() {
  const { active } = useApp();
  const [rec, setRec] = useState<AccidentRecord | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => setRec(v ? (JSON.parse(v) as AccidentRecord) : emptyRecord(active?.id ?? '')))
      .catch(() => setRec(emptyRecord(active?.id ?? '')))
      .finally(() => { loaded.current = true; });
  }, [active?.id]);

  useEffect(() => {
    if (loaded.current && rec) AsyncStorage.setItem(KEY, JSON.stringify(rec)).catch(() => {});
  }, [rec]);

  if (!rec) return null;
  const set = <K extends keyof AccidentRecord>(k: K, v: AccidentRecord[K]) => setRec({ ...rec, [k]: v });
  const toggleIn = (k: 'photosTaken' | 'stepsDone', v: never) => {
    const list = rec[k] as unknown[];
    set(k, (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]) as never);
  };

  const clear = async () => {
    if (await confirm('Kaydı temizle', 'Bu cihazdaki kaza notları ve işaretler silinsin mi?', 'Temizle', true)) {
      setRec(emptyRecord(active?.id ?? ''));
    }
  };

  return (
    <Screen title="Kaza asistanı" back>
      <View style={{ borderRadius: radius.lg, padding: space.lg, gap: space.sm, backgroundColor: '#FBE6E7', borderWidth: 1, borderColor: colors.danger }}>
        <Text v="bodyStrong">Yaralı varsa ya da tehlike sürüyorsa önce ara</Text>
        {EMERGENCY_NUMBERS.map((n) => (
          <Button key={n.number} title={`${n.number} · ${n.label}`} variant="danger" icon="alert"
            onPress={() => Linking.openURL(`tel:${n.number}`).catch(() => {})} />
        ))}
      </View>

      <Section title="Adım adım">
        <Stack gap={space.sm}>
          {ACCIDENT_STEPS.map((s, i) => {
            const isDone = rec.stepsDone.includes(i);
            return (
              <Card key={s.title} onPress={() => toggleIn('stepsDone', i as never)} accessibilityLabel={`${i + 1}. ${s.title}${isDone ? ', yapıldı' : ''}`}>
                <Row style={{ alignItems: 'flex-start' }}>
                  <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: isDone ? colors.success : colors.surface, alignItems: 'center', justifyContent: 'center' }}>
                    {isDone ? <Icon name="check" size={15} color={colors.onBrand} /> : <Text v="smallStrong">{i + 1}</Text>}
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text v="bodyStrong" color={isDone ? colors.textMuted : colors.text}>{s.title}</Text>
                    <Muted small>{s.body}</Muted>
                  </View>
                </Row>
              </Card>
            );
          })}
        </Stack>
      </Section>

      <Section title="Fotoğraf listesi">
        <Card style={{ paddingVertical: space.sm }}>
          {ACCIDENT_PHOTOS.map((p) => {
            const isDone = rec.photosTaken.includes(p.id);
            return (
              <Pressable key={p.id} onPress={() => toggleIn('photosTaken', p.id as never)} accessibilityRole="checkbox" accessibilityState={{ checked: isDone }}
                style={{ flexDirection: 'row', gap: space.md, paddingVertical: space.sm, alignItems: 'center' }}>
                <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: isDone ? colors.success : colors.line, backgroundColor: isDone ? colors.success : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                  {isDone && <Icon name="check" size={14} color={colors.onBrand} />}
                </View>
                <Text v="small" style={{ flex: 1 }} color={isDone ? colors.textMuted : colors.text}>{p.title}</Text>
              </Pressable>
            );
          })}
        </Card>
        <Muted small>Fotoğrafları telefonunun kamerasıyla çek; galeride kalsın.</Muted>
      </Section>

      <Section title="Karşı tarafın bilgileri">
        <Stack gap={space.md}>
          <Field label="Kaza yeri" value={rec.location} onChangeText={(v) => set('location', v)} placeholder="Örn. Kadıköy, Bağdat Cd." />
          <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
            <Field label="Plaka" value={rec.otherPlate} onChangeText={(v) => set('otherPlate', v)} autoCapitalize="characters" />
            <Field label="Telefon" value={rec.otherPhone} onChangeText={(v) => set('otherPhone', v)} keyboardType="phone-pad" />
          </Row>
          <Field label="Ad soyad" value={rec.otherName} onChangeText={(v) => set('otherName', v)} />
          <Row gap={space.md} style={{ alignItems: 'flex-start' }}>
            <Field label="Sigorta şirketi" value={rec.otherInsurer} onChangeText={(v) => set('otherInsurer', v)} />
            <Field label="Poliçe no" value={rec.otherPolicyNo} onChangeText={(v) => set('otherPolicyNo', v)} />
          </Row>
          <Field label="Tanık (isteğe bağlı)" value={rec.witness} onChangeText={(v) => set('witness', v)} placeholder="Ad ve telefon" />
          <Field label="Notlar" value={rec.notes} onChangeText={(v) => set('notes', v)} multiline style={{ minHeight: 80, textAlignVertical: 'top' }}
            placeholder="Ne oldu? Hangi şeritteydiniz, ışık hangi renkti?" />
          <Muted small>Bu bilgiler yalnızca bu telefonda saklanır, sunucuya gönderilmez.</Muted>
        </Stack>
      </Section>

      <Stack style={{ marginTop: space.xl }}>
        <Button title="Kaydı temizle" variant="ghost" icon="trash" onPress={clear} />
        <Muted small>Bu rehber genel bilgilendirmedir, hukuki danışmanlık değildir. Kusur ve tazminat konusunda sigorta şirketine ya da bir avukata danış.</Muted>
      </Stack>
    </Screen>
  );
}
