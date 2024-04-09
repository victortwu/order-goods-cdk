import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { APIGatewayEvent, APIGatewayProxyResult, Context } from "aws-lambda";
import { addCorsHeader } from "../utils/addCorsHeader";
import { getList } from "./getList";
import { postList } from "./postList";

const ddbClient = new DynamoDBClient();

const listsHandler = async (
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
        const getResponse = await getList(event, ddbClient);
        response = getResponse;
        break;
      case "POST":
        const postResponse = await postList(event, ddbClient);
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

export { listsHandler };
