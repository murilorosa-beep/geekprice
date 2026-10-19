import { z } from "zod";
import { indexRead } from "@/server/geekprice-index/http";
import { getIndexHistory } from "@/server/geekprice-index/service";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return indexRead(request, async () => {
    const { id } = await params;
    return getIndexHistory(z.uuid().parse(id));
  });
}
