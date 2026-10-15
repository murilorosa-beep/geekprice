import { requireOrganization, authErrorResponse } from "@/server/auth/context";

// A listagem anonima e apenas um experimento local. Nao participa da precificacao.
let lastRequestAt = 0;

export async function GET(request: Request) {
  if (process.env.NODE_ENV !== "development") {
    return Response.json({ error: "Teste disponivel somente em desenvolvimento." }, { status: 404 });
  }

  try {
    await requireOrganization("admin");
    const params = new URL(request.url).searchParams;
    const game = params.get("game") ?? "pokemon";
    const page = Number(params.get("page") ?? "1");
    if (!(["pokemon", "magic"] as string[]).includes(game) || !Number.isSafeInteger(page) || page < 1 || page > 20) {
      return Response.json({ error: "Informe pokemon ou magic e uma pagina entre 1 e 20." }, { status: 400 });
    }

    // Mais conservador que o limite anunciado de 10 requisicoes por minuto.
    const now = Date.now();
    if (now - lastRequestAt < 7_000) {
      return Response.json({ error: "Aguarde 7 segundos antes de outra consulta ao MYP." }, { status: 429 });
    }
    lastRequestAt = now;

    const url = `https://mypcards.com/api/v1/${game}/precos?page_number=${page}&page_size=50`;
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
        cache: "no-store",
      });
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
      return Response.json({ error: timedOut ? "Tempo limite ao consultar o MYP." : "Nao foi possivel conectar ao MYP neste ambiente." }, { status: timedOut ? 504 : 502 });
    }
    if (!response.ok) {
      const isCloudflareBlock = response.status === 403 && (response.headers.get("content-type") ?? "").includes("text/html");
      return Response.json({
        error: isCloudflareBlock
          ? "O Cloudflare do MYP bloqueou esta chamada do servidor (HTTP 403). O Swagger no navegador pode funcionar mesmo assim. Cole abaixo o JSON retornado pelo Swagger para testar a visualizacao."
          : `MYP respondeu HTTP ${response.status}.`,
        upstreamStatus: response.status,
      }, { status: 502 });
    }

    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || !("cards" in body) || !Array.isArray(body.cards)) {
      return Response.json({ error: "Formato inesperado na resposta do MYP." }, { status: 502 });
    }

    const cards = body.cards.slice(0, 50).map((card: Record<string, unknown>) => ({
      code: typeof card.card_code === "string" ? card.card_code : "",
      name: typeof card.name_pt === "string" && card.name_pt ? card.name_pt : card.name_en,
      edition: typeof card.edition_pt === "string" && card.edition_pt ? card.edition_pt : card.edition_en || card.edition_code,
      min: card.min_price,
      avg: card.avg_price,
      max: card.max_price,
      quantity: card.available_quantity,
      link: typeof card.link === "string" && card.link.startsWith("https://mypcards.com/") ? card.link : "https://mypcards.com/",
    }));
    return Response.json({ game, page, cards, source: "MYP Cards", fetchedAt: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return authErrorResponse(error);
  }
}
