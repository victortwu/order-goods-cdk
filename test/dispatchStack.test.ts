import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { OrderGoodsDataStack } from "../lib/stacks/OrderGoodsDataStack";
import { OrderGoodsDispatchStack } from "../lib/stacks/OrderGoodsDispatchStack";

describe("OrderGoodsDispatchStack", () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const dataStack = new OrderGoodsDataStack(app, "TestDataStack", {
      stage: "Test",
    });
    const dispatchStack = new OrderGoodsDispatchStack(
      app,
      "TestDispatchStack",
      {
        stage: "Test",
        orderedListTable: dataStack.orderedListTable,
      },
    );
    template = Template.fromStack(dispatchStack);
  });

  test("Lambda uses Node.js 22 runtime", () => {
    template.hasResourceProperties("AWS::Lambda::Function", {
      Runtime: "nodejs22.x",
    });
  });

  test("Lambda timeout is 1 minute", () => {
    template.hasResourceProperties("AWS::Lambda::Function", {
      Timeout: 60,
    });
  });

  test("Lambda has STAGE and RECIPIENT_EMAIL environment variables", () => {
    template.hasResourceProperties("AWS::Lambda::Function", {
      Environment: {
        Variables: {
          RECIPIENT_EMAIL: Match.anyValue(),
          STAGE: "Test",
        },
      },
    });
  });

  test("Event source mapping has BatchSize 1 and StartingPosition LATEST", () => {
    template.hasResourceProperties("AWS::Lambda::EventSourceMapping", {
      BatchSize: 1,
      StartingPosition: "LATEST",
    });
  });

  test("IAM policy grants states:StartExecution scoped to state machine", () => {
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: "states:StartExecution",
            Effect: "Allow",
            Resource: Match.stringLikeRegexp("OrderGoods-Test-OrderOrchestration"),
          }),
        ]),
      },
    });
  });

  test("IAM policy grants ssm:GetParameter", () => {
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: "ssm:GetParameter",
            Effect: "Allow",
          }),
        ]),
      },
    });
  });

  test("IAM policy does NOT grant ecs:RunTask (moved to orchestration stack)", () => {
    const policies = template.findResources("AWS::IAM::Policy");
    for (const [, policy] of Object.entries(policies)) {
      const statements = (policy as any).Properties?.PolicyDocument?.Statement ?? [];
      for (const stmt of statements) {
        const actions = Array.isArray(stmt.Action) ? stmt.Action : [stmt.Action];
        expect(actions).not.toContain("ecs:RunTask");
      }
    }
  });

  test("IAM policy does NOT grant ses:SendEmail (moved to orchestration stack)", () => {
    const policies = template.findResources("AWS::IAM::Policy");
    for (const [, policy] of Object.entries(policies)) {
      const statements = (policy as any).Properties?.PolicyDocument?.Statement ?? [];
      for (const stmt of statements) {
        const actions = Array.isArray(stmt.Action) ? stmt.Action : [stmt.Action];
        expect(actions).not.toContain("ses:SendEmail");
      }
    }
  });
});
