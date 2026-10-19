import { workspaceList, workspaceSave } from "@/server/geek-workspace/http";
export const GET = (request: Request) => workspaceList("commissions", request);
export const POST = (request: Request) => workspaceSave("commissions", request);
