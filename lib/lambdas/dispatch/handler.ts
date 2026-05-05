import { DynamoDBStreamEvent } from "aws-lambda";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import { AttributeValue } from "@aws-sdk/client-dynamodb";
import { OrderItemRecord, VendorID } from "./constants/types";
import {
  groupItemsByVendor,
  buildVendorGroup,
  normalizeVendorId,
} from "./vendorRouter";
import {
  getSharedConfig,
  getVendorConfig,
  getVendorEmail,
  getDispatchMethod,
  getStateMachineArn,
} from "./ssmConfig";

const sfnClient = new SFNClient({});

export const dispatchHandler = async (
  event: DynamoDBStreamEvent,
): Promise<void> => {
  const recipientEmail = process.env.RECIPIENT_EMAIL!;
  const stage = process.env.STAGE!;

  const stateMachineArn = await getStateMachineArn(stage);

  for (const record of event.Records) {
    if (record.eventName !== "INSERT") continue;

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
      const normalizedVendorId = normalizeVendorId(vendorId);
      const vendorGroup = buildVendorGroup(orderId, vendorId, items);

      try {
        const dispatchMethod = await getDispatchMethod(stage, normalizedVendorId);

        const executionInput: Record<string, unknown> = {
          orderId,
          vendorId: normalizedVendorId,
          dispatchMethod,
          vendorGroup,
          recipientEmail,
          stage,
        };

        if (dispatchMethod === "ecs_bot") {
          const shared = await getSharedConfig(stage);
          const vendor = await getVendorConfig(stage, normalizedVendorId);
          executionInput.ecsConfig = {
            clusterArn: shared.clusterArn,
            subnets: shared.subnetIds.split(",").map((s) => s.trim()),
            securityGroups: shared.securityGroupIds.split(",").map((s) => s.trim()),
            taskDefinitionFamily: vendor.taskDefinitionFamily,
            containerName: `${normalizedVendorId}-bot`,
            logGroupName: vendor.logGroupName,
          };
          // Slim vendorGroup for ECS container override (8192 byte limit)
          executionInput.vendorGroup = {
            orderId: vendorGroup.orderId,
            vendorID: vendorGroup.vendorID,
            items: vendorGroup.items.map(({ productName, qty, unitType, productData }) => ({
              productName,
              qty,
              unitType,
              productData: {
                vendorProductName: (productData as Record<string, unknown>).vendorProductName ?? "",
                upc: (productData as Record<string, unknown>).upc ?? "",
              },
            })),
          };
        } else if (dispatchMethod === "email") {
          const vendorEmail = await getVendorEmail(stage, normalizedVendorId);
          executionInput.emailConfig = {
            vendorEmail,
            notificationEmail: recipientEmail,
          };
        }

        await sfnClient.send(
          new StartExecutionCommand({
            stateMachineArn,
            name: `${orderId}_${normalizedVendorId}`,
            input: JSON.stringify(executionInput),
          }),
        );

        console.log(
          `Started execution for order ${orderId}, vendor ${vendorId} (${dispatchMethod})`,
        );
      } catch (error) {
        console.error(
          `Failed to start execution for order ${orderId}, vendor ${vendorId}:`,
          error,
        );
      }
    }
  }
};
