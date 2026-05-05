import {
  CloudWatchLogsClient,
  GetLogEventsCommand,
} from "@aws-sdk/client-cloudwatch-logs";
import { ResultProcessorInput, OrderResult } from "./constants/types";

const cwlClient = new CloudWatchLogsClient({});

const extractTaskId = (taskArn: string): string => {
  const segments = taskArn.split("/");
  return segments[segments.length - 1];
};

export const handler = async (
  event: ResultProcessorInput,
): Promise<OrderResult> => {
  const { taskArn, logGroupName, containerName } = event;
  const taskId = extractTaskId(taskArn);
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
