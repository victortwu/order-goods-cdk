import {
  ECSClient,
  RunTaskCommand,
  DescribeTasksCommand,
} from "@aws-sdk/client-ecs";
import {
  CloudWatchLogsClient,
  GetLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import { VendorGroup, OrderResult } from "./constants/types";
import { getSharedConfig, getVendorConfig } from "./ssmConfig";

const POLL_INTERVAL_MS = 10_000;
const MAX_POLL_ATTEMPTS = 180;

const ecsClient = new ECSClient({});
const cwlClient = new CloudWatchLogsClient({});

const extractTaskId = (taskArn: string): string => {
  const segments = taskArn.split("/");
  return segments[segments.length - 1];
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const waitForTaskCompletion = async (
  cluster: string,
  taskArn: string,
  containerName: string,
): Promise<void> => {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const resp = await ecsClient.send(
      new DescribeTasksCommand({ cluster, tasks: [taskArn] }),
    );
    const task = resp.tasks?.[0];
    if (!task) throw new Error(`ECS task ${taskArn} not found`);

    console.log(
      `ECS task ${taskArn} status: ${task.lastStatus} (attempt ${attempt + 1}/${MAX_POLL_ATTEMPTS})`,
    );

    if (task.lastStatus === "STOPPED") {
      const container = task.containers?.find((c) => c.name === containerName);
      if (container && container.exitCode !== 0) {
        console.warn(
          `Container ${containerName} exited with code ${container.exitCode}: ${container.reason ?? "no reason"}`,
        );
      }
      return;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(
    `ECS task ${taskArn} did not stop within ${(MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s`,
  );
};

const retrieveOrderResultFromLogs = async (
  logGroupName: string,
  containerName: string,
  taskId: string,
): Promise<OrderResult> => {
  const logStream = `${containerName}/${containerName}/${taskId}`;

  const response = await cwlClient.send(
    new GetLogEventsCommand({
      logGroupName,
      logStreamName: logStream,
      startFromHead: false,
      limit: 50,
    }),
  );

  const events = response.events ?? [];
  if (events.length === 0) {
    throw new Error(
      `No log events found in ${logGroupName}/${logStream} for task ${taskId}`,
    );
  }

  for (let i = events.length - 1; i >= 0; i--) {
    const message = events[i].message?.trim();
    if (!message) continue;
    try {
      const parsed = JSON.parse(message) as OrderResult;
      if (parsed.orderId && parsed.status && parsed.timestamp) return parsed;
    } catch {
      // Not JSON — skip
    }
  }

  throw new Error(
    `Could not find a valid OrderResult JSON in logs for task ${taskId}`,
  );
};

/**
 * Invokes the Playwright order bot as an ECS/Fargate task and returns the OrderResult.
 * Reads all infrastructure config from SSM Parameter Store (cached per cold start).
 */
export const invokePlaywrightTask = async (
  vendorGroup: VendorGroup,
  vendorId: string,
): Promise<OrderResult> => {
  const stage = process.env.STAGE;
  if (!stage) throw new Error("STAGE environment variable is not set");

  const shared = await getSharedConfig(stage);
  const vendor = await getVendorConfig(stage, vendorId);

  const containerName = `${vendorId}-bot`;
  const subnets = shared.subnetIds.split(",").map((s) => s.trim());
  const securityGroups = shared.securityGroupIds
    .split(",")
    .map((s) => s.trim());

  console.log(
    `Starting Fargate task for order ${vendorGroup.orderId}, vendor ${vendorId}`,
  );

  const runResp = await ecsClient.send(
    new RunTaskCommand({
      cluster: shared.clusterArn,
      taskDefinition: vendor.taskDefinitionFamily,
      launchType: "FARGATE",
      networkConfiguration: {
        awsvpcConfiguration: {
          subnets,
          securityGroups,
          assignPublicIp: "DISABLED",
        },
      },
      overrides: {
        containerOverrides: [
          {
            name: containerName,
            environment: [
              {
                name: "VENDOR_GROUP_PAYLOAD",
                value: JSON.stringify({
                  orderId: vendorGroup.orderId,
                  vendorID: vendorGroup.vendorID,
                  items: vendorGroup.items.map(({ productName, qty, unitType, productData }) => ({
                    productName,
                    qty,
                    unitType,
                    productData: {
                      vendorProductName: productData.vendorProductName ?? "",
                      upc: productData.upc ?? "",
                    },
                  })),
                }),
              },
            ],
          },
        ],
      },
    }),
  );

  const taskArn = runResp.tasks?.[0]?.taskArn;
  if (!taskArn) {
    const reasons = (runResp.failures ?? [])
      .map((f) => `${f.arn}: ${f.reason}`)
      .join("; ");
    throw new Error(
      `Failed to start ECS task: ${reasons || "no task ARN returned"}`,
    );
  }

  const taskId = extractTaskId(taskArn);
  console.log(`ECS task started: ${taskArn} (taskId: ${taskId})`);

  await waitForTaskCompletion(shared.clusterArn, taskArn, containerName);

  const orderResult = await retrieveOrderResultFromLogs(
    vendor.logGroupName,
    containerName,
    taskId,
  );
  console.log(
    `Order result for ${vendorGroup.orderId}: status=${orderResult.status}, ` +
      `added=${orderResult.itemsAdded.length}, notAdded=${orderResult.itemsNotAdded.length}`,
  );

  return orderResult;
};
