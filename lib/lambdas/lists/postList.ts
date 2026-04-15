import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { APIGatewayEvent, APIGatewayProxyResult } from "aws-lambda";
import { marshall } from "@aws-sdk/util-dynamodb";
import { v4 } from "uuid";

export const postList = async (
  event: APIGatewayEvent,
  ddbClient: DynamoDBClient
): Promise<APIGatewayProxyResult> => {
  const randomId = v4();
  const item = JSON.parse(event.body as string);

  const marshalledList = marshall(item.list);

  // milliseconds
  const timestamp = new Date().getTime();

  const result = await ddbClient.send(
    new PutItemCommand({
      TableName: process.env.ORDERED_LIST_TABLE_NAME,
      Item: {
        id: {
          S: randomId,
        },
        timestamp: {
          N: timestamp.toString(),
        },
        list: { L: marshalledList as any },
      },
    })
  );
  console.log(result);
  return {
    statusCode: 201,
    body: JSON.stringify({ id: randomId }),
  };
};
