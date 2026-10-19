import { indexRead } from "@/server/geekprice-index/http";
import { getIndexSources } from "@/server/geekprice-index/service";

export async function GET(request: Request) { return indexRead(request, getIndexSources); }
