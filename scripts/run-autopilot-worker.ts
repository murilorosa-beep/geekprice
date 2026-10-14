import { runAutopilotReevaluationCycle } from "../src/server/autopilot/worker";

const args = process.argv.slice(2);
const isOnce = args.includes("--once");
const intervalArgIndex = args.indexOf("--interval");
const intervalMinutes =
  intervalArgIndex !== -1 && args[intervalArgIndex + 1]
    ? Math.max(1, Number(args[intervalArgIndex + 1]))
    : 15;

async function runCycle() {
  const time = new Date().toLocaleTimeString("pt-BR");
  console.log(`[${time}] [Autopilot Worker] Iniciando ciclo de reavaliação de preços...`);
  try {
    const start = Date.now();
    const result = await runAutopilotReevaluationCycle();
    const duration = Date.now() - start;

    console.log(
      `[${time}] [Autopilot Worker] Concluído em ${duration}ms! Lojas: ${result.organizationsProcessed} | Itens avaliados: ${result.totalEvaluated} | Seguros: ${result.safeCount} | Retidos/Suspeitos: ${result.suspiciousCount} | Lotes auto-aplicados: ${result.batchesCreated}`
    );
  } catch (err) {
    console.error(`[${time}] [Autopilot Worker] Erro no ciclo de reavaliação:`, err);
    if (isOnce) process.exitCode = 1;
  }
}

async function main() {
  console.log("==================================================");
  console.log("🚀 GeekPrice Autopilot — Background Worker");
  console.log(`Modo: ${isOnce ? "Execução Única (--once)" : `Daemon (intervalo: ${intervalMinutes} minutos)`}`);
  console.log("==================================================");

  await runCycle();

  if (isOnce) {
    console.log("Execução única finalizada. Encerrando worker.");
    return;
  }

  console.log(`Worker em execução em segundo plano. Próximo ciclo em ${intervalMinutes} minutos...`);
  setInterval(runCycle, intervalMinutes * 60 * 1000);
}

main().catch((err) => {
  console.error("Erro fatal no worker:", err);
  process.exit(1);
});
