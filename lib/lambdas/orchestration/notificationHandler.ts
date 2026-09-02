import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { NotificationInput, OrderResult, VendorGroup, VendorStatus } from "./constants/types";

const sesClient = new SESClient({});
const ddbClient = new DynamoDBClient({});
const smClient = new SecretsManagerClient({});

interface TwilioCredentials {
  accountSid: string;
  apiKeySid: string;
  apiKeySecret: string;
  fromNumber: string;
}

let cachedCredentials: TwilioCredentials | null | undefined = undefined;

const getTwilioCredentials = async (): Promise<TwilioCredentials | null> => {
  if (cachedCredentials !== undefined) return cachedCredentials;

  const secretName = `bdk/${process.env.STAGE}/twilio-credentials`;
  try {
    const { SecretString } = await smClient.send(
      new GetSecretValueCommand({ SecretId: secretName }),
    );
    cachedCredentials = JSON.parse(SecretString!) as TwilioCredentials;
  } catch {
    console.log("Twilio credentials not found — SMS disabled for this stage");
    cachedCredentials = null;
  }

  return cachedCredentials;
};

const updateVendorStatus = async (
  tableName: string,
  orderId: string,
  vendorId: string,
  status: VendorStatus,
) => {
  await ddbClient.send(
    new UpdateItemCommand({
      TableName: tableName,
      Key: { id: { S: orderId } },
      UpdateExpression: "SET vendorStatuses.#vid = :status",
      ExpressionAttributeNames: { "#vid": vendorId },
      ExpressionAttributeValues: {
        ":status": {
          M: {
            status: { S: status },
            timestamp: { S: new Date().toISOString() },
          },
        },
      },
    }),
  );
};

const sendSms = async (recipientPhone: string, message: string) => {
  const creds = await getTwilioCredentials();
  if (!creds) return;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Messages.json`;

  const body = new URLSearchParams({
    To: recipientPhone,
    From: creds.fromNumber,
    Body: message,
  });

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${creds.apiKeySid}:${creds.apiKeySecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error("Twilio SMS failed:", response.status, errorBody);
    } else {
      const result = await response.json();
      console.log("SMS sent:", result.sid);
    }
  } catch (err) {
    console.error("Twilio SMS request error:", err);
  }
};

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
      lines.push(
        `  - ${item.productName}  qty: ${item.qty}  unit: ${item.unitType}  reason: ${item.reason}`,
      );
    }
    lines.push("");
  }

  if (result.errorMessage) {
    lines.push(`Error: ${result.errorMessage}`, "");
  }

  return lines.join("\n");
};

const formatFailureBody = (vendorGroup: VendorGroup, error?: string): string =>
  `Order ${vendorGroup.orderId} for vendor ${vendorGroup.vendorID} failed.\n\nError: ${error ?? "Unknown"}`;

const formatNotConfiguredBody = (vendorGroup: VendorGroup): string => {
  const itemLines = vendorGroup.items
    .map((item) => `  - ${item.qty} ${item.productName}`)
    .join("\n");

  return [
    `${vendorGroup.vendorID} — Manual Action Required`,
    "",
    "The following items require manual ordering (no automation configured):",
    "",
    itemLines,
    "",
    `Order ID: ${vendorGroup.orderId}`,
  ].join("\n");
};

export const handler = async (event: NotificationInput): Promise<void> => {
  const { type, recipientEmail, recipientPhone, tableName, vendorGroup, orderResult, error } =
    event;

  let subject: string;
  let body: string;
  let smsMessage: string;
  let status: VendorStatus;

  switch (type) {
    case "success":
      status = orderResult!.status;
      subject = `Order ${vendorGroup.orderId} — ${orderResult!.status}`;
      body = formatSuccessBody(orderResult!);
      smsMessage = `${vendorGroup.vendorID} order is ready for your review.`;
      break;
    case "failure":
      status = "failure";
      subject = `Order ${vendorGroup.orderId} — Automation Failed (Fallback)`;
      body = formatFailureBody(vendorGroup, error);
      smsMessage = `${vendorGroup.vendorID} order failed. Check email for details.`;
      break;
    case "email_sent":
      status = "email_sent";
      subject = `Order ${vendorGroup.orderId} — Email Sent to ${vendorGroup.vendorID}`;
      body = `Email order for ${vendorGroup.vendorID} has been sent.\n\nItems:\n${vendorGroup.items.map((i) => `  - ${i.qty} ${i.productName}`).join("\n")}`;
      smsMessage = `${vendorGroup.vendorID} order is ready for your review.`;
      break;
    case "not_configured":
      status = "not_configured";
      subject = `${vendorGroup.vendorID} — Manual Action Required`;
      body = formatNotConfiguredBody(vendorGroup);
      smsMessage = `${vendorGroup.vendorID}: ${vendorGroup.items.length} items require manual ordering.`;
      break;
  }

  // 1. Update vendor status in DynamoDB
  const normalizedVendorId = vendorGroup.vendorID.toLowerCase().replace(/_/g, "-");
  await updateVendorStatus(tableName, vendorGroup.orderId, normalizedVendorId, status);

  // 2. Send email via SES
  await sesClient.send(
    new SendEmailCommand({
      Destination: { ToAddresses: [recipientEmail] },
      Message: {
        Subject: { Data: subject },
        Body: { Text: { Data: body } },
      },
      Source: "orders@eatbdk.com",
    }),
  );

  // 3. Send SMS via Twilio
  await sendSms(recipientPhone, smsMessage);
};
