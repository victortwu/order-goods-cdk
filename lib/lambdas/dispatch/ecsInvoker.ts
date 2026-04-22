import {
  ECSClient,
  RunTaskCommand,
  DescribeTasksCommand,
} from "@aws-sdk/client-ecs";
import {
  CloudWatchLogsClient,
  GetLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import { VendorGroup } from "./vendorRouter";

// --- Local type definitions for the dispatch handler ---
// These mirror the types in the Playwright package but are defined here
// so the CDK Lambda has no runtime dependency on the Playwright package.

export type OrderResultStatus =
  | "success"
  | "partial_success"
  | "failure"
  | "auth_failure"
  | "connection_failure"
  | "credential_failure"
  | "browser_failure"
  | "timeout"
  | "delivery_unavailable";

export interface OrderResult {
  orderId: string;
  status: OrderResultStatus;
  timestamp: string;
  itemsAdded: Array<{ productName: string; qty: number; unitType: string }>;
  itemsNotAdded: Array<{
    productName: string;
    qty: number;
    unitType: string;
    reason: string;
  }>;
  errorMessage?: string;
}

// --- Constants ---

const POLL_INTERVAL_MS = 10_000; // 10 seconds between DescribeTasks polls
const MAX_POLL_ATTEMPTS = 180; // 30 minutes max wait (180 × 10s)
const CONTAINER_NAME = "rd-order-bot";

// --- Clients (created once per Lambda cold start) ---

const ecsClient = new ECSClient({});
const cwlClient = new CloudWatchLogsClient({});

// --- Helpers ---
/**
 * Extracts the task ID (last segment) from a full ECS task ARN.
 * Example: "arn:aws:ecs:us-east-1:123456:task/cluster/abc123" → "abc123"
 */
function extractTaskId(taskArn: string): string {
  const segments = taskArn.split("/");
  return segments[segments.length - 1];
}

/**
 * Sleeps for the given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Polls ECS DescribeTasks until the task reaches STOPPED status.
 * Throws if the task cannot be described or polling exceeds the max attempts.
 */
async function waitForTaskCompletion(
  cluster: string,
  taskArn: string,
): Promise<void> {
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    const describeResponse = await ecsClient.send(
      new DescribeTasksCommand({
        cluster,
        tasks: [taskArn],
      }),
    );

    const task = describeResponse.tasks?.[0];
    if (!task) {
      throw new Error(
        `ECS task ${taskArn} not found in DescribeTasks response`,
      );
    }

    const status = task.lastStatus;
    console.log(
      `ECS task ${taskArn} status: ${status} (attempt ${attempt + 1}/${MAX_POLL_ATTEMPTS})`,
    );

    if (status === "STOPPED") {
      // Check for task-level failures
      const container = task.containers?.find((c) => c.name === CONTAINER_NAME);
      if (container && container.exitCode !== 0) {
        console.warn(
          `Container ${CONTAINER_NAME} exited with code ${container.exitCode}: ${container.reason ?? "no reason"}`,
        );
      }
      return;
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(
    `ECS task ${taskArn} did not stop within ${(MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS) / 1000} seconds`,
  );
}

/**
 * Retrieves the OrderResult JSON from CloudWatch Logs.
 *
 * The Playwright CLI writes the OrderResult as a single JSON line to stdout,
 * which the ECS awslogs driver sends to CloudWatch. We read the most recent
 * log events and parse the last non-empty line as JSON.
 */
async function retrieveOrderResultFromLogs(
  taskId: string,
): Promise<OrderResult> {
  const logGroup = process.env.ECS_LOG_GROUP;
  if (!logGroup) {
    throw new Error("ECS_LOG_GROUP environment variable is not set");
  }

  // awslogs driver uses the pattern: {log-stream-prefix}/{container-name}/{task-id}
  const logStream = `ecs/${CONTAINER_NAME}/${taskId}`;

  const response = await cwlClient.send(
    new GetLogEventsCommand({
      logGroupName: logGroup,
      logStreamName: logStream,
      startFromHead: false,
      limit: 50, // grab recent events; the result JSON is typically the last line
    }),
  );

  const events = response.events ?? [];
  if (events.length === 0) {
    throw new Error(
      `No log events found in ${logGroup}/${logStream} for task ${taskId}`,
    );
  }

  // Walk backwards to find the last line that parses as valid OrderResult JSON
  for (let i = events.length - 1; i >= 0; i--) {
    const message = events[i].message?.trim();
    if (!message) continue;

    try {
      const parsed = JSON.parse(message) as OrderResult;
      // Basic shape validation
      if (parsed.orderId && parsed.status && parsed.timestamp) {
        return parsed;
      }
    } catch {
      // Not JSON — skip and try the previous event
    }
  }

  throw new Error(
    `Could not find a valid OrderResult JSON in logs for task ${taskId}`,
  );
}

// --- Main export ---

/**
 * Invokes the Playwright order bot as an ECS/Fargate task and returns the OrderResult.
 *
 * 1. Starts a Fargate task with the VendorGroup payload as a container env var override.
 * 2. Polls DescribeTasks until the task reaches STOPPED status.
 * 3. Retrieves the OrderResult from CloudWatch Logs.
 *
 * Requirements: 9.1, 9.4
 */
export async function invokePlaywrightTask(
  vendorGroup: VendorGroup,
): Promise<OrderResult> {
  const cluster = process.env.ECS_CLUSTER_ARN;
  const taskDefinition = process.env.ECS_TASK_DEFINITION_ARN;
  const subnetIds = process.env.ECS_SUBNET_IDS;
  const securityGroupIds = process.env.ECS_SECURITY_GROUP_IDS;

  if (!cluster)
    throw new Error("ECS_CLUSTER_ARN environment variable is not set");
  if (!taskDefinition)
    throw new Error("ECS_TASK_DEFINITION_ARN environment variable is not set");
  if (!subnetIds)
    throw new Error("ECS_SUBNET_IDS environment variable is not set");
  if (!securityGroupIds)
    throw new Error("ECS_SECURITY_GROUP_IDS environment variable is not set");

  const subnets = subnetIds.split(",").map((s) => s.trim());
  const securityGroups = securityGroupIds.split(",").map((s) => s.trim());

  console.log(
    `Starting Fargate task for order ${vendorGroup.orderId}, vendor ${vendorGroup.vendorID}`,
  );

  // Step 1: Run the Fargate task
  const runTaskResponse = await ecsClient.send(
    new RunTaskCommand({
      cluster,
      taskDefinition,
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
            name: CONTAINER_NAME,
            environment: [
              {
                name: "VENDOR_GROUP_PAYLOAD",
                value: JSON.stringify(vendorGroup),
              },
            ],
          },
        ],
      },
    }),
  );

  const taskArn = runTaskResponse.tasks?.[0]?.taskArn;
  if (!taskArn) {
    const failures = runTaskResponse.failures ?? [];
    const failureReasons = failures
      .map((f) => `${f.arn}: ${f.reason}`)
      .join("; ");
    throw new Error(
      `Failed to start ECS task: ${failureReasons || "no task ARN returned"}`,
    );
  }

  const taskId = extractTaskId(taskArn);
  console.log(`ECS task started: ${taskArn} (taskId: ${taskId})`);

  // Step 2: Wait for the task to complete
  await waitForTaskCompletion(cluster, taskArn);

  // Step 3: Retrieve the OrderResult from CloudWatch Logs
  const orderResult = await retrieveOrderResultFromLogs(taskId);
  console.log(
    `Order result for ${vendorGroup.orderId}: status=${orderResult.status}, ` +
      `added=${orderResult.itemsAdded.length}, notAdded=${orderResult.itemsNotAdded.length}`,
  );

  return orderResult;
}
