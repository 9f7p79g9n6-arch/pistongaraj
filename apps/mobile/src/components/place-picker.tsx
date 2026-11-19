/**
 * Şehir ve ilçe seçimi: yazmak yerine listeden dokunarak seçilir (arama kutulu).
 * Liste: packages/core/src/turkiye-il-ilce.ts (81 il, 973 ilçe).
 */
import { districtsOf, searchTR, TR_PROVINCES } from '@piston/core';
import { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, space } from '@/constants/theme';
import { Icon } from './icons';
import { IconButton, Muted, Text, s as ui, useInRow } from './ui';

export function PlacePicker({ label, value, onChange, options, placeholder = 'Seç', error, hint, emptyLabel, disabled, disabledHint, title }: {
  label: string; value: string; onChange: (v: string) => void; options: readonly string[]; placeholder?: string;
  error?: string | null; hint?: string; emptyLabel?: string; disabled?: boolean; disabledHint?: string; title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const inRow = useInRow();
  const list = useMemo(() => searchTR(options, q), [options, q]);
  const shown = value || (emptyLabel ?? '');

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
    setQ('');
  };

  return (
    <View style={[{ gap: 6 }, inRow && { flex: 1 }]}>
      <Text v="smallStrong">{label}</Text>
      <Pressable onPress={() => !disabled && setOpen(true)} disabled={disabled} accessibilityRole="button"
        accessibilityLabel={`${label}: ${shown || 'seçilmedi'}`} accessibilityState={{ disabled: !!disabled }}
        style={[ui.input, { flexDirection: 'row', alignItems: 'center', gap: 6, opacity: disabled ? 0.5 : 1 }, !!error && { borderColor: colors.danger }]}>
        <Text style={{ flex: 1, fontSize: 16 }} color={shown ? colors.text : colors.iconMuted} numberOfLines={1}>{shown || placeholder}</Text>
        <View style={{ transform: [{ rotate: '90deg' }] }}><Icon name="chev" size={16} color={colors.iconMuted} /></View>
      </Pressable>
      {error ? <Text v="small" color={colors.danger}>{error}</Text>
        : disabled && disabledHint ? <Muted small>{disabledHint}</Muted>
        : hint ? <Muted small>{hint}</Muted> : null}

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom', 'left', 'right']}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.sm, padding: space.md }}>
            <Text v="title" style={{ flex: 1 }}>{title ?? label}</Text>
            <IconButton icon="x" label="Kapat" onPress={() => setOpen(false)} />
          </View>
          <View style={{ paddingHorizontal: space.md, paddingBottom: space.sm }}>
            <TextInput value={q} onChangeText={setQ} placeholder="Ara…" placeholderTextColor={colors.iconMuted} autoFocus autoCorrect={false}
              accessibilityLabel={`${label} ara`} style={ui.input} />
          </View>
          <FlatList
            data={list}
            keyExtractor={(i) => i}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={emptyLabel && !q ? <Row label={emptyLabel} selected={!value} onPress={() => pick('')} /> : undefined}
            ListEmptyComponent={<Muted style={{ padding: space.md }}>Bulunamadı.</Muted>}
            renderItem={({ item }) => <Row label={item} selected={item === value} onPress={() => pick(item)} />}
          />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

function Row({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected }}
      style={({ pressed }) => ({
        flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: colors.surface, backgroundColor: pressed ? colors.surface : 'transparent',
      })}>
      <Text v={selected ? 'bodyStrong' : 'body'} style={{ flex: 1 }}>{label}</Text>
      {selected && <Icon name="check" size={18} color={colors.brand} />}
    </Pressable>
  );
}

export function CityPicker(props: { label?: string; value: string; onChange: (v: string) => void; error?: string | null; hint?: string; emptyLabel?: string }) {
  return <PlacePicker title="Şehir seç" options={TR_PROVINCES} placeholder="Şehir seç" {...props} label={props.label ?? 'Şehir'} />;
}

export function DistrictPicker({ city, ...props }: { city: string; value: string; onChange: (v: string) => void; error?: string | null }) {
  const options = useMemo(() => districtsOf(city), [city]);
  return (
    <PlacePicker label="İlçe" title={city ? `${city} ilçeleri` : 'İlçe seç'} options={options} placeholder="İlçe seç"
      disabled={!city || options.length === 0} disabledHint="Önce şehri seç." {...props} />
  );
}
