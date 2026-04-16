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

  test("Lambda has RECIPIENT_EMAIL environment variable", () => {
    template.hasResourceProperties("AWS::Lambda::Function", {
      Environment: {
        Variables: {
          RECIPIENT_EMAIL: Match.anyValue(),
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

  test("IAM policy grants ses:SendEmail", () => {
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: Match.arrayWith(["ses:SendEmail"]),
            Effect: "Allow",
          }),
        ]),
      },
    });
  });
});
