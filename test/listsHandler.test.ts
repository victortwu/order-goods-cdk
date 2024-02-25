import { APIGatewayEvent, Context } from "aws-lambda";
import { listsHandler } from "../lib/services/listsHandler";

process.env.ORDERED_LIST_TABLE_NAME = "OrderedListTable-02b5a9df58b3";

test.skip("GET lists", async () => {
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

test("POST lists", async () => {
  const body = {
    list: [
      {
        item: {
          id: "aa6cad82-f32e-4a0f-9310-25e28923538f",
          vendorProductName: "LAMB GROUND",
          upc: "20713500000",
          name: "Ground Lamb",
          vendorID: "Restaurant Depot",
          category: "Food COGS",
        },
        quantity: {
          number: 1,
          caseOrUnit: "case",
        },
      },
      {
        item: {
          id: "f7c81939-980f-4403-8765-dc39124a1de9",
          vendorProductName: "CHX HAL THIGH CVP",
          upc: "20795020000",
          name: "Chicken",
          vendorID: "Restaurant Depot",
          category: "Food COGS",
        },
        quantity: {
          number: 6,
          caseOrUnit: "case",
        },
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
