export type CommerceProduct={externalId:string;sku:string|null;name:string;variant:string|null;price:string|null;cost:string|null;quantity:number|null;category:string|null;barcode:string|null;imageUrl:string|null;updatedAt:Date|null};
export type SyncCursor={cursor:string|null;updatedAfter:Date|null};
export interface CommerceConnector{readonly kind:"bling_v3"|"nuvemshop"|"woocommerce";readonly mode:"read_only";pullProducts(cursor:SyncCursor):Promise<{items:CommerceProduct[];nextCursor:string|null}>}
