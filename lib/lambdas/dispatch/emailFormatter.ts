import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { OrderResult, VendorGroup, RESTAURANT_INFO } from "./constants/types";

const sesClient = new SESClient({});

// --- Pure formatting functions ---

export const formatOrderResultSubject = (
  orderId: string,
  status: string,
): string => `Restaurant Depot Order ${orderId} — ${status}`;

export const formatOrderResultBody = (result: OrderResult): string => {
  const lines: string[] = [];

  lines.push(`Order ID: ${result.orderId}`);
  lines.push(`Status:   ${result.status}`);
  lines.push(`Time:     ${result.timestamp}`);
  lines.push("");

  if (result.itemsAdded.length > 0) {
    lines.push(`Items Added (${result.itemsAdded.length}):`);
    for (const item of result.itemsAdded) {
      lines.push(
        `  - ${item.productName}  qty: ${item.qty}  unit: ${item.unitType}`,
      );
    }
    lines.push("");
  }

  if (result.itemsNotAdded.length > 0) {
    lines.push(`Items Not Added (${result.itemsNotAdded.length}):`);
    for (const item of result.itemsNotAdded) {
      lines.push(
        `  - ${item.productName}  qty: ${item.qty}  unit: ${item.unitType}  reason: ${item.reason}`,
      );
    }
    lines.push("");
  }

  if (result.errorMessage) {
    lines.push(`Error: ${result.errorMessage}`);
    lines.push("");
  }

  return lines.join("\n");
};

/**
 * Formats a Westcoast Pita order email body.
 * Lists each item as: productName — qty unitType
 */
export const formatWestcoastPitaBody = (vendorGroup: VendorGroup): string => {
  const { name, address, contactName } = RESTAURANT_INFO;

  const itemLines = vendorGroup.items
    .map((item) => `${item.qty} ${item.productName}`)
    .join("\n");

  return `Hello, we would like to order:\n\n${itemLines}\n\nThank you,\n${contactName}\n\n${name}\n${address}`;
};

// --- Email sending functions ---

export const sendOrderResultEmail = async (
  result: OrderResult,
  recipient: string,
): Promise<void> => {
  const sourceEmail = process.env.RECIPIENT_EMAIL;

  await sesClient.send(
    new SendEmailCommand({
      Destination: { ToAddresses: [recipient] },
      Message: {
        Subject: {
          Data: formatOrderResultSubject(result.orderId, result.status),
        },
        Body: { Text: { Data: formatOrderResultBody(result) } },
      },
      Source: sourceEmail!,
    }),
  );
};

export const sendFallbackEmail = async (
  vendorGroup: VendorGroup,
  recipient: string,
): Promise<void> => {
  const sourceEmail = process.env.RECIPIENT_EMAIL;

  await sesClient.send(
    new SendEmailCommand({
      Destination: { ToAddresses: [recipient] },
      Message: {
        Subject: {
          Data: `Restaurant Depot Order ${vendorGroup.orderId} — Automation Failed (Fallback)`,
        },
        Body: { Text: { Data: JSON.stringify(vendorGroup, null, 2) } },
      },
      Source: sourceEmail!,
    }),
  );
};

/**
 * Sends a vendor order email and a notification copy to the owner.
 * - Sends the formatted email to vendorEmail
 * - Always sends a notification to notificationEmail with the same content
 *   (plus error details if the vendor email failed)
 */
export const sendVendorOrderEmail = async (params: {
  vendorEmail: string;
  notificationEmail: string;
  subject: string;
  body: string;
}): Promise<void> => {
  const { vendorEmail, notificationEmail, subject, body } = params;
  const sourceEmail = process.env.RECIPIENT_EMAIL!;

  let vendorError: string | undefined;

  // Send to vendor
  try {
    await sesClient.send(
      new SendEmailCommand({
        Destination: { ToAddresses: [vendorEmail] },
        Message: {
          Subject: { Data: subject },
          Body: { Text: { Data: body } },
        },
        Source: sourceEmail,
      }),
    );
  } catch (error) {
    vendorError =
      error instanceof Error ? error.message : "Unknown email error";
    console.error(`Failed to send vendor email to ${vendorEmail}:`, error);
  }

  // Send notification to self (always)
  const notificationBody = vendorError
    ? `${body}\n\n--- EMAIL SEND ERROR ---\nFailed to send to ${vendorEmail}: ${vendorError}`
    : `${body}\n\n--- Sent to: ${vendorEmail} ---`;

  await sesClient.send(
    new SendEmailCommand({
      Destination: { ToAddresses: [notificationEmail] },
      Message: {
        Subject: {
          Data: vendorError
            ? `[FAILED] ${subject}`
            : `[Notification] ${subject}`,
        },
        Body: { Text: { Data: notificationBody } },
      },
      Source: sourceEmail,
    }),
  );
};
