import{authErrorResponse,requireOrganization}from"@/server/auth/context";import{scryfallConnector}from"@/server/market/scryfall";
export async function GET(_request:Request,context:{params:Promise<{id:string}>}){try{await requireOrganization();const{id}=await context.params;return Response.json(await scryfallConnector.getCard(id,"en"))}catch(error){return authErrorResponse(error)}}
