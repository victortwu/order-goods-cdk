import { APIGatewayEvent, Context } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { getList } from "../lib/lambdas/lists/getList";
import { postList } from "../lib/lambdas/lists/postList";

// --- Mock DynamoDB client ---

const mockSend = jest.fn();
jest.mock("@aws-sdk/client-dynamodb", () => {
  const actual = jest.requireActual("@aws-sdk/client-dynamodb");
  return {
    ...actual,
    DynamoDBClient: jest.fn(() => ({ send: mockSend })),
  };
});

jest.mock("uuid", () => ({ v4: () => "test-list-uuid" }));

process.env.ORDERED_LIST_TABLE_NAME = "TestOrderedListTable";

const mockContext = {} as Context;

// --- Tests ---

describe("getList", () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  test("returns a list by id", async () => {
    // arrange
    const storedItem = {
      id: "list-1",
      timestamp: 1700000000000,
      list: [{ name: "Chicken", qty: 2 }],
    };
    const event = {
      httpMethod: "GET",
      queryStringParameters: { id: "list-1" },
    } as unknown as APIGatewayEvent;

    mockSend.mockResolvedValue({
      Item: marshall(storedItem),
    });

    // act
    const ddbClient = new DynamoDBClient();
    const response = await getList(event, ddbClient);

    // assert
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.id).toBe("list-1");
    expect(body.list).toHaveLength(1);
  });

  test("returns 404 when list id not found", async () => {
    // arrange
    const event = {
      httpMethod: "GET",
      queryStringParameters: { id: "nonexistent" },
    } as unknown as APIGatewayEvent;

    mockSend.mockResolvedValue({ Item: undefined });

    // act
    const ddbClient = new DynamoDBClient();
    const response = await getList(event, ddbClient);

    // assert
    expect(response.statusCode).toBe(404);
  });

  test("returns 400 when no id query parameter provided", async () => {
    // arrange
    const event = {
      httpMethod: "GET",
      queryStringParameters: null,
    } as unknown as APIGatewayEvent;

    // act
    const ddbClient = new DynamoDBClient();
    const response = await getList(event, ddbClient);

    // assert
    expect(response.statusCode).toBe(400);
  });

  test("returns 400 when query params exist but no id", async () => {
    // arrange
    const event = {
      httpMethod: "GET",
      queryStringParameters: { foo: "bar" },
    } as unknown as APIGatewayEvent;

    // act
    const ddbClient = new DynamoDBClient();
    const response = await getList(event, ddbClient);

    // assert
    expect(response.statusCode).toBe(400);
  });
});

describe("postList", () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  test("creates a list and returns 201 with generated id", async () => {
    // arrange
    const event = {
      httpMethod: "POST",
      body: JSON.stringify({
        list: [
          { id: "prod-1", productName: "Chicken", qty: 6, unitType: "case" },
          { id: "prod-2", productName: "Tomatoes", qty: 2, unitType: "case" },
        ],
      }),
    } as unknown as APIGatewayEvent;

    mockSend.mockResolvedValue({});

    // act
    const ddbClient = new DynamoDBClient();
    const response = await postList(event, ddbClient);

    // assert
    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.id).toBe("test-list-uuid");
    expect(mockSend).toHaveBeenCalledTimes(1);
  });
});
