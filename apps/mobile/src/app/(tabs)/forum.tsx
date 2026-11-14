import { ComingSoon } from '@/components/coming-soon';

export default function Forum() {
  return (
    <ComingSoon
      title="Forum"
      stage="Aşama 4"
      lead="Marka ve model topluluklarında araç sahipleriyle deneyim paylaşacaksın."
      items={[
        ['Doğrulanmış sahip rozeti', 'Aracının sahibi olduğunu doğrulayan kullanıcılar rozetle görünecek.'],
        ['Kronik sorunlar', 'Her model için sahiplerin oyladığı sorun ve çözüm rehberi.'],
        ['Moderasyon', 'Şikâyet et düğmesi ve topluluk kuralları ilk günden açık olacak.'],
      ]}
    />
  );
}
