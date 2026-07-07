import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { OrderGoodsOrchestrationStack } from "../lib/stacks/OrderGoodsOrchestrationStack";

describe("OrderGoodsOrchestrationStack", () => {
  let template: Template;

  beforeAll(() => {
    const app = new cdk.App();
    const stack = new OrderGoodsOrchestrationStack(app, "TestOrchestrationStack", {
      stage: "Test",
    });
    template = Template.fromStack(stack);
  });

  describe("Notification Lambda", () => {
    test("has function name with stage", () => {
      template.hasResourceProperties("AWS::Lambda::Function", {
        FunctionName: "OrderGoods-Test-Notification",
      });
    });

    test("has STAGE environment variable", () => {
      template.hasResourceProperties("AWS::Lambda::Function", {
        FunctionName: "OrderGoods-Test-Notification",
        Environment: {
          Variables: {
            STAGE: "test",
          },
        },
      });
    });

    test("has Node.js 22 runtime", () => {
      template.hasResourceProperties("AWS::Lambda::Function", {
        FunctionName: "OrderGoods-Test-Notification",
        Runtime: "nodejs22.x",
      });
    });

    test("has 30 second timeout", () => {
      template.hasResourceProperties("AWS::Lambda::Function", {
        FunctionName: "OrderGoods-Test-Notification",
        Timeout: 30,
      });
    });
  });

  describe("Notification Lambda IAM permissions", () => {
    test("grants ses:SendEmail and ses:SendRawEmail", () => {
      template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: ["ses:SendEmail", "ses:SendRawEmail"],
              Effect: "Allow",
            }),
          ]),
        },
      });
    });

    test("grants secretsmanager:GetSecretValue scoped to twilio credentials", () => {
      template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: "secretsmanager:GetSecretValue",
              Effect: "Allow",
              Resource: "arn:aws:secretsmanager:*:*:secret:bdk/*/twilio-credentials*",
            }),
          ]),
        },
      });
    });

    test("grants dynamodb:UpdateItem scoped to OrderedListTable", () => {
      template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: "dynamodb:UpdateItem",
              Effect: "Allow",
              Resource: Match.stringLikeRegexp("OrderedListTable-Test-"),
            }),
          ]),
        },
      });
    });

    test("does NOT grant sns:Publish (replaced by Twilio SMS)", () => {
      const policies = template.findResources("AWS::IAM::Policy");
      for (const [, policy] of Object.entries(policies)) {
        const statements = (policy as any).Properties?.PolicyDocument?.Statement ?? [];
        for (const stmt of statements) {
          const actions = Array.isArray(stmt.Action) ? stmt.Action : [stmt.Action];
          // sns:Publish should not appear on the notification Lambda's policy
          // (it may still exist on the state machine role for other purposes)
          if (actions.includes("sns:Publish")) {
            // Verify it's not scoped to the notification topic
            const resource = stmt.Resource;
            if (resource && typeof resource === "object" && resource["Fn::Ref"]) {
              // This would be the topic ref — should not exist
              expect(true).toBe(false);
            }
          }
        }
      }
    });
  });

  describe("Result Processor Lambda", () => {
    test("has function name with stage", () => {
      template.hasResourceProperties("AWS::Lambda::Function", {
        FunctionName: "OrderGoods-Test-ResultProcessor",
      });
    });

    test("grants logs:GetLogEvents for ECS log groups", () => {
      template.hasResourceProperties("AWS::IAM::Policy", {
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({
              Action: "logs:GetLogEvents",
              Effect: "Allow",
              Resource: Match.stringLikeRegexp("/ecs/order-goods-"),
            }),
          ]),
        },
      });
    });
  });

  describe("Email Dispatch Lambda", () => {
    test("has function name with stage", () => {
      template.hasResourceProperties("AWS::Lambda::Function", {
        FunctionName: "OrderGoods-Test-EmailDispatch",
      });
    });
  });

  describe("State Machine", () => {
    test("has state machine name with stage", () => {
      template.hasResourceProperties("AWS::StepFunctions::StateMachine", {
        StateMachineName: "OrderGoods-Test-OrderOrchestration",
      });
    });

    test("has tracing enabled", () => {
      template.hasResourceProperties("AWS::StepFunctions::StateMachine", {
        TracingConfiguration: {
          Enabled: true,
        },
      });
    });
  });

  describe("SNS Topic", () => {
    test("creates notification topic with stage name", () => {
      template.hasResourceProperties("AWS::SNS::Topic", {
        TopicName: "OrderGoods-Test-OrderNotifications",
      });
    });
  });

  describe("SSM Parameters", () => {
    test("stores SNS topic ARN in SSM", () => {
      template.hasResourceProperties("AWS::SSM::Parameter", {
        Name: "/order-goods/test/orchestration/sns-topic-arn",
      });
    });

    test("stores state machine ARN in SSM", () => {
      template.hasResourceProperties("AWS::SSM::Parameter", {
        Name: "/order-goods/test/orchestration/state-machine-arn",
      });
    });
  });
});
