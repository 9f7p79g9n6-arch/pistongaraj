/**
 * Kaza asistanı içeriği. Genel bilgilendirmedir; hukuki danışmanlık değildir.
 */
export interface EmergencyNumber {
  number: string;
  label: string;
}

export const EMERGENCY_NUMBERS: readonly EmergencyNumber[] = [
  { number: '112', label: 'Acil çağrı (ambulans, itfaiye, polis, jandarma)' },
];

export interface GuideStep {
  title: string;
  body: string;
}

export const ACCIDENT_STEPS: readonly GuideStep[] = [
  { title: 'Önce güvenlik', body: 'Dörtlüleri yak, motoru kapat. Güvenliyse yelek giyip aracın arkasına reflektör koy. Yolda durma; kaldırıma ya da bariyerin arkasına geç.' },
  { title: 'Yaralı var mı?', body: 'Yaralı varsa hemen 112\'yi ara. Yaralıyı, hayati tehlike yoksa yerinden oynatma.' },
  { title: 'Polis ya da jandarma gerekir mi?', body: 'Yaralanma ya da ölüm varsa, sürücülerden biri alkollüyse ya da ehliyetsizse, araçlardan birinin trafik sigortası yoksa, kamu malına zarar varsa ya da taraflar anlaşamıyorsa 112\'yi ara ve araçları yerinden oynatma.' },
  { title: 'Yalnızca maddi hasar ve anlaşma varsa', body: 'Fotoğrafları çektikten sonra araçları trafiği kapatmayacak yere çek. Taraflar Kaza Tespit Tutanağı\'nı birlikte doldurup imzalar (kâğıt tutanak ya da sigorta şirketlerinin mobil kaza tutanağı uygulaması).' },
  { title: 'Fotoğraf çek', body: 'Aşağıdaki listedeki fotoğrafları araçları oynatmadan önce çek.' },
  { title: 'Bilgileri al', body: 'Karşı tarafın adı, telefonu, plakası, ehliyet ve trafik sigortası poliçe bilgileri. Tanık varsa iletişim bilgisi.' },
  { title: 'Sigortana bildir', body: 'Trafik sigortası ve kaskon varsa sigorta şirketine ya da acentene poliçede yazan süre içinde (genellikle birkaç iş günü) bildir. Tutanağın ve fotoğrafların bir kopyasını sakla.' },
];

export const ACCIDENT_PHOTOS: readonly { id: string; title: string }[] = [
  { id: 'overview', title: 'Kaza yerinin genel görünümü (araçların konumu, şeritler)' },
  { id: 'own_damage', title: 'Kendi aracındaki hasar (yakın ve uzak)' },
  { id: 'other_damage', title: 'Karşı araçtaki hasar' },
  { id: 'plates', title: 'İki aracın plakası' },
  { id: 'signs', title: 'Trafik işaretleri, ışıklar, yol çizgileri' },
  { id: 'debris', title: 'Yoldaki iz ve parçalar' },
  { id: 'documents', title: 'Karşı tarafın ehliyet ve sigorta poliçesi (izinle)' },
];

export interface AccidentRecord {
  id: string;
  vehicleId: string;
  happenedAt: string; // ISO zaman
  location: string;
  otherPlate: string;
  otherName: string;
  otherPhone: string;
  otherInsurer: string;
  otherPolicyNo: string;
  witness: string;
  notes: string;
  photosTaken: string[];
  stepsDone: number[];
}
