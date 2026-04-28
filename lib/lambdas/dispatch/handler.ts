import { DynamoDBStreamEvent } from "aws-lambda";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses";
import { AttributeValue } from "@aws-sdk/client-dynamodb";
import { OrderItemRecord, RESTAURANT_INFO, VendorGroup, VendorID } from "./constants/types";
import {
  groupItemsByVendor,
  buildVendorGroup,
  formatVendorSubject,
  normalizeVendorId,
} from "./vendorRouter";
import { invokePlaywrightTask } from "./ecsInvoker";
import {
  sendOrderResultEmail,
  sendFallbackEmail,
  sendVendorOrderEmail,
  formatWestcoastPitaBody,
} from "./emailFormatter";
import { getVendorEmail } from "./ssmConfig";

const sesClient = new SESClient({});

/**
 * Sends a generic vendor order email via SES (fallback for vendors without specific handling).
 */
const sendGenericVendorEmail = async (
  vendorGroup: VendorGroup,
  recipientEmail: string,
): Promise<void> => {
  await sesClient.send(
    new SendEmailCommand({
      Destination: { ToAddresses: [recipientEmail] },
      Message: {
        Subject: { Data: formatVendorSubject(vendorGroup.vendorID) },
        Body: { Text: { Data: JSON.stringify(vendorGroup, null, 2) } },
      },
      Source: recipientEmail,
    }),
  );
};

export const dispatchHandler = async (
  event: DynamoDBStreamEvent,
): Promise<void> => {
  const recipientEmail = process.env.RECIPIENT_EMAIL!;
  const stage = process.env.STAGE!;

  for (const record of event.Records) {
    if (record.eventName !== "INSERT") {
      console.debug(`Skipping ${record.eventName} event`);
      continue;
    }

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

    const vendorGroups = groupItemsByVendor(list);

    for (const [vendorId, items] of vendorGroups) {
      const vendorGroup = buildVendorGroup(orderId, vendorId, items);

      switch (vendorId) {
        case VendorID.RESTAURANT_DEPOT: {
          const normalizedVendorId = normalizeVendorId(vendorId);
          try {
            const orderResult = await invokePlaywrightTask(
              vendorGroup,
              normalizedVendorId,
            );
            try {
              await sendOrderResultEmail(orderResult, recipientEmail);
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
            try {
              await sendFallbackEmail(vendorGroup, recipientEmail);
            } catch (fallbackError) {
              console.error(
                `Failed to send fallback email for order ${orderId}:`,
                fallbackError,
              );
            }
          }
          break;
        }

        case VendorID.WESTCOAST_PITA: {
          try {
            const normalizedVendorId = normalizeVendorId(vendorId);
            const vendorEmail = await getVendorEmail(stage, normalizedVendorId);
            const subject = `Order for ${RESTAURANT_INFO.name}`;
            const body = formatWestcoastPitaBody(vendorGroup);

            await sendVendorOrderEmail({
              vendorEmail,
              notificationEmail: recipientEmail,
              subject,
              body,
            });
          } catch (error) {
            console.error(
              `Failed to process WESTCOAST_PITA for order ${orderId}:`,
              error,
            );
          }
          break;
        }

        default: {
          try {
            await sendGenericVendorEmail(vendorGroup, recipientEmail);
          } catch (error) {
            console.error(
              `Failed to send email for vendor ${vendorId}, order ${orderId}:`,
              error,
            );
          }
          break;
        }
      }
    }
  }
};
