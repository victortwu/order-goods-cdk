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
        ecsClusterArn: "arn:aws:ecs:us-east-1:123456789012:cluster/TestCluster",
        ecsTaskDefinitionArn:
          "arn:aws:ecs:us-east-1:123456789012:task-definition/TestTaskDef:1",
        ecsSubnetIds: "subnet-abc123,subnet-def456",
        ecsSecurityGroupIds: "sg-abc123",
        ecsLogGroupName: "/ecs/test-playwright-bot",
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

  test("Lambda has ECS environment variables", () => {
    template.hasResourceProperties("AWS::Lambda::Function", {
      Environment: {
        Variables: {
          ECS_CLUSTER_ARN:
            "arn:aws:ecs:us-east-1:123456789012:cluster/TestCluster",
          ECS_TASK_DEFINITION_ARN:
            "arn:aws:ecs:us-east-1:123456789012:task-definition/TestTaskDef:1",
          ECS_SUBNET_IDS: "subnet-abc123,subnet-def456",
          ECS_SECURITY_GROUP_IDS: "sg-abc123",
          ECS_LOG_GROUP: "/ecs/test-playwright-bot",
        },
      },
    });
  });

  test("IAM policy grants ecs:RunTask", () => {
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: "ecs:RunTask",
            Effect: "Allow",
          }),
        ]),
      },
    });
  });

  test("IAM policy grants iam:PassRole", () => {
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: "iam:PassRole",
            Effect: "Allow",
          }),
        ]),
      },
    });
  });

  test("IAM policy grants logs:GetLogEvents", () => {
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: "logs:GetLogEvents",
            Effect: "Allow",
          }),
        ]),
      },
    });
  });
});
