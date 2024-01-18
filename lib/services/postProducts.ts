import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";
import { APIGatewayEvent, APIGatewayProxyResult } from "aws-lambda";
import { marshall } from "@aws-sdk/util-dynamodb";
import { v4 } from "uuid";

export const postProduct = async (
  event: APIGatewayEvent,
  ddbClient: DynamoDBClient
): Promise<APIGatewayProxyResult> => {
  const randomId = v4();
  const product = JSON.parse(event.body as string);
  product.id = randomId;
  const marshalledProduct = marshall(product);

  const result = await ddbClient.send(
    new PutItemCommand({
      TableName: process.env.PRODUCT_TABLE,
      Item: marshalledProduct,
    })
  );
  console.log(result);
  return {
    statusCode: 201,
    body: JSON.stringify({ id: randomId }),
  };
};
