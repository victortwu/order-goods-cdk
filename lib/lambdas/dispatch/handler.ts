import { DynamoDBStreamEvent } from "aws-lambda";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { AttributeValue } from "@aws-sdk/client-dynamodb";
import {
  groupItemsByVendor,
  buildVendorGroup,
  formatVendorSubject,
  OrderItemRecord,
} from "./vendorRouter";

const sesClient = new SESClient({});

export const dispatchHandler = async (
  event: DynamoDBStreamEvent,
): Promise<void> => {
  const recipientEmail = process.env.RECIPIENT_EMAIL;

  for (const record of event.Records) {
    // Task 3.2: INSERT-only filtering
    if (record.eventName !== "INSERT") {
      console.debug(`Skipping ${record.eventName} event`);
      continue;
    }

    // Task 3.3: Unmarshall NewImage
    if (!record.dynamodb?.NewImage) {
      console.error("Missing dynamodb.NewImage on INSERT record", {
        eventID: record.eventID,
      });
      continue;
    }

    const newImage = unmarshall(
      record.dynamodb.NewImage as Record<string, AttributeValue>,
    );
    const orderId = newImage.id as string;
    const list = (newImage.list ?? []) as OrderItemRecord[];

    if (!list.length) {
      console.warn(`Order ${orderId} has an empty list, skipping`);
      continue;
    }

    // Task 3.4: Vendor routing
    const vendorGroups = groupItemsByVendor(list);

    for (const [vendorId, items] of vendorGroups) {
      const vendorGroup = buildVendorGroup(orderId, vendorId, items);

      // Task 3.5 & 3.6: SES email sending with continue-on-failure
      try {
        await sesClient.send(
          new SendEmailCommand({
            Destination: {
              ToAddresses: [recipientEmail!],
            },
            Message: {
              Subject: {
                Data: formatVendorSubject(vendorId),
              },
              Body: {
                Text: {
                  Data: JSON.stringify(vendorGroup, null, 2),
                },
              },
            },
            Source: recipientEmail!,
          }),
        );
      } catch (error) {
        console.error(
          `Failed to send email for vendor ${vendorId}, order ${orderId}:`,
          error,
        );
      }
    }
  }
};
