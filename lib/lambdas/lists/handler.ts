import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { APIGatewayEvent, APIGatewayProxyResult, Context } from "aws-lambda";
import { addCorsHeader } from "../utils/addCorsHeader";
import { getList } from "./getList";
import { getRecentLists } from "./getRecentLists";
import { postList } from "./postList";

const ddbClient = new DynamoDBClient();

const listsHandler = async (
  event: APIGatewayEvent,
  context: Context,
): Promise<APIGatewayProxyResult> => {
  let response: APIGatewayProxyResult = {
    statusCode: 200,
    body: "",
  };

  try {
    switch (event.httpMethod) {
      case "GET":
        if (event.queryStringParameters?.recent) {
          response = await getRecentLists(event, ddbClient);
        } else {
          response = await getList(event, ddbClient);
        }
        break;
      case "POST":
        response = await postList(event, ddbClient);
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
