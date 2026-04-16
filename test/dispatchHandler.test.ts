import { DynamoDBStreamEvent } from "aws-lambda";
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

// --- Env setup ---

process.env.RECIPIENT_EMAIL = "test@example.com";

// --- Helpers ---

function buildStreamEvent(
  records: Array<{
    eventName: "INSERT" | "MODIFY" | "REMOVE";
    newImage?: Record<string, unknown>;
  }>,
): DynamoDBStreamEvent {
  return {
    Records: records.map((r) => ({
      eventName: r.eventName,
      dynamodb: r.newImage ? { NewImage: r.newImage as any } : undefined,
    })) as any,
  };
}

function makeOrderData(
  orderId: string,
  items: Array<{
    id: string;
    productName: string;
    qty: number;
    unitType: string;
    vendorID: string;
  }>,
) {
  return {
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
  };
}

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
  });

  test("INSERT event with multi-vendor items calls SES once per vendor group", async () => {
    // arrange
    const orderData = makeOrderData("order-123", [
      {
        id: "1",
        productName: "Flour",
        qty: 5,
        unitType: "case",
        vendorID: "RESTAURANT_DEPOT",
      },
      {
        id: "2",
        productName: "Pita",
        qty: 10,
        unitType: "unit",
        vendorID: "WESTCOAST_PITA",
      },
      {
        id: "3",
        productName: "Sugar",
        qty: 3,
        unitType: "case",
        vendorID: "RESTAURANT_DEPOT",
      },
    ]);
    mockUnmarshall.mockReturnValue(orderData);
    mockSend.mockResolvedValue({});

    const event = buildStreamEvent([
      { eventName: "INSERT", newImage: { placeholder: "marshalled" } },
    ]);

    // act
    await dispatchHandler(event);

    // assert — 2 vendor groups: RESTAURANT_DEPOT and WESTCOAST_PITA
    expect(mockSend).toHaveBeenCalledTimes(2);
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

  test("SES failure for one vendor group does not prevent remaining groups from sending", async () => {
    // arrange
    const orderData = makeOrderData("order-456", [
      {
        id: "1",
        productName: "Flour",
        qty: 5,
        unitType: "case",
        vendorID: "RESTAURANT_DEPOT",
      },
      {
        id: "2",
        productName: "Pita",
        qty: 10,
        unitType: "unit",
        vendorID: "WESTCOAST_PITA",
      },
    ]);
    mockUnmarshall.mockReturnValue(orderData);

    // First call fails, second succeeds
    mockSend
      .mockRejectedValueOnce(new Error("SES throttle"))
      .mockResolvedValueOnce({});

    const event = buildStreamEvent([
      { eventName: "INSERT", newImage: { placeholder: "marshalled" } },
    ]);

    // act
    await dispatchHandler(event);

    // assert — both vendor groups attempted despite first failure
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  test("email recipient matches RECIPIENT_EMAIL env var", async () => {
    // arrange
    const orderData = makeOrderData("order-789", [
      {
        id: "1",
        productName: "Flour",
        qty: 5,
        unitType: "case",
        vendorID: "RESTAURANT_DEPOT",
      },
    ]);
    mockUnmarshall.mockReturnValue(orderData);
    mockSend.mockResolvedValue({});

    const event = buildStreamEvent([
      { eventName: "INSERT", newImage: { placeholder: "marshalled" } },
    ]);

    // act
    await dispatchHandler(event);

    // assert
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
    ["RESTAURANT_DEPOT", "Restaurant Depot Order"],
    ["WESTCOAST_PITA", "Westcoast Pita Order"],
    ["FRANZ_BAKERY", "Franz Bakery Order"],
    ["AMAZON", "Amazon Order"],
    ["INSTACART_US_FOODS", "Instacart Us Foods Order"],
    ["UNKNOWN", "Unknown Order"],
  ])('formatVendorSubject("%s") returns "%s"', (vendorID, expected) => {
    // act
    const result = formatVendorSubject(vendorID);

    // assert
    expect(result).toBe(expected);
  });
});
