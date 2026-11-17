/** Rehber ve taleplerde kullanılan şehir bu cihazda hatırlanır (konum izni istenmez). */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'piston-sehir-v1';

export async function loadCity(): Promise<string> {
  try {
    return (await AsyncStorage.getItem(KEY)) ?? '';
  } catch {
    return '';
  }
}

export async function saveCity(city: string): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, city.trim());
  } catch {
    // hatırlanamasa da arama çalışır
  }
}
