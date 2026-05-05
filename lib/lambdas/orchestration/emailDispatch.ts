import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { EmailDispatchInput, VendorGroup } from "./constants/types";

const sesClient = new SESClient({});

const RESTAURANT_INFO = {
  name: "The Berliner Döner Kebab",
  address: "428 Westlake Ave N\nSuite 101\nSeattle, WA 98109",
  contactName: "Victor Twu",
} as const;

const formatEmailBody = (vendorGroup: VendorGroup): string => {
  const itemLines = vendorGroup.items
    .map((item) => `${item.qty} ${item.productName}`)
    .join("\n");

  return `Hello, we would like to order:\n\n${itemLines}\n\nThank you,\n${RESTAURANT_INFO.contactName}\n\n${RESTAURANT_INFO.name}\n${RESTAURANT_INFO.address}`;
};

export const handler = async (event: EmailDispatchInput): Promise<void> => {
  const { vendorGroup, emailConfig, recipientEmail } = event;
  const { vendorEmail, notificationEmail } = emailConfig;

  const subject = `Order for ${RESTAURANT_INFO.name}`;
  const body = formatEmailBody(vendorGroup);

  let vendorError: string | undefined;

  try {
    await sesClient.send(
      new SendEmailCommand({
        Destination: { ToAddresses: [vendorEmail] },
        Message: {
          Subject: { Data: subject },
          Body: { Text: { Data: body } },
        },
        Source: recipientEmail,
      }),
    );
  } catch (err) {
    vendorError = err instanceof Error ? err.message : "Unknown email error";
    console.error(`Failed to send vendor email to ${vendorEmail}:`, err);
  }

  const notificationBody = vendorError
    ? `${body}\n\n--- EMAIL SEND ERROR ---\nFailed to send to ${vendorEmail}: ${vendorError}`
    : `${body}\n\n--- Sent to: ${vendorEmail} ---`;

  await sesClient.send(
    new SendEmailCommand({
      Destination: { ToAddresses: [notificationEmail] },
      Message: {
        Subject: {
          Data: vendorError ? `[FAILED] ${subject}` : `[Notification] ${subject}`,
        },
        Body: { Text: { Data: notificationBody } },
      },
      Source: recipientEmail,
    }),
  );
};
