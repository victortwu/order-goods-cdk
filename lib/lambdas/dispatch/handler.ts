import { DynamoDBStreamEvent } from "aws-lambda";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { AttributeValue } from "@aws-sdk/client-dynamodb";
import { OrderItemRecord, VendorGroup } from "./constants/types";
import {
  groupItemsByVendor,
  buildVendorGroup,
  formatVendorSubject,
} from "./vendorRouter";
import { invokePlaywrightTask } from "./ecsInvoker";
import { sendOrderResultEmail, sendFallbackEmail } from "./emailFormatter";

const sesClient = new SESClient({});

/**
 * Sends a vendor order email via SES (the original email path for non-RESTAURANT_DEPOT vendors).
 */
const sendVendorEmail = async (
  vendorGroup: VendorGroup,
  recipientEmail: string,
): Promise<void> => {
  await sesClient.send(
    new SendEmailCommand({
      Destination: {
        ToAddresses: [recipientEmail],
      },
      Message: {
        Subject: {
          Data: formatVendorSubject(vendorGroup.vendorID),
        },
        Body: {
          Text: {
            Data: JSON.stringify(vendorGroup, null, 2),
          },
        },
      },
      Source: recipientEmail,
    }),
  );
};

/**
 * Normalizes a vendorID to the SSM parameter convention.
 * e.g., "RESTAURANT_DEPOT" → "restaurant-depot"
 */
const normalizeVendorId = (vendorID: string): string =>
  vendorID.toLowerCase().replace(/_/g, "-");

export const dispatchHandler = async (
  event: DynamoDBStreamEvent,
): Promise<void> => {
  const recipientEmail = process.env.RECIPIENT_EMAIL;

  for (const record of event.Records) {
    // INSERT-only filtering
    if (record.eventName !== "INSERT") {
      console.debug(`Skipping ${record.eventName} event`);
      continue;
    }

    // Unmarshall NewImage
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

    // Vendor routing
    const vendorGroups = groupItemsByVendor(list);

    for (const [vendorId, items] of vendorGroups) {
      const vendorGroup = buildVendorGroup(orderId, vendorId, items);

      if (vendorId === "RESTAURANT_DEPOT") {
        // Invoke Playwright bot via ECS/Fargate
        const normalizedVendorId = normalizeVendorId(vendorId);
        try {
          const orderResult = await invokePlaywrightTask(
            vendorGroup,
            normalizedVendorId,
          );

          // Inner try/catch: email failure should not trigger fallback
          try {
            await sendOrderResultEmail(orderResult, recipientEmail!);
          } catch (emailError) {
            console.error(
              `Failed to send OrderResult email for order ${orderId}:`,
              emailError,
            );
          }
        } catch (error) {
          console.error(
            `Playwright invocation failed for order ${orderId}:`,
            error,
          );

          // Send fallback email with VendorGroup payload; wrap in try/catch
          // so a fallback email failure doesn't break the loop
          try {
            await sendFallbackEmail(vendorGroup, recipientEmail!);
          } catch (fallbackError) {
            console.error(
              `Failed to send fallback email for order ${orderId}:`,
              fallbackError,
            );
          }
        }
      } else {
        // Existing SES email path for all other vendors
        try {
          await sendVendorEmail(vendorGroup, recipientEmail!);
        } catch (error) {
          console.error(
            `Failed to send email for vendor ${vendorId}, order ${orderId}:`,
            error,
          );
        }
      }
    }
  }
};
