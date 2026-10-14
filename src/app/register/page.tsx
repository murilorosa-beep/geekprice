import { RegisterForm } from "@/components/commercial-auth-forms";
import { isEmailDeliveryConfigured } from "@/server/auth/email";
import { getApprovedLegalVersions } from "@/server/auth/legal";

export default function RegisterPage() {
  const registrationAvailable = isEmailDeliveryConfigured()
    && getApprovedLegalVersions() !== null;
  return <main className="login-page"><RegisterForm registrationAvailable={registrationAvailable}/></main>;
}
