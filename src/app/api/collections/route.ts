import { workspaceList, workspaceSave } from "@/server/geek-workspace/http";
export const GET = (request: Request) => workspaceList("collections", request);
export const POST = (request: Request) => workspaceSave("collections", request);
