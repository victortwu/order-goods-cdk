import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { APIGatewayEvent, APIGatewayProxyResult, Context } from "aws-lambda";
import { postProduct } from "./postProducts";

const ddbClient = new DynamoDBClient();

const goodsHandler = async (
  event: APIGatewayEvent,
  context: Context
): Promise<APIGatewayProxyResult> => {
  try {
    switch (event.httpMethod) {
      // case "GET":

      //   return
      case "POST":
        const postResponse = await postProduct(event, ddbClient);
        return postResponse;
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

  return {
    statusCode: 200,
    body: JSON.stringify("Fell through, no http method."),
  };
};

export { goodsHandler };
