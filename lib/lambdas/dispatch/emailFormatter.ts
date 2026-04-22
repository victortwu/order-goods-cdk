import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { OrderResult } from "./ecsInvoker";
import { VendorGroup } from "./vendorRouter";

// --- SES client (created once per Lambda cold start, same pattern as handler.ts) ---

const sesClient = new SESClient({});

// --- Pure formatting functions (testable without AWS SDK mocking) ---

/**
 * Builds the email subject line for an OrderResult notification.
 * Contains both the orderId and the status so the recipient can
 * identify the outcome at a glance.
 *
 * Requirements: 10.6
 */
export function formatOrderResultSubject(
  orderId: string,
  status: string,
): string {
  return `Restaurant Depot Order ${orderId} — ${status}`;
}

/**
 * Builds a plain-text email body summarising an OrderResult.
 * Includes orderId, status, timestamp, itemsAdded, itemsNotAdded,
 * and any error message.  Produces a non-empty string for every
 * possible OrderResultStatus.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4
 */
export function formatOrderResultBody(result: OrderResult): string {
  const lines: string[] = [];

  lines.push(`Order ID: ${result.orderId}`);
  lines.push(`Status:   ${result.status}`);
  lines.push(`Time:     ${result.timestamp}`);
  lines.push("");

  // Items successfully added
  if (result.itemsAdded.length > 0) {
    lines.push(`Items Added (${result.itemsAdded.length}):`);
    for (const item of result.itemsAdded) {
      lines.push(
        `  - ${item.productName}  qty: ${item.qty}  unit: ${item.unitType}`,
      );
    }
    lines.push("");
  }

  // Items that were not added
  if (result.itemsNotAdded.length > 0) {
    lines.push(`Items Not Added (${result.itemsNotAdded.length}):`);
    for (const item of result.itemsNotAdded) {
      lines.push(
        `  - ${item.productName}  qty: ${item.qty}  unit: ${item.unitType}  reason: ${item.reason}`,
      );
    }
    lines.push("");
  }

  // Error message (present for error statuses)
  if (result.errorMessage) {
    lines.push(`Error: ${result.errorMessage}`);
    lines.push("");
  }

  return lines.join("\n");
}

// --- Email sending functions ---

/**
 * Sends an OrderResult summary email via SES.
 *
 * Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6
 */
export async function sendOrderResultEmail(
  result: OrderResult,
  recipient: string,
): Promise<void> {
  const sourceEmail = process.env.RECIPIENT_EMAIL;

  await sesClient.send(
    new SendEmailCommand({
      Destination: {
        ToAddresses: [recipient],
      },
      Message: {
        Subject: {
          Data: formatOrderResultSubject(result.orderId, result.status),
        },
        Body: {
          Text: {
            Data: formatOrderResultBody(result),
          },
        },
      },
      Source: sourceEmail!,
    }),
  );
}

/**
 * Sends a fallback email containing the raw VendorGroup payload.
 * Used when the Playwright bot invocation fails entirely.
 *
 * Requirements: 9.5, 10.7
 */
export async function sendFallbackEmail(
  vendorGroup: VendorGroup,
  recipient: string,
): Promise<void> {
  const sourceEmail = process.env.RECIPIENT_EMAIL;

  await sesClient.send(
    new SendEmailCommand({
      Destination: {
        ToAddresses: [recipient],
      },
      Message: {
        Subject: {
          Data: `Restaurant Depot Order ${vendorGroup.orderId} — Automation Failed (Fallback)`,
        },
        Body: {
          Text: {
            Data: JSON.stringify(vendorGroup, null, 2),
          },
        },
      },
      Source: sourceEmail!,
    }),
  );
}
