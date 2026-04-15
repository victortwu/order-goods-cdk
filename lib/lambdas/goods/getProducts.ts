import {
  DynamoDBClient,
  GetItemCommand,
  ScanCommand,
  QueryCommand,
} from "@aws-sdk/client-dynamodb";
import { APIGatewayEvent, APIGatewayProxyResult } from "aws-lambda";
import { unmarshall } from "@aws-sdk/util-dynamodb";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "*",
  "Access-Control-Allow-Headers": "*",
};

export const getProducts = async (
  event: APIGatewayEvent,
  ddbClient: DynamoDBClient
): Promise<APIGatewayProxyResult> => {
  console.log("api gateway event: ", event);
  if (event.queryStringParameters) {
    if (
      "id" in event.queryStringParameters ||
      "name" in event.queryStringParameters
    ) {
      const queryKey = "id" in event.queryStringParameters ? "id" : "name";

      const value = event.queryStringParameters[queryKey];

      switch (queryKey) {
        case "name":
          const getProductResponseByName = await ddbClient.send(
            new QueryCommand({
              TableName: process.env.PRODUCTS_TABLE,
              IndexName: "NameIndex",
              KeyConditionExpression: "#name = :nameValue",
              ExpressionAttributeNames: {
                "#name": "name",
              },
              ExpressionAttributeValues: {
                ":nameValue": { S: value as string },
              },
            })
          );
          if (getProductResponseByName.Items) {
            const unmarshalledItems = getProductResponseByName.Items.map(
              (item) => unmarshall(item)
            );
            return {
              statusCode: 200,
              headers,
              body: JSON.stringify(unmarshalledItems),
            };
          } else {
            return {
              statusCode: 404,
              headers,
              body: JSON.stringify(`Product with name ${value} not found!`),
            };
          }

        case "id":
          const getProductResponseById = await ddbClient.send(
            new GetItemCommand({
              TableName: process.env.PRODUCTS_TABLE,
              Key: {
                id: { S: value as string },
              },
            })
          );
          if (getProductResponseById.Item) {
            const unmarshalledItem = unmarshall(getProductResponseById.Item);
            return {
              statusCode: 200,
              headers,
              body: JSON.stringify(unmarshalledItem),
            };
          } else {
            return {
              statusCode: 404,
              headers,
              body: JSON.stringify(`Product with id ${value} not found!`),
            };
          }
        default:
          break;
      }
    } else {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify("Name required!"),
      };
    }
  }

  const result = await ddbClient.send(
    new ScanCommand({ TableName: process.env.PRODUCTS_TABLE })
  );
  const products = result.Items?.map((item) => unmarshall(item));
  console.log(products);
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify(products),
  };
};
