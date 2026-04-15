import { APIGatewayEvent, Context } from "aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { marshall } from "@aws-sdk/util-dynamodb";
import { getProducts } from "../lib/lambdas/goods/getProducts";
import { postProduct } from "../lib/lambdas/goods/postProducts";

// --- Mock DynamoDB client ---

const mockSend = jest.fn();
jest.mock("@aws-sdk/client-dynamodb", () => {
  const actual = jest.requireActual("@aws-sdk/client-dynamodb");
  return {
    ...actual,
    DynamoDBClient: jest.fn(() => ({ send: mockSend })),
  };
});

jest.mock("uuid", () => ({ v4: () => "test-uuid-1234" }));

process.env.PRODUCTS_TABLE = "TestProductsTable";

const mockContext = {} as Context;

const mockProduct = {
  id: "prod-1",
  name: "Chicken",
  category: "Meat",
  vendorID: "RESTAURANT_DEPOT",
  upc: "20795020000",
};

// --- Tests ---

describe("getProducts", () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  test("returns all products on scan (no query params)", async () => {
    // arrange
    const event = {
      httpMethod: "GET",
      queryStringParameters: null,
    } as unknown as APIGatewayEvent;

    mockSend.mockResolvedValue({
      Items: [marshall(mockProduct)],
    });

    // act
    const ddbClient = new DynamoDBClient();
    const response = await getProducts(event, ddbClient);

    // assert
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("Chicken");
  });

  test("returns a product by id", async () => {
    // arrange
    const event = {
      httpMethod: "GET",
      queryStringParameters: { id: "prod-1" },
    } as unknown as APIGatewayEvent;

    mockSend.mockResolvedValue({
      Item: marshall(mockProduct),
    });

    // act
    const ddbClient = new DynamoDBClient();
    const response = await getProducts(event, ddbClient);

    // assert
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.id).toBe("prod-1");
  });

  test("returns 404 when product id not found", async () => {
    // arrange
    const event = {
      httpMethod: "GET",
      queryStringParameters: { id: "nonexistent" },
    } as unknown as APIGatewayEvent;

    mockSend.mockResolvedValue({ Item: undefined });

    // act
    const ddbClient = new DynamoDBClient();
    const response = await getProducts(event, ddbClient);

    // assert
    expect(response.statusCode).toBe(404);
  });

  test("returns products by name via GSI query", async () => {
    // arrange
    const event = {
      httpMethod: "GET",
      queryStringParameters: { name: "Chicken" },
    } as unknown as APIGatewayEvent;

    mockSend.mockResolvedValue({
      Items: [marshall(mockProduct)],
    });

    // act
    const ddbClient = new DynamoDBClient();
    const response = await getProducts(event, ddbClient);

    // assert
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body[0].name).toBe("Chicken");
  });

  test("returns 400 for unsupported query parameter", async () => {
    // arrange
    const event = {
      httpMethod: "GET",
      queryStringParameters: { foo: "bar" },
    } as unknown as APIGatewayEvent;

    // act
    const ddbClient = new DynamoDBClient();
    const response = await getProducts(event, ddbClient);

    // assert
    expect(response.statusCode).toBe(400);
  });
});

describe("postProduct", () => {
  beforeEach(() => {
    mockSend.mockReset();
  });

  test("creates a product and returns 201 with generated id", async () => {
    // arrange
    const event = {
      httpMethod: "POST",
      body: JSON.stringify({
        name: "Tomatoes",
        category: "Produce",
        vendorID: "RESTAURANT_DEPOT",
      }),
    } as unknown as APIGatewayEvent;

    mockSend.mockResolvedValue({});

    // act
    const ddbClient = new DynamoDBClient();
    const response = await postProduct(event, ddbClient);

    // assert
    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.id).toBe("test-uuid-1234");
    expect(mockSend).toHaveBeenCalledTimes(1);
  });
});
