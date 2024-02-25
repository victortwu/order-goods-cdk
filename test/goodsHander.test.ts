import { APIGatewayEvent, Context } from "aws-lambda";
import { goodsHandler } from "../lib/services/goodsHandler";

process.env.PRODUCTS_TABLE = "ProductsTable-02b5a9df58b3";

test.skip("GET good", async () => {
  const event = {
    httpMethod: "GET",
    queryStringParameters: {
      id: "259991a1-8007-48ae-89d7-fc160dcf6d36",
    },
  } as unknown as APIGatewayEvent;
  const context = {} as Context;
  const response = await goodsHandler(event, context);
  console.log(response);
});

test.skip("POST goods", async () => {
  const body = {};
  const event = {
    httpMethod: "POST",
    body: JSON.stringify(body),
  } as unknown as APIGatewayEvent;
  const context = {} as Context;
  const response = await goodsHandler(event, context);
  console.log(response);
});
