import {
  AttributeValue,
  DynamoDBClient,
  GetItemCommand,
  ScanCommand,
} from "@aws-sdk/client-dynamodb";
import { APIGatewayEvent, APIGatewayProxyResult } from "aws-lambda";
import { unmarshall, marshall } from "@aws-sdk/util-dynamodb";

export const getProducts = async (
  event: APIGatewayEvent,
  ddbClient: DynamoDBClient
): Promise<APIGatewayProxyResult> => {
  if (event.queryStringParameters) {
    if ("id" in event.queryStringParameters) {
      const id = event.queryStringParameters["id"];
      const productId = marshall(id);

      const getProductResponse = await ddbClient.send(
        new GetItemCommand({
          TableName: process.env.PRODUCTS_TABLE,
          Key: {
            id: productId as unknown as AttributeValue,
          },
        })
      );
      if (getProductResponse.Item) {
        const unmarshalledItem = unmarshall(getProductResponse.Item);
        return {
          statusCode: 200,
          body: JSON.stringify(unmarshalledItem),
        };
      } else {
        return {
          statusCode: 404,
          body: JSON.stringify(`Product with id ${productId} not found!`),
        };
      }
    } else {
      return {
        statusCode: 400,
        body: JSON.stringify("Id required!"),
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
    body: JSON.stringify(products),
  };
};
