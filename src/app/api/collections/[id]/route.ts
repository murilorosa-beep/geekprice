import { workspaceDelete, workspaceSave } from "@/server/geek-workspace/http";
type Context = { params: Promise<{ id: string }> };
export async function PUT(request: Request, context: Context) { return workspaceSave("collections", request, (await context.params).id); }
export async function DELETE(request: Request, context: Context) { return workspaceDelete("collections", request, (await context.params).id); }
