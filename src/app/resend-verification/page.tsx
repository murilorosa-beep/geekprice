import { EmailRequestForm } from "@/components/commercial-auth-forms";

export default function ResendVerificationPage() {
  return <main className="login-page"><EmailRequestForm purpose="verification"/></main>;
}
