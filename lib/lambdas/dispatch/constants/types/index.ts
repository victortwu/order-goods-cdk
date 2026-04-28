// Shared types for the dispatch Lambda

// --- Order Item Types ---

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

// --- Order Result Types ---

export type OrderResultStatus =
  | "success"
  | "partial_success"
  | "failure"
  | "auth_failure"
  | "connection_failure"
  | "credential_failure"
  | "browser_failure"
  | "timeout"
  | "delivery_unavailable";

export interface OrderResult {
  orderId: string;
  status: OrderResultStatus;
  timestamp: string;
  itemsAdded: Array<{ productName: string; qty: number; unitType: string }>;
  itemsNotAdded: Array<{
    productName: string;
    qty: number;
    unitType: string;
    reason: string;
  }>;
  errorMessage?: string;
}

// --- SSM Config Types ---

export interface SharedConfig {
  clusterArn: string;
  subnetIds: string;
  securityGroupIds: string;
}

export interface VendorConfig {
  taskDefinitionArn: string;
  taskDefinitionFamily: string;
  logGroupName: string;
}
