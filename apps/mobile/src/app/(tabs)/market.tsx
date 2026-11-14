import { ComingSoon } from '@/components/coming-soon';

export default function Market() {
  return (
    <ComingSoon
      title="Parça Pazarı"
      stage="Aşama 3 · pilot satıcılarla"
      lead="Aracına uyan parçaları onaylı satıcılardan alacaksın. Uyumluluk OEM numarası ve şasi numarasıyla doğrulanacak."
      items={[
        ['Doğrulanmış uyumluluk', 'Her üründe üç durumdan biri görünecek: doğrulanmış uyumlu, kontrol gerekli, uyumsuz.'],
        ['Uyum Güvencesi', 'Doğrulanmış uyumlu parça aracına uymazsa iade kargosu bizden.'],
        ['Servise teslim', 'Parçayı doğrudan seçtiğin ustaya gönderebileceksin.'],
      ]}
    />
  );
}
