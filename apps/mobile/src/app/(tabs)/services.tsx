import { ComingSoon } from '@/components/coming-soon';

export default function Services() {
  return (
    <ComingSoon
      title="Servisler"
      stage="Aşama 2"
      lead="Şehrindeki servis ve ustaları bulacak, tek talep ile birden çok teklif alacaksın."
      items={[
        ['Teklif karşılaştırma', 'Ustalar işçilik ve parça fiyatını ayrı yazacak.'],
        ['Onaylı yorumlar', 'Yalnızca uygulama üzerinden işi tamamlanan kullanıcılar yorum yazabilecek.'],
        ['Geçmiş paylaşımı', 'İstersen usta aracının bakım geçmişini görecek.'],
      ]}
    />
  );
}
