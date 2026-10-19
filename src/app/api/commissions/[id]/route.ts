import { workspaceDelete, workspaceSave } from "@/server/geek-workspace/http";
type Context = { params: Promise<{ id: string }> };
export async function PUT(request: Request, context: Context) { return workspaceSave("commissions", request, (await context.params).id); }
export async function DELETE(request: Request, context: Context) { return workspaceDelete("commissions", request, (await context.params).id); }
