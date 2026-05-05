import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { NotificationInput, OrderResult, VendorGroup } from "./constants/types";

const sesClient = new SESClient({});

const formatSuccessBody = (result: OrderResult): string => {
  const lines: string[] = [
    `Order ID: ${result.orderId}`,
    `Status:   ${result.status}`,
    `Time:     ${result.timestamp}`,
    "",
  ];

  if (result.itemsAdded.length > 0) {
    lines.push(`Items Added (${result.itemsAdded.length}):`);
    for (const item of result.itemsAdded) {
      lines.push(`  - ${item.productName}  qty: ${item.qty}  unit: ${item.unitType}`);
    }
    lines.push("");
  }

  if (result.itemsNotAdded.length > 0) {
    lines.push(`Items Not Added (${result.itemsNotAdded.length}):`);
    for (const item of result.itemsNotAdded) {
      lines.push(`  - ${item.productName}  qty: ${item.qty}  unit: ${item.unitType}  reason: ${item.reason}`);
    }
    lines.push("");
  }

  if (result.errorMessage) {
    lines.push(`Error: ${result.errorMessage}`, "");
  }

  return lines.join("\n");
};

const formatFailureBody = (vendorGroup: VendorGroup, error?: string): string =>
  `Order ${vendorGroup.orderId} for vendor ${vendorGroup.vendorID} failed.\n\nError: ${error ?? "Unknown"}\n\nPayload:\n${JSON.stringify(vendorGroup, null, 2)}`;

export const handler = async (event: NotificationInput): Promise<void> => {
  const { type, recipientEmail, vendorGroup, orderResult, error } = event;

  const subject =
    type === "success"
      ? `Order ${vendorGroup.orderId} — ${orderResult!.status}`
      : `Order ${vendorGroup.orderId} — Automation Failed (Fallback)`;

  const body =
    type === "success"
      ? formatSuccessBody(orderResult!)
      : formatFailureBody(vendorGroup, error);

  await sesClient.send(
    new SendEmailCommand({
      Destination: { ToAddresses: [recipientEmail] },
      Message: {
        Subject: { Data: subject },
        Body: { Text: { Data: body } },
      },
      Source: recipientEmail,
    }),
  );
};
