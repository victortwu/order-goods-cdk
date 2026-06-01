import { DynamoDBClient, QueryCommand } from "@aws-sdk/client-dynamodb";
import { APIGatewayEvent, APIGatewayProxyResult } from "aws-lambda";
import { unmarshall } from "@aws-sdk/util-dynamodb";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

export const getRecentLists = async (
  event: APIGatewayEvent,
  ddbClient: DynamoDBClient,
): Promise<APIGatewayProxyResult> => {
  const requestedLimit = parseInt(event.queryStringParameters?.recent ?? "", 10);
  const limit = Math.min(
    Number.isNaN(requestedLimit) || requestedLimit < 1 ? DEFAULT_LIMIT : requestedLimit,
    MAX_LIMIT,
  );

  const result = await ddbClient.send(
    new QueryCommand({
      TableName: process.env.ORDERED_LIST_TABLE_NAME,
      IndexName: "EntityTypeTimestampIndex",
      KeyConditionExpression: "entityType = :et",
      ExpressionAttributeValues: { ":et": { S: "order" } },
      ScanIndexForward: false,
      Limit: limit,
    }),
  );

  const items = (result.Items ?? []).map((item) => unmarshall(item));

  return {
    statusCode: 200,
    body: JSON.stringify(items),
  };
};
