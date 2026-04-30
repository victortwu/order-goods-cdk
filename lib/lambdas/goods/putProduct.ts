import { DynamoDBClient, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import { APIGatewayEvent, APIGatewayProxyResult } from "aws-lambda";
import { marshall } from "@aws-sdk/util-dynamodb";

export const putProduct = async (
  event: APIGatewayEvent,
  ddbClient: DynamoDBClient,
): Promise<APIGatewayProxyResult> => {
  const body = JSON.parse(event.body as string);
  const { id, ...fields } = body;

  if (!id) {
    return { statusCode: 400, body: JSON.stringify("id is required") };
  }

  if (Object.keys(fields).length === 0) {
    return { statusCode: 400, body: JSON.stringify("No fields to update") };
  }

  const expressionParts: string[] = [];
  const expressionAttrNames: Record<string, string> = {};
  const expressionAttrValues: Record<string, any> = {};

  for (const [key, value] of Object.entries(fields)) {
    const nameToken = `#${key}`;
    const valueToken = `:${key}`;
    expressionParts.push(`${nameToken} = ${valueToken}`);
    expressionAttrNames[nameToken] = key;
    expressionAttrValues[valueToken] = value;
  }

  await ddbClient.send(
    new UpdateItemCommand({
      TableName: process.env.PRODUCTS_TABLE,
      Key: marshall({ id }),
      UpdateExpression: `SET ${expressionParts.join(", ")}`,
      ExpressionAttributeNames: expressionAttrNames,
      ExpressionAttributeValues: marshall(expressionAttrValues),
    }),
  );

  return { statusCode: 200, body: JSON.stringify({ id }) };
};
