// Pure-logic vendor routing module — NO AWS SDK imports, NO side effects.

export interface OrderItemRecord {
  id: string;
  productName: string;
  qty: number;
  unitType: string;
  productData: {
    id: string;
    name: string;
    category: string;
    vendorID: string;
    upc?: string;
    vendorProductName?: string;
    description?: string;
    tags?: string[];
    hide?: boolean;
  };
}

export interface VendorGroupItem {
  productName: string;
  qty: number;
  unitType: string;
  productData: Record<string, unknown>;
}

export interface VendorGroup {
  orderId: string;
  vendorID: string;
  items: VendorGroupItem[];
}

/**
 * Groups items by `productData.vendorID`.
 * If vendorID is missing or undefined, defaults to "UNKNOWN".
 * Empty groups are never produced.
 */
export function groupItemsByVendor(
  items: OrderItemRecord[],
): Map<string, OrderItemRecord[]> {
  const groups = new Map<string, OrderItemRecord[]>();

  for (const item of items) {
    const vendorId = item.productData?.vendorID || "UNKNOWN";
    const existing = groups.get(vendorId);
    if (existing) {
      existing.push(item);
    } else {
      groups.set(vendorId, [item]);
    }
  }

  return groups;
}

/**
 * Constructs a VendorGroup payload preserving all item fields.
 */
export function buildVendorGroup(
  orderId: string,
  vendorId: string,
  items: OrderItemRecord[],
): VendorGroup {
  return {
    orderId,
    vendorID: vendorId,
    items: items.map((item) => ({
      productName: item.productName,
      qty: item.qty,
      unitType: item.unitType,
      productData: { ...item.productData } as Record<string, unknown>,
    })),
  };
}

/**
 * Converts a vendorID string like RESTAURANT_DEPOT to "Restaurant Depot Order".
 * Replaces underscores with spaces, title-cases each word, appends " Order".
 */
export function formatVendorSubject(vendorId: string): string {
  const words = vendorId
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
  return words.join(" ") + " Order";
}
