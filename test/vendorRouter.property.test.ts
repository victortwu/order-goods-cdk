import * as fc from "fast-check";
import {
  OrderItemRecord,
  VendorGroup,
  VendorGroupItem,
  groupItemsByVendor,
  buildVendorGroup,
} from "../lib/lambdas/dispatch/vendorRouter";

// --- Arbitraries ---

const KNOWN_VENDORS = [
  "RESTAURANT_DEPOT",
  "WESTCOAST_PITA",
  "FRANZ_BAKERY",
  "AMAZON",
  "INSTACART_US_FOODS",
  "UNKNOWN",
];

const vendorIdArb = fc.oneof(
  fc.constantFrom(...KNOWN_VENDORS),
  fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
);

const productDataArb = fc.record({
  id: fc.uuid(),
  name: fc.string({ minLength: 1, maxLength: 50 }),
  category: fc.string({ minLength: 1, maxLength: 30 }),
  vendorID: vendorIdArb,
  upc: fc.option(fc.stringMatching(/^\d{10,13}$/), { nil: undefined }),
  vendorProductName: fc.option(fc.string({ minLength: 1, maxLength: 50 }), {
    nil: undefined,
  }),
  description: fc.option(fc.string({ minLength: 0, maxLength: 100 }), {
    nil: undefined,
  }),
  tags: fc.option(
    fc.array(fc.string({ minLength: 1, maxLength: 20 }), { maxLength: 5 }),
    {
      nil: undefined,
    },
  ),
  hide: fc.option(fc.boolean(), { nil: undefined }),
});

const orderItemRecordArb: fc.Arbitrary<OrderItemRecord> = fc.record({
  id: fc.uuid(),
  productName: fc.string({ minLength: 1, maxLength: 50 }),
  qty: fc.integer({ min: 1, max: 1000 }),
  unitType: fc.constantFrom("case", "unit"),
  productData: productDataArb,
});

const vendorGroupItemArb: fc.Arbitrary<VendorGroupItem> = fc.record({
  productName: fc.string({ minLength: 1, maxLength: 50 }),
  qty: fc.integer({ min: 1, max: 1000 }),
  unitType: fc.constantFrom("case", "unit"),
  productData: fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 50 }),
    category: fc.string({ minLength: 1, maxLength: 30 }),
    vendorID: vendorIdArb,
  }) as fc.Arbitrary<Record<string, unknown>>,
});

const vendorGroupArb: fc.Arbitrary<VendorGroup> = fc.record({
  orderId: fc.uuid(),
  vendorID: vendorIdArb,
  items: fc.array(vendorGroupItemArb, { minLength: 1, maxLength: 20 }),
});

// --- Property Tests ---

// Feature: order-dispatch-pipeline, Property 1: Vendor grouping correctness
// **Validates: Requirements 2.2, 2.4, 2.5**
describe("Property 1: Vendor grouping correctness", () => {
  it("group count equals distinct vendorIDs, items share group key, total items preserved", () => {
    fc.assert(
      fc.property(
        fc.array(orderItemRecordArb, { minLength: 0, maxLength: 30 }),
        (items) => {
          const result = groupItemsByVendor(items);

          // Number of keys = number of distinct vendorID values in input
          const distinctVendors = new Set(
            items.map((item) => item.productData?.vendorID || "UNKNOWN"),
          );
          expect(result.size).toBe(distinctVendors.size);

          // Every item in a given group shares the same vendorID as the group key
          for (const [vendorId, groupItems] of result.entries()) {
            for (const item of groupItems) {
              const itemVendor = item.productData?.vendorID || "UNKNOWN";
              expect(itemVendor).toBe(vendorId);
            }
          }

          // Sum of items across all groups = length of input array
          let totalItems = 0;
          for (const groupItems of result.values()) {
            totalItems += groupItems.length;
          }
          expect(totalItems).toBe(items.length);
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: order-dispatch-pipeline, Property 2: Field preservation through vendor group construction
// **Validates: Requirements 2.3, 5.1, 5.2**
describe("Property 2: Field preservation through vendor group construction", () => {
  it("output contains orderId/vendorID/items and each item retains all original fields", () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        vendorIdArb,
        fc.array(orderItemRecordArb, { minLength: 1, maxLength: 20 }),
        (orderId, vendorId, items) => {
          const result = buildVendorGroup(orderId, vendorId, items);

          // Output contains orderId, vendorID, and a non-empty items array
          expect(result.orderId).toBe(orderId);
          expect(result.vendorID).toBe(vendorId);
          expect(result.items).toHaveLength(items.length);
          expect(result.items.length).toBeGreaterThan(0);

          // Each item retains original productName, qty, unitType, and full productData
          for (let i = 0; i < items.length; i++) {
            const input = items[i];
            const output = result.items[i];

            expect(output.productName).toBe(input.productName);
            expect(output.qty).toBe(input.qty);
            expect(output.unitType).toBe(input.unitType);

            // productData should contain all fields from the original
            expect(output.productData.id).toBe(input.productData.id);
            expect(output.productData.name).toBe(input.productData.name);
            expect(output.productData.category).toBe(
              input.productData.category,
            );
            expect(output.productData.vendorID).toBe(
              input.productData.vendorID,
            );

            // Optional fields preserved when present
            if (input.productData.upc !== undefined) {
              expect(output.productData.upc).toBe(input.productData.upc);
            }
            if (input.productData.vendorProductName !== undefined) {
              expect(output.productData.vendorProductName).toBe(
                input.productData.vendorProductName,
              );
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

// Feature: order-dispatch-pipeline, Property 3: VendorGroup JSON round-trip
// **Validates: Requirements 5.3, 3.3**
describe("Property 3: VendorGroup JSON round-trip", () => {
  it("JSON.stringify then JSON.parse produces a deeply equal object", () => {
    fc.assert(
      fc.property(vendorGroupArb, (vendorGroup) => {
        const serialized = JSON.stringify(vendorGroup);
        const deserialized = JSON.parse(serialized);

        expect(deserialized).toEqual(vendorGroup);
      }),
      { numRuns: 100 },
    );
  });
});
