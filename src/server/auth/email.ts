import "server-only";

export function getPublicBaseUrl() {
  const value = process.env.NEXTAUTH_URL;
  if (!value) throw new Error("NEXTAUTH_URL não está configurada.");
  return value.replace(/\/+$/, "");
}

export function isEmailDeliveryConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
}

export async function sendTransactionalEmail(input: { to: string; subject: string; text: string }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) throw new Error("Configure RESEND_API_KEY e RESEND_FROM_EMAIL para enviar e-mails.");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to: [input.to], subject: input.subject, text: input.text }),
  });
  if (!response.ok) {
    const details = await response.text();
    console.error("Falha ao enviar e-mail transacional pelo Resend.", response.status, details);
    throw new Error("O serviço de e-mail não aceitou a mensagem.");
  }
}
