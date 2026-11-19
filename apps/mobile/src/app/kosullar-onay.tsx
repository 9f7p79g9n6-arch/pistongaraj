/** Kullanım koşulları onayı (girişte onay vermemiş ya da koşullar değişmiş kullanıcılar). Bkz. components/terms-gate. */
import { TermsGate, useTermsAccepted } from '@/components/terms-gate';

export default function TermsApproval() {
  const accepted = useTermsAccepted();
  return <TermsGate onAccepted={accepted} />;
}
