import { AutopilotBusyError, runAutopilotReevaluationCycle } from "@/server/autopilot/worker";
import {
  isCronRequestAuthorized,
  isCronSecretConfigured,
} from "@/server/autopilot/cron-auth";

export async function POST(request: Request) {
  return handleCron(request);
}

async function handleCron(request: Request) {
  const expectedSecret = process.env.CRON_SECRET;
  if (!isCronSecretConfigured(expectedSecret)) {
    console.error("CRON_SECRET ausente ou com menos de 32 caracteres.");
    return Response.json({ error: "Automação recorrente não configurada." }, { status: 503 });
  }
  if (!isCronRequestAuthorized(request.headers.get("authorization"), expectedSecret!)) {
    return Response.json({ error: "Não autorizado." }, { status: 401 });
  }

  const start = Date.now();
  let result;
  try {
    result = await runAutopilotReevaluationCycle();
  } catch (error) {
    if (error instanceof AutopilotBusyError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    console.error("Falha no ciclo do Autopilot:", error);
    return Response.json({ error: "Falha na execução do Autopilot." }, { status: 500 });
  }
  const durationMs = Date.now() - start;

  return Response.json({
    success: true,
    durationMs,
    ...result,
  });
}
