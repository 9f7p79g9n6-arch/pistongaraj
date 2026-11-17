/**
 * Borç hatırlatmaları: işletmenin kayıtlı mesaj şablonu ve her müşteriye en son ne zaman hatırlatma açıldığı.
 * Bu cihazda tutulur (işletme işletme). WhatsApp'ta gerçekten gönderilip gönderilmediğini uygulama bilemez;
 * "son hatırlatma" WhatsApp'ın mesaj hazır açıldığı zamandır.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_REMINDER_TEMPLATE } from '@piston/core';

const logKey = (businessId: string) => `piston-hatirlatma-v1:${businessId}`;
const tplKey = (businessId: string) => `piston-hatirlatma-sablon-v1:${businessId}`;

export async function loadReminderLog(businessId: string): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(logKey(businessId));
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export async function markReminded(businessId: string, customerId: string): Promise<Record<string, string>> {
  const log = await loadReminderLog(businessId);
  log[customerId] = new Date().toISOString();
  try {
    await AsyncStorage.setItem(logKey(businessId), JSON.stringify(log));
  } catch {
    // Kayıt tutulamasa da hatırlatma gönderilmiş olur; yalnızca tarih görünmez
  }
  return log;
}

export async function loadReminderTemplate(businessId: string): Promise<string> {
  try {
    return (await AsyncStorage.getItem(tplKey(businessId))) || DEFAULT_REMINDER_TEMPLATE;
  } catch {
    return DEFAULT_REMINDER_TEMPLATE;
  }
}

export async function saveReminderTemplate(businessId: string, template: string): Promise<void> {
  try {
    await AsyncStorage.setItem(tplKey(businessId), template);
  } catch {
    // Şablon bu oturumda yine kullanılır
  }
}
