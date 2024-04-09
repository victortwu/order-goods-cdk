import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { APIGatewayEvent, APIGatewayProxyResult, Context } from "aws-lambda";
import { addCorsHeader } from "../utils/addCorsHeader";
import { postProduct } from "./postProducts";
import { getProducts } from "./getProducts";

const ddbClient = new DynamoDBClient();

const goodsHandler = async (
  event: APIGatewayEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  let response: APIGatewayProxyResult = {
    statusCode: 200,
    body: "",
  };

  try {
    switch (event.httpMethod) {
      case "GET":
        const getResponse = await getProducts(event, ddbClient);
        response = getResponse;
        break;
      case "POST":
        const postResponse = await postProduct(event, ddbClient);
        response = postResponse;
        break;
      default:
        break;
    }
  } catch (error) {
    console.error(error);
    return {
      statusCode: 500,
      body: JSON.stringify(error),
    };
  }

  addCorsHeader(response);
  return response;
};

export { goodsHandler };
