/**
 * Muayene öncesi kontrol listesi. Muayenede sık kusur bulunan, sürücünün kendisinin kontrol edebileceği kalemler.
 * Kesin muayene kriterleri için muayene istasyonunun güncel listesine bakılmalıdır.
 */
export interface ChecklistItem {
  id: string;
  group: 'Aydınlatma' | 'Lastik ve fren' | 'Görüş' | 'Gövde ve motor' | 'Belge ve ekipman';
  title: string;
  how: string;
}

export const INSPECTION_CHECKLIST: readonly ChecklistItem[] = [
  { id: 'headlights', group: 'Aydınlatma', title: 'Kısa ve uzun farlar', how: 'İkisi de yanıyor mu, cam çatlak ya da buğulu mu? Duvara tutup ayarın düzgün olduğuna bak.' },
  { id: 'signals', group: 'Aydınlatma', title: 'Sinyaller ve dörtlüler', how: 'Dört köşede ve aynalarda sinyaller yanıyor mu? Normal hızda mı yanıp sönüyor?' },
  { id: 'brake_lights', group: 'Aydınlatma', title: 'Stop lambaları', how: 'Birinden frene bastırıp üç stop lambasına (üstteki dahil) baktır.' },
  { id: 'rear_lights', group: 'Aydınlatma', title: 'Arka park, plaka ve geri vites lambaları', how: 'Plaka lambası sık unutulan kusurdur.' },
  { id: 'tyre_tread', group: 'Lastik ve fren', title: 'Lastik diş derinliği', how: 'Diş derinliği en az 1,6 mm olmalı; lastikteki aşınma göstergesine (TWI) bak. Yanakta yarık ya da şişlik olmamalı.' },
  { id: 'tyre_match', group: 'Lastik ve fren', title: 'Aynı akstaki lastikler', how: 'Aynı akstaki iki lastik aynı ebat ve tipte olmalı.' },
  { id: 'handbrake', group: 'Lastik ve fren', title: 'El freni', how: 'Eğimde aracı tek başına tutuyor mu?' },
  { id: 'brake_warning', group: 'Lastik ve fren', title: 'Göstergede uyarı ışığı', how: 'Motor, ABS, hava yastığı ya da fren uyarısı yanıyorsa muayeneden önce giderilmeli.' },
  { id: 'windscreen', group: 'Görüş', title: 'Ön cam', how: 'Sürücü görüş alanında çatlak ya da büyük taş izi olmamalı.' },
  { id: 'wipers', group: 'Görüş', title: 'Silecekler ve cam suyu', how: 'Silecekler iz bırakmadan siliyor mu, cam suyu fışkırtıcısı çalışıyor mu?' },
  { id: 'mirrors', group: 'Görüş', title: 'Aynalar', how: 'İç ve iki yan ayna sağlam ve ayarlanabilir olmalı.' },
  { id: 'horn', group: 'Gövde ve motor', title: 'Korna', how: 'Çalışıyor mu?' },
  { id: 'seatbelts', group: 'Gövde ve motor', title: 'Emniyet kemerleri', how: 'Tüm kemerler kilitleniyor ve sert çekişte duruyor mu?' },
  { id: 'leaks', group: 'Gövde ve motor', title: 'Yağ ve sıvı kaçağı', how: 'Aracın altında yağ, su ya da yakıt damlası var mı?' },
  { id: 'exhaust', group: 'Gövde ve motor', title: 'Egzoz', how: 'Delik, aşırı ses ya da yoğun duman olmamalı. Egzoz emisyon ölçümü muayenede yapılır.' },
  { id: 'plates', group: 'Gövde ve motor', title: 'Plakalar', how: 'Ön ve arka plaka standart, okunaklı ve sağlam takılı olmalı.' },
  { id: 'registration', group: 'Belge ve ekipman', title: 'Ruhsat ve kimlik', how: 'Araç ruhsatı ve randevu bilgisi yanında olsun. Trafik sigortası geçerli olmalı.' },
  { id: 'kit', group: 'Belge ve ekipman', title: 'İlk yardım çantası, yangın söndürücü, reflektör', how: 'Araçta bulunması gereken ekipman; son kullanma tarihlerine bak.' },
];

export const INSPECTION_INFO_URL = 'https://www.tuvturk.com.tr';
