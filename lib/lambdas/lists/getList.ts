import {
  AttributeValue,
  DynamoDBClient,
  GetItemCommand,
} from "@aws-sdk/client-dynamodb";
import { APIGatewayEvent, APIGatewayProxyResult } from "aws-lambda";
import { unmarshall, marshall } from "@aws-sdk/util-dynamodb";

export const getList = async (
  event: APIGatewayEvent,
  ddbClient: DynamoDBClient
): Promise<APIGatewayProxyResult> => {
  if (event.queryStringParameters && "id" in event.queryStringParameters) {
    const listId = event.queryStringParameters["id"];

    const marshalledListId = marshall(listId);

    const getListResponse = await ddbClient.send(
      new GetItemCommand({
        TableName: process.env.ORDERED_LIST_TABLE_NAME,
        Key: {
          id: marshalledListId as unknown as AttributeValue,
        },
      })
    );

    if (getListResponse.Item) {
      const unmarshalledItem = unmarshall(getListResponse.Item);
      return {
        statusCode: 200,
        body: JSON.stringify(unmarshalledItem),
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
