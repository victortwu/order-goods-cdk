import { DynamoDBStreamEvent } from "aws-lambda";
import { VendorID } from "../lib/lambdas/dispatch/constants/types";
import { formatVendorSubject } from "../lib/lambdas/dispatch/vendorRouter";

// --- Mock SES client ---

const mockSend = jest.fn();
jest.mock("@aws-sdk/client-ses", () => {
  const actual = jest.requireActual("@aws-sdk/client-ses");
  return {
    ...actual,
    SESClient: jest.fn(() => ({ send: mockSend })),
  };
});

// --- Mock unmarshall ---

const mockUnmarshall = jest.fn();
jest.mock("@aws-sdk/util-dynamodb", () => ({
  unmarshall: mockUnmarshall,
}));

// --- Mock ecsInvoker ---

const mockInvokePlaywrightTask = jest.fn();
jest.mock("../lib/lambdas/dispatch/ecsInvoker", () => ({
  invokePlaywrightTask: mockInvokePlaywrightTask,
}));

// --- Mock emailFormatter ---

const mockSendOrderResultEmail = jest.fn();
const mockSendFallbackEmail = jest.fn();
const mockSendVendorOrderEmail = jest.fn();
const mockFormatWestcoastPitaBody = jest.fn();
jest.mock("../lib/lambdas/dispatch/emailFormatter", () => ({
  sendOrderResultEmail: mockSendOrderResultEmail,
  sendFallbackEmail: mockSendFallbackEmail,
  sendVendorOrderEmail: mockSendVendorOrderEmail,
  formatWestcoastPitaBody: mockFormatWestcoastPitaBody,
}));

// --- Mock ssmConfig ---

const mockGetVendorEmail = jest.fn();
jest.mock("../lib/lambdas/dispatch/ssmConfig", () => ({
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

// --- Tests ---

describe("dispatchHandler", () => {
  let dispatchHandler: (event: DynamoDBStreamEvent) => Promise<void>;

  beforeAll(async () => {
    const mod = await import("../lib/lambdas/dispatch/handler");
    dispatchHandler = mod.dispatchHandler;
  });

  beforeEach(() => {
    mockSend.mockReset();
    mockUnmarshall.mockReset();
    mockInvokePlaywrightTask.mockReset();
    mockSendOrderResultEmail.mockReset();
    mockSendFallbackEmail.mockReset();
    mockSendVendorOrderEmail.mockReset();
    mockFormatWestcoastPitaBody.mockReset();
    mockGetVendorEmail.mockReset();
  });

  test("INSERT event with multi-vendor items routes RESTAURANT_DEPOT to ECS and others appropriately", async () => {
    // arrange
    const orderData = makeOrderData("order-123", [
      {
        id: "1",
        productName: "Flour",
        qty: 5,
        unitType: "case",
        vendorID: VendorID.RESTAURANT_DEPOT,
      },
      {
        id: "2",
        productName: "Pita",
        qty: 10,
        unitType: "unit",
        vendorID: VendorID.WESTCOAST_PITA,
      },
      {
        id: "3",
        productName: "Sugar",
        qty: 3,
        unitType: "case",
        vendorID: VendorID.RESTAURANT_DEPOT,
      },
    ]);
    mockUnmarshall.mockReturnValue(orderData);
    mockInvokePlaywrightTask.mockResolvedValue({
      orderId: "order-123",
      status: "success",
      timestamp: new Date().toISOString(),
      itemsAdded: [],
      itemsNotAdded: [],
    });
    mockSendOrderResultEmail.mockResolvedValue(undefined);
    mockGetVendorEmail.mockResolvedValue("vendor@westcoastpita.com");
    mockFormatWestcoastPitaBody.mockReturnValue("formatted body");
    mockSendVendorOrderEmail.mockResolvedValue(undefined);

    const event = buildStreamEvent([
      { eventName: "INSERT", newImage: { placeholder: "marshalled" } },
    ]);

    // act
    await dispatchHandler(event);

    // assert — RESTAURANT_DEPOT goes through ECS, WESTCOAST_PITA goes through sendVendorOrderEmail
    expect(mockInvokePlaywrightTask).toHaveBeenCalledTimes(1);
    expect(mockSendOrderResultEmail).toHaveBeenCalledTimes(1);
    expect(mockSendVendorOrderEmail).toHaveBeenCalledTimes(1);
    expect(mockSendVendorOrderEmail).toHaveBeenCalledWith({
      vendorEmail: "vendor@westcoastpita.com",
      notificationEmail: "test@example.com",
      subject: "Order for The Berliner Döner Kebab",
      body: "formatted body",
    });
    expect(mockSend).not.toHaveBeenCalled(); // no generic SES path
  });

  test("WESTCOAST_PITA reads vendor email from SSM and sends via sendVendorOrderEmail", async () => {
    // arrange
    const orderData = makeOrderData("order-wp-1", [
      {
        id: "1",
        productName: "Pita Bread",
        qty: 20,
        unitType: "case",
        vendorID: VendorID.WESTCOAST_PITA,
      },
    ]);
    mockUnmarshall.mockReturnValue(orderData);
    mockGetVendorEmail.mockResolvedValue("orders@westcoastpita.com");
    mockFormatWestcoastPitaBody.mockReturnValue("Pita Bread — 20 case");
    mockSendVendorOrderEmail.mockResolvedValue(undefined);

    const event = buildStreamEvent([
      { eventName: "INSERT", newImage: { placeholder: "marshalled" } },
    ]);

    // act
    await dispatchHandler(event);

    // assert
    expect(mockGetVendorEmail).toHaveBeenCalledWith("Beta", "westcoast-pita");
    expect(mockFormatWestcoastPitaBody).toHaveBeenCalledTimes(1);
    expect(mockSendVendorOrderEmail).toHaveBeenCalledWith({
      vendorEmail: "orders@westcoastpita.com",
      notificationEmail: "test@example.com",
      subject: "Order for The Berliner Döner Kebab",
      body: "Pita Bread — 20 case",
    });
  });

  test("MODIFY event is skipped (no SES calls)", async () => {
    // arrange
    const event = buildStreamEvent([
      { eventName: "MODIFY", newImage: { placeholder: "marshalled" } },
    ]);

    // act
    await dispatchHandler(event);

    // assert
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockUnmarshall).not.toHaveBeenCalled();
  });

  test("REMOVE event is skipped (no SES calls)", async () => {
    // arrange
    const event = buildStreamEvent([
      { eventName: "REMOVE", newImage: { placeholder: "marshalled" } },
    ]);

    // act
    await dispatchHandler(event);

    // assert
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockUnmarshall).not.toHaveBeenCalled();
  });

  test("ECS failure for RESTAURANT_DEPOT does not prevent remaining groups from sending", async () => {
    // arrange
    const orderData = makeOrderData("order-456", [
      {
        id: "1",
        productName: "Flour",
        qty: 5,
        unitType: "case",
        vendorID: VendorID.RESTAURANT_DEPOT,
      },
      {
        id: "2",
        productName: "Pita",
        qty: 10,
        unitType: "unit",
        vendorID: VendorID.WESTCOAST_PITA,
      },
    ]);
    mockUnmarshall.mockReturnValue(orderData);
    mockInvokePlaywrightTask.mockRejectedValueOnce(new Error("ECS timeout"));
    mockSendFallbackEmail.mockResolvedValue(undefined);
    mockGetVendorEmail.mockResolvedValue("vendor@westcoastpita.com");
    mockFormatWestcoastPitaBody.mockReturnValue("formatted body");
    mockSendVendorOrderEmail.mockResolvedValue(undefined);

    const event = buildStreamEvent([
      { eventName: "INSERT", newImage: { placeholder: "marshalled" } },
    ]);

    // act
    await dispatchHandler(event);

    // assert — RESTAURANT_DEPOT failed, fallback sent, WESTCOAST_PITA still processed
    expect(mockInvokePlaywrightTask).toHaveBeenCalledTimes(1);
    expect(mockSendFallbackEmail).toHaveBeenCalledTimes(1);
    expect(mockSendVendorOrderEmail).toHaveBeenCalledTimes(1);
  });

  test("unknown vendor falls through to generic SES email", async () => {
    // arrange
    const orderData = makeOrderData("order-generic", [
      {
        id: "1",
        productName: "Bread",
        qty: 5,
        unitType: "case",
        vendorID: "FRANZ_BAKERY",
      },
    ]);
    mockUnmarshall.mockReturnValue(orderData);
    mockSend.mockResolvedValue({});

    const event = buildStreamEvent([
      { eventName: "INSERT", newImage: { placeholder: "marshalled" } },
    ]);

    // act
    await dispatchHandler(event);

    // assert — goes through generic SES path
    expect(mockSend).toHaveBeenCalledTimes(1);
    const sendEmailCommand = mockSend.mock.calls[0][0];
    expect(sendEmailCommand.input.Destination.ToAddresses).toEqual([
      "test@example.com",
    ]);
    expect(sendEmailCommand.input.Source).toBe("test@example.com");
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
