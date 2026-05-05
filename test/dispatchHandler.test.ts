import { DynamoDBStreamEvent } from "aws-lambda";
import { VendorID } from "../lib/lambdas/dispatch/constants/types";
import { formatVendorSubject } from "../lib/lambdas/dispatch/vendorRouter";

// --- Mock SFN client ---

const mockSfnSend = jest.fn();
jest.mock("@aws-sdk/client-sfn", () => {
  const actual = jest.requireActual("@aws-sdk/client-sfn");
  return {
    ...actual,
    SFNClient: jest.fn(() => ({ send: mockSfnSend })),
  };
});

// --- Mock unmarshall ---

const mockUnmarshall = jest.fn();
jest.mock("@aws-sdk/util-dynamodb", () => ({
  unmarshall: mockUnmarshall,
}));

// --- Mock ssmConfig ---

const mockGetDispatchMethod = jest.fn();
const mockGetStateMachineArn = jest.fn();
const mockGetSharedConfig = jest.fn();
const mockGetVendorConfig = jest.fn();
const mockGetVendorEmail = jest.fn();
jest.mock("../lib/lambdas/dispatch/ssmConfig", () => ({
  getDispatchMethod: mockGetDispatchMethod,
  getStateMachineArn: mockGetStateMachineArn,
  getSharedConfig: mockGetSharedConfig,
  getVendorConfig: mockGetVendorConfig,
  getVendorEmail: mockGetVendorEmail,
}));

// --- Env setup ---

process.env.RECIPIENT_EMAIL = "test@example.com";
process.env.STAGE = "Beta";

// --- Helpers ---

const buildStreamEvent = (
  records: Array<{
    eventName: "INSERT" | "MODIFY" | "REMOVE";
    newImage?: Record<string, unknown>;
  }>,
): DynamoDBStreamEvent =>
  ({
    Records: records.map((r) => ({
      eventName: r.eventName,
      dynamodb: r.newImage ? { NewImage: r.newImage as any } : undefined,
    })),
  }) as any;

const makeOrderData = (
  orderId: string,
  items: Array<{
    id: string;
    productName: string;
    qty: number;
    unitType: string;
    vendorID: string;
  }>,
) => ({
  id: orderId,
  list: items.map((item) => ({
    id: item.id,
    productName: item.productName,
    qty: item.qty,
    unitType: item.unitType,
    productData: {
      id: `p-${item.id}`,
      name: item.productName,
      category: "General",
      vendorID: item.vendorID,
    },
  })),
});

const MOCK_SHARED_CONFIG = {
  clusterArn: "arn:aws:ecs:us-west-2:123:cluster/test",
  subnetIds: "subnet-1,subnet-2",
  securityGroupIds: "sg-1",
};

const MOCK_VENDOR_CONFIG = {
  taskDefinitionArn: "arn:aws:ecs:us-west-2:123:task-definition/test:1",
  taskDefinitionFamily: "test-family",
  logGroupName: "/ecs/order-goods-beta-restaurant-depot-bot",
};

// --- Tests ---

describe("dispatchHandler", () => {
  let dispatchHandler: (event: DynamoDBStreamEvent) => Promise<void>;

  beforeAll(async () => {
    const mod = await import("../lib/lambdas/dispatch/handler");
    dispatchHandler = mod.dispatchHandler;
  });

  beforeEach(() => {
    mockSfnSend.mockReset();
    mockUnmarshall.mockReset();
    mockGetDispatchMethod.mockReset();
    mockGetStateMachineArn.mockReset();
    mockGetSharedConfig.mockReset();
    mockGetVendorConfig.mockReset();
    mockGetVendorEmail.mockReset();

    mockGetStateMachineArn.mockResolvedValue("arn:aws:states:us-west-2:123:stateMachine:test");
    mockSfnSend.mockResolvedValue({});
  });

  test("INSERT event with ecs_bot vendor starts execution with ecsConfig", async () => {
    // arrange
    const orderData = makeOrderData("order-123", [
      { id: "1", productName: "Flour", qty: 5, unitType: "case", vendorID: VendorID.RESTAURANT_DEPOT },
    ]);
    mockUnmarshall.mockReturnValue(orderData);
    mockGetDispatchMethod.mockResolvedValue("ecs_bot");
    mockGetSharedConfig.mockResolvedValue(MOCK_SHARED_CONFIG);
    mockGetVendorConfig.mockResolvedValue(MOCK_VENDOR_CONFIG);

    const event = buildStreamEvent([
      { eventName: "INSERT", newImage: { placeholder: "marshalled" } },
    ]);

    // act
    await dispatchHandler(event);

    // assert
    expect(mockSfnSend).toHaveBeenCalledTimes(1);
    const command = mockSfnSend.mock.calls[0][0];
    const input = JSON.parse(command.input.input);
    expect(input.dispatchMethod).toBe("ecs_bot");
    expect(input.ecsConfig.clusterArn).toBe(MOCK_SHARED_CONFIG.clusterArn);
    expect(input.ecsConfig.subnets).toEqual(["subnet-1", "subnet-2"]);
    expect(input.ecsConfig.taskDefinitionFamily).toBe("test-family");
    expect(input.ecsConfig.containerName).toBe("restaurant-depot-bot");
    expect(command.input.name).toBe("order-123_restaurant-depot");
  });

  test("INSERT event with email vendor starts execution with emailConfig", async () => {
    // arrange
    const orderData = makeOrderData("order-456", [
      { id: "1", productName: "Pita", qty: 10, unitType: "unit", vendorID: VendorID.WESTCOAST_PITA },
    ]);
    mockUnmarshall.mockReturnValue(orderData);
    mockGetDispatchMethod.mockResolvedValue("email");
    mockGetVendorEmail.mockResolvedValue("vendor@westcoastpita.com");

    const event = buildStreamEvent([
      { eventName: "INSERT", newImage: { placeholder: "marshalled" } },
    ]);

    // act
    await dispatchHandler(event);

    // assert
    expect(mockSfnSend).toHaveBeenCalledTimes(1);
    const command = mockSfnSend.mock.calls[0][0];
    const input = JSON.parse(command.input.input);
    expect(input.dispatchMethod).toBe("email");
    expect(input.emailConfig.vendorEmail).toBe("vendor@westcoastpita.com");
    expect(input.emailConfig.notificationEmail).toBe("test@example.com");
    expect(command.input.name).toBe("order-456_westcoast-pita");
  });

  test("multi-vendor order starts one execution per vendor group", async () => {
    // arrange
    const orderData = makeOrderData("order-789", [
      { id: "1", productName: "Flour", qty: 5, unitType: "case", vendorID: VendorID.RESTAURANT_DEPOT },
      { id: "2", productName: "Pita", qty: 10, unitType: "unit", vendorID: VendorID.WESTCOAST_PITA },
    ]);
    mockUnmarshall.mockReturnValue(orderData);
    mockGetDispatchMethod
      .mockResolvedValueOnce("ecs_bot")
      .mockResolvedValueOnce("email");
    mockGetSharedConfig.mockResolvedValue(MOCK_SHARED_CONFIG);
    mockGetVendorConfig.mockResolvedValue(MOCK_VENDOR_CONFIG);
    mockGetVendorEmail.mockResolvedValue("vendor@westcoastpita.com");

    const event = buildStreamEvent([
      { eventName: "INSERT", newImage: { placeholder: "marshalled" } },
    ]);

    // act
    await dispatchHandler(event);

    // assert
    expect(mockSfnSend).toHaveBeenCalledTimes(2);
  });

  test("MODIFY event is skipped", async () => {
    // arrange
    const event = buildStreamEvent([{ eventName: "MODIFY" }]);

    // act
    await dispatchHandler(event);

    // assert
    expect(mockUnmarshall).not.toHaveBeenCalled();
    expect(mockSfnSend).not.toHaveBeenCalled();
  });

  test("REMOVE event is skipped", async () => {
    // arrange
    const event = buildStreamEvent([{ eventName: "REMOVE" }]);

    // act
    await dispatchHandler(event);

    // assert
    expect(mockUnmarshall).not.toHaveBeenCalled();
    expect(mockSfnSend).not.toHaveBeenCalled();
  });

  test("startExecution failure for one vendor does not block others", async () => {
    // arrange
    const orderData = makeOrderData("order-err", [
      { id: "1", productName: "Flour", qty: 5, unitType: "case", vendorID: VendorID.RESTAURANT_DEPOT },
      { id: "2", productName: "Pita", qty: 10, unitType: "unit", vendorID: VendorID.WESTCOAST_PITA },
    ]);
    mockUnmarshall.mockReturnValue(orderData);
    mockGetDispatchMethod
      .mockResolvedValueOnce("ecs_bot")
      .mockResolvedValueOnce("email");
    mockGetSharedConfig.mockResolvedValue(MOCK_SHARED_CONFIG);
    mockGetVendorConfig.mockResolvedValue(MOCK_VENDOR_CONFIG);
    mockGetVendorEmail.mockResolvedValue("vendor@westcoastpita.com");
    mockSfnSend
      .mockRejectedValueOnce(new Error("Throttled"))
      .mockResolvedValueOnce({});

    const event = buildStreamEvent([
      { eventName: "INSERT", newImage: { placeholder: "marshalled" } },
    ]);

    // act
    await dispatchHandler(event);

    // assert — second execution still attempted despite first failure
    expect(mockSfnSend).toHaveBeenCalledTimes(2);
  });

  test("empty list is skipped", async () => {
    // arrange
    mockUnmarshall.mockReturnValue({ id: "order-empty", list: [] });
    const event = buildStreamEvent([
      { eventName: "INSERT", newImage: { placeholder: "marshalled" } },
    ]);

    // act
    await dispatchHandler(event);

    // assert
    expect(mockSfnSend).not.toHaveBeenCalled();
  });
});

describe("formatVendorSubject", () => {
  test.each([
    [VendorID.RESTAURANT_DEPOT, "Restaurant Depot Order"],
    [VendorID.WESTCOAST_PITA, "Westcoast Pita Order"],
    [VendorID.FRANZ_BAKERY, "Franz Bakery Order"],
    [VendorID.AMAZON, "Amazon Order"],
    [VendorID.INSTACART_US_FOODS, "Instacart Us Foods Order"],
    [VendorID.UNKNOWN, "Unknown Order"],
  ])('formatVendorSubject("%s") returns "%s"', (vendorID, expected) => {
    // act
    const result = formatVendorSubject(vendorID);

    // assert
    expect(result).toBe(expected);
  });
});
