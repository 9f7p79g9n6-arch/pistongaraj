/**
 * Borcu kalan müşteriler: tamamlanan kayıtlarda ödenmemiş tutar. En çok borçlu önce.
 * Toplu hatırlatma: mesaj bir kez yazılır, müşteriler seçilir; her müşterinin WhatsApp'ı kendi adı ve tutarıyla
 * sırayla açılır (WhatsApp tek dokunuşla çok kişiye mesaj göndermeye izin vermez; Gönder'e kullanıcı basar).
 */
import {
  debtors,
  DEFAULT_REMINDER_TEMPLATE,
  fillReminder,
  formatDate,
  formatKurus,
  formatPhoneTR,
  REMINDER_FIELDS,
  reminderTemplateWarning,
  timeAgoTR,
  type Debtor,
} from '@piston/core';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/icons';
import { Button, Card, Chip, Empty, ErrorText, Field, Muted, Row, Screen, Stack, Text } from '@/components/ui';
import { colors, space } from '@/constants/theme';
import { useBusiness } from '@/data/business-store';
import { loadReminderLog, loadReminderTemplate, markReminded, saveReminderTemplate } from '@/lib/reminder-log';
import { openWhatsApp } from '@/lib/share-record';

type Mode = 'list' | 'compose' | 'queue' | 'done';

export default function Debtors() {
  const { records, business } = useBusiness();
  const list = useMemo(() => debtors(records), [records]);
  const total = list.reduce((s, d) => s + d.debtKurus, 0);
  const bizName = business?.name ?? '';

  const [log, setLog] = useState<Record<string, string>>({});
  const [template, setTemplate] = useState(DEFAULT_REMINDER_TEMPLATE);
  const [mode, setMode] = useState<Mode>('list');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [queue, setQueue] = useState<Debtor[]>([]);
  const [index, setIndex] = useState(0);
  const [sentCount, setSentCount] = useState(0);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!business) return;
    let alive = true;
    void Promise.all([loadReminderLog(business.id), loadReminderTemplate(business.id)]).then(([l, t]) => {
      if (!alive) return;
      setLog(l);
      setTemplate(t);
    });
    return () => { alive = false; };
  }, [business]);

  const send = async (d: Debtor) => {
    if (!business) return false;
    setErr(null);
    const ok = await openWhatsApp(d.customerPhone, fillReminder(template, d, bizName));
    if (!ok) {
      setErr('WhatsApp açılamadı. Telefonunda WhatsApp yüklü mü?');
      return false;
    }
    setLog(await markReminded(business.id, d.customerId));
    return true;
  };

  const startCompose = () => {
    setSelected(new Set(list.map((d) => d.customerId)));
    setErr(null);
    setMode('compose');
  };

  const startQueue = async () => {
    const q = list.filter((d) => selected.has(d.customerId));
    if (q.length === 0) return setErr('En az bir müşteri seç.');
    if (business) await saveReminderTemplate(business.id, template);
    setQueue(q);
    setIndex(0);
    setSentCount(0);
    setErr(null);
    setMode('queue');
  };

  const next = () => {
    if (index + 1 >= queue.length) setMode('done');
    else setIndex(index + 1);
  };

  const toggle = (id: string) => {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setSelected(s);
  };

  // ---------------- Toplu: mesaj ve müşteri seçimi ----------------
  if (mode === 'compose') {
    const warn = reminderTemplateWarning(template);
    const sample = list.find((d) => selected.has(d.customerId)) ?? list[0];
    return (
      <Screen title="Toplu hatırlatma" back
        footer={<Button title={`${selected.size} müşteriye sırayla gönder`} icon="send" variant="primary" onPress={startQueue} disabled={selected.size === 0} />}>
        <Stack gap={space.lg}>
          <Muted small>
            Mesajı bir kez yaz. Her müşterinin WhatsApp’ı kendi adı ve borcuyla sırayla açılır; Gönder’e sen basarsın,
            uygulamaya dönünce sıradaki müşteri hazır olur.
          </Muted>
          <Field label="Mesaj" value={template} onChangeText={setTemplate} multiline style={{ minHeight: 170, textAlignVertical: 'top' }}
            error={warn} />
          <Stack gap={space.sm}>
            <Muted small>Mesaja eklenebilecek alanlar (dokununca sona eklenir):</Muted>
            <Row gap={space.sm} style={{ flexWrap: 'wrap' }}>
              {REMINDER_FIELDS.map((f) => (
                <Chip key={f.key} label={`${f.key} ${f.label}`} onPress={() => setTemplate(`${template.trimEnd()} ${f.key}`)} />
              ))}
              <Chip label="Varsayılan metne dön" onPress={() => setTemplate(DEFAULT_REMINDER_TEMPLATE)} />
            </Row>
          </Stack>

          {sample && (
            <Card style={{ gap: space.sm, backgroundColor: '#E7F6EC', borderColor: '#CDEBD7' }}>
              <Text v="label" color="#1E7D53" style={{ fontWeight: '700' }}>{`ÖNİZLEME · ${sample.customerName}`}</Text>
              <Text>{fillReminder(template, sample, bizName)}</Text>
            </Card>
          )}

          <Stack gap={space.sm}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text v="section">{`Müşteriler (${selected.size}/${list.length})`}</Text>
              <Text v="smallStrong" color={colors.brandDark} accessibilityRole="button"
                onPress={() => setSelected(selected.size === list.length ? new Set() : new Set(list.map((d) => d.customerId)))}>
                {selected.size === list.length ? 'Hiçbirini seçme' : 'Hepsini seç'}
              </Text>
            </Row>
            <Card style={{ paddingVertical: space.xs }}>
              {list.map((d, i) => {
                const on = selected.has(d.customerId);
                return (
                  <Pressable key={d.customerId} onPress={() => toggle(d.customerId)} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                    accessibilityLabel={`${d.customerName}, borç ${formatKurus(d.debtKurus)}`}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, borderTopWidth: i ? 1 : 0, borderTopColor: colors.line }}>
                    <View style={{ width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: on ? colors.brand : '#C5CAD1', backgroundColor: on ? colors.brand : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                      {on && <Icon name="check" size={15} color={colors.onBrand} />}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text v="bodyStrong" numberOfLines={1}>{d.customerName}</Text>
                      <Muted small>{log[d.customerId] ? `Son hatırlatma ${timeAgoTR(log[d.customerId]!)}` : 'Henüz hatırlatılmadı'}</Muted>
                    </View>
                    <Text v="bodyStrong" color={colors.warnText}>{formatKurus(d.debtKurus)}</Text>
                  </Pressable>
                );
              })}
            </Card>
          </Stack>
          <ErrorText>{err}</ErrorText>
        </Stack>
      </Screen>
    );
  }

  // ---------------- Toplu: sırayla gönderme ----------------
  if (mode === 'queue') {
    const d = queue[index]!;
    return (
      <Screen title="Toplu hatırlatma" back
        footer={
          <Stack gap={space.sm}>
            <Button title={`WhatsApp’ta aç (${index + 1}/${queue.length})`} icon="forum" variant="primary"
              onPress={async () => { if (await send(d)) { setSentCount(sentCount + 1); next(); } }} />
            <Row gap={space.sm}>
              <Button title="Bu müşteriyi atla" small style={{ flex: 1 }} onPress={next} />
              <Button title="Durdur" small variant="ghost" style={{ flex: 1 }} onPress={() => setMode('done')} />
            </Row>
          </Stack>
        }>
        <Stack gap={space.lg}>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.surface, overflow: 'hidden' }}
            accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: queue.length, now: index }}>
            <View style={{ width: `${(index / queue.length) * 100}%`, height: '100%', backgroundColor: colors.brand }} />
          </View>
          <Muted small>{`${index + 1}. müşteri / ${queue.length} · Gönder’e bastıktan sonra uygulamaya dön; sıradaki müşteri hazır olur.`}</Muted>
          <Card style={{ gap: 4 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text v="section" style={{ flex: 1 }}>{d.customerName}</Text>
              <Text v="section" color={colors.warnText}>{formatKurus(d.debtKurus)}</Text>
            </Row>
            <Muted small>{`${formatPhoneTR(d.customerPhone)} · ${log[d.customerId] ? `son hatırlatma ${timeAgoTR(log[d.customerId]!)}` : 'henüz hatırlatılmadı'}`}</Muted>
          </Card>
          <Card style={{ gap: space.sm, backgroundColor: '#E7F6EC', borderColor: '#CDEBD7' }}>
            <Text v="label" color="#1E7D53" style={{ fontWeight: '700' }}>GİDECEK MESAJ</Text>
            <Text>{fillReminder(template, d, bizName)}</Text>
          </Card>
          <ErrorText>{err}</ErrorText>
        </Stack>
      </Screen>
    );
  }

  // ---------------- Liste ----------------
  return (
    <Screen title="Borçlu müşteriler" back>
      <Card style={{ gap: 2 }}>
        <Muted small>Toplam alacak</Muted>
        <Text v="display" color={total > 0 ? colors.warnText : colors.text}>{formatKurus(total)}</Text>
        <Muted small>{`${list.length} müşteri · tamamlanan ve eksik ödeme alınan kayıtlardan`}</Muted>
        {list.length > 0 && (
          <Button title="Toplu hatırlatma gönder" icon="send" variant="primary" style={{ marginTop: space.md }} onPress={startCompose} />
        )}
      </Card>
      {mode === 'done' && (
        <Card style={{ marginTop: space.md, gap: 4, borderColor: '#CDEBD7', backgroundColor: '#E7F6EC' }}>
          <Text v="bodyStrong" color="#1E7D53">{`Toplu hatırlatma bitti · ${sentCount}/${queue.length} müşteriye WhatsApp açıldı`}</Text>
          <Muted small>Son hatırlatma tarihleri aşağıda müşterilerin altında görünür.</Muted>
        </Card>
      )}
      <ErrorText>{err}</ErrorText>
      <Stack gap={space.sm} style={{ marginTop: space.lg }}>
        {list.length === 0 ? (
          <Empty title="Borçlu müşteri yok" body="Kalan borcu olan müşteri yok. Eksik ödeme alındığında kalan tutar buraya kendiliğinden yazılır." />
        ) : list.map((d) => (
          <Card key={d.customerId} style={{ gap: 6 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Text v="bodyStrong" style={{ flex: 1 }}>{d.customerName}</Text>
              <Text v="bodyStrong" color={colors.warnText}>{formatKurus(d.debtKurus)}</Text>
            </Row>
            <Muted small>{`${formatPhoneTR(d.customerPhone)} · ${d.records.length} kayıt · en eski ${formatDate(d.oldestDate)}${d.records.some((x) => x.open) ? ' · iş devam ediyor' : ''}`}</Muted>
            <Muted small>{log[d.customerId] ? `Son hatırlatma ${timeAgoTR(log[d.customerId]!)}` : 'Henüz hatırlatılmadı'}</Muted>
            <Row gap={space.sm}>
              <Button title="WhatsApp ile hatırlat" icon="forum" small variant="outline" onPress={() => send(d)} />
              <Button title="Müşteriyi aç" small onPress={() => router.push(`/servis/musteri/${d.customerId}`)} />
            </Row>
          </Card>
        ))}
      </Stack>
    </Screen>
  );
}
