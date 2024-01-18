import { APIGatewayEvent, Context } from "aws-lambda";
import { goodsHandler } from "../lib/services/goodsHandler";

process.env.PRODUCTS_TABLE = "ProductsTable-02b5a9df58b3";

// test("GET good", async () => {
//   const event = {
//     httpMethod: "GET",
//     queryStringParameters: {
//       id: "3326d246-5267-4e17-810a-ea981f066fc3",
//     },
//   } as unknown as APIGatewayEvent;
//   const context = {} as Context;
//   const response = await goodsHandler(event, context);
//   console.log(response);
// });

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
