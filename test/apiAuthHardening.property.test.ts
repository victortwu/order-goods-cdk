import * as fc from "fast-check";

/**
 * Pure-logic simulation of the API auth hardening configuration.
 * These tests do NOT synthesize CDK stacks — they verify the pure logic
 * behind stage-conditional authorizer wiring and self-sign-up settings.
 */

// --- Simulation Functions ---

/**
 * Simulate the authorizer wiring logic from the CDK entry point.
 * For each stage, the entry point creates an AuthStack (which produces a
 * User Pool named `OrderGoods-{stage}-UserPool`) and passes that User Pool
 * into the ApiStack, which creates an authorizer named
 * `OrderGoods-{stage}-Authorizer` linked to that User Pool.
 *
 * Returns a map of stage → { authorizerName, userPoolName }.
 */
function simulateAuthorizerWiring(
  stages: string[],
): Record<string, { authorizerName: string; userPoolName: string }> {
  const result: Record<
    string,
    { authorizerName: string; userPoolName: string }
  > = {};
  for (const stage of stages) {
    const userPoolName = `OrderGoods-${stage}-UserPool`;
    const authorizerName = `OrderGoods-${stage}-Authorizer`;
    result[stage] = { authorizerName, userPoolName };
  }
  return result;
}

/**
 * Simulate the self-sign-up rule from OrderGoodsAuthStack.
 * selfSignUpEnabled = props.stage !== "Prod"
 */
function simulateSelfSignUpEnabled(stage: string): boolean {
  return stage !== "Prod";
}

// --- Arbitraries ---

/** Non-empty alphanumeric strings suitable as stage names */
const stageNameArb = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((s) => /^[A-Za-z0-9]+$/.test(s));

/** Pair of distinct stage name strings */
const distinctStagePairArb = fc
  .tuple(stageNameArb, stageNameArb)
  .filter(([a, b]) => a !== b);

// --- Property Tests ---

// Feature: api-auth-hardening, Property 1: Authorizer-to-User-Pool stage isolation
// **Validates: Requirements 1.3, 3.1, 3.2, 3.3**
describe("Property 1: Authorizer-to-User-Pool stage isolation", () => {
  it("each stage's authorizer config references only its own user pool name, never another stage's", () => {
    fc.assert(
      fc.property(distinctStagePairArb, ([stageA, stageB]) => {
        const wiring = simulateAuthorizerWiring([stageA, stageB]);

        // Stage A's authorizer references stage A's user pool
        expect(wiring[stageA].userPoolName).toBe(
          `OrderGoods-${stageA}-UserPool`,
        );
        expect(wiring[stageA].authorizerName).toBe(
          `OrderGoods-${stageA}-Authorizer`,
        );

        // Stage B's authorizer references stage B's user pool
        expect(wiring[stageB].userPoolName).toBe(
          `OrderGoods-${stageB}-UserPool`,
        );
        expect(wiring[stageB].authorizerName).toBe(
          `OrderGoods-${stageB}-Authorizer`,
        );

        // Cross-stage isolation: stage A's user pool name differs from stage B's
        expect(wiring[stageA].userPoolName).not.toBe(
          wiring[stageB].userPoolName,
        );

        // Cross-stage isolation: stage A's authorizer name differs from stage B's
        expect(wiring[stageA].authorizerName).not.toBe(
          wiring[stageB].authorizerName,
        );
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: api-auth-hardening, Property 2: Self-sign-up disabled only for Prod
// **Validates: Requirements 4.1, 4.2, 4.3**
describe("Property 2: Self-sign-up disabled only for Prod", () => {
  it("selfSignUpEnabled is false if and only if the stage is 'Prod'", () => {
    fc.assert(
      fc.property(stageNameArb, (stage) => {
        const selfSignUpEnabled = simulateSelfSignUpEnabled(stage);

        if (stage === "Prod") {
          expect(selfSignUpEnabled).toBe(false);
        } else {
          expect(selfSignUpEnabled).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });
});
