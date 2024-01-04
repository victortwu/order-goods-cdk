import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { APIGatewayEvent, APIGatewayProxyResult } from "aws-lambda";

export const getList = async (
  event: APIGatewayEvent,
  ddbClient: DynamoDBClient
): Promise<APIGatewayProxyResult> => {
  if (event.queryStringParameters && "id" in event.queryStringParameters) {
    const listId = event.queryStringParameters["id"];

    const getListResponse = await ddbClient.send(
      new GetItemCommand({
        TableName: process.env.ORDERED_LIST_TABLE_NAME,
        Key: {
          id: { S: listId as string },
        },
      })
    );

    if (getListResponse.Item) {
      return {
        statusCode: 200,
        body: JSON.stringify(getListResponse.Item),
      };
    } else {
      return {
        statusCode: 404,
        body: JSON.stringify(`List id of ${listId} not found.`),
      };
    }
  } else {
    return {
      statusCode: 400,
      body: JSON.stringify("No id, or bad request parameter provided."),
    };
  }
};
