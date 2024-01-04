import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { APIGatewayEvent, APIGatewayProxyResult } from "aws-lambda";
import { v4 } from "uuid";

export const postList = async (
  event: APIGatewayEvent,
  ddbClient: DynamoDBClient
): Promise<APIGatewayProxyResult> => {
  const randomId = v4();
  const item = JSON.parse(event.body as string);

  const result = await ddbClient.send(
    new PutItemCommand({
      TableName: process.env.ORDERED_LIST_TABLE_NAME,
      Item: {
        id: {
          S: randomId,
        },
        list: {
          L: item.list,
        },
      },
    })
  );
  console.log(result);
  return {
    statusCode: 201,
    body: JSON.stringify({ id: randomId }),
  };
};
