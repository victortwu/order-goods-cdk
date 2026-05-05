// Shared types for orchestration Lambdas

export type DispatchMethod = "ecs_bot" | "email" | "api";

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

export interface EcsConfig {
  clusterArn: string;
  subnets: string[];
  securityGroups: string[];
  taskDefinitionFamily: string;
  containerName: string;
  logGroupName: string;
}

export interface EmailConfig {
  vendorEmail: string;
  notificationEmail: string;
}

export interface ExecutionInput {
  orderId: string;
  vendorId: string;
  dispatchMethod: DispatchMethod;
  vendorGroup: VendorGroup;
  ecsConfig?: EcsConfig;
  emailConfig?: EmailConfig;
  recipientEmail: string;
  stage: string;
}

export interface ResultProcessorInput {
  taskArn: string;
  logGroupName: string;
  containerName: string;
}

export interface NotificationInput {
  type: "success" | "failure";
  recipientEmail: string;
  vendorGroup: VendorGroup;
  orderResult?: OrderResult;
  error?: string;
}

export interface EmailDispatchInput {
  vendorGroup: VendorGroup;
  emailConfig: EmailConfig;
  recipientEmail: string;
}
