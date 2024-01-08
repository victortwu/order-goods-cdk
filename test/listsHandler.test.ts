import { APIGatewayEvent, Context } from "aws-lambda";
import { listsHandler } from "../lib/services/listsHandler";

process.env.ORDERED_LIST_TABLE_NAME = "OrderedListTable-02b5a9df58b3";

test("GET lists", async () => {
  const event = {
    httpMethod: "GET",
    queryStringParameters: {
      id: "3326d246-5267-4e17-810a-ea981f066fc3",
    },
  } as unknown as APIGatewayEvent;
  const context = {} as Context;
  const response = await listsHandler(event, context);
  console.log(response);
});

test.skip("POST lists", async () => {
  const body = {
    list: [
      {
        name: "halal chuck roll",
        upc: "1234",
        quantity: { number: 5, caseOrUnit: "case" },
      },
      {
        name: "halal chicken thigh",
        upc: "5678",
        quantity: { number: 7, caseOrUnit: "case" },
      },
    ],
  };
  const event = {
    httpMethod: "POST",
    body: JSON.stringify(body),
  } as unknown as APIGatewayEvent;
  const context = {} as Context;
  const response = await listsHandler(event, context);
  console.log(response);
});
