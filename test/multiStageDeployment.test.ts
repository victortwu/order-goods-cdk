import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { OrderGoodsDataStack } from "../lib/stacks/OrderGoodsDataStack";
import { OrderGoodsAuthStack } from "../lib/stacks/OrderGoodsAuthStack";
import { OrderGoodsLambdaStack } from "../lib/stacks/OrderGoodsLambdaStack";
import { OrderGoodsApiStack } from "../lib/stacks/OrderGoodsApiStack";
import { OrderGoodsDispatchStack } from "../lib/stacks/OrderGoodsDispatchStack";

describe("Multi-Stage Deployment", () => {
  describe("Full app synthesis with Beta and Prod stages", () => {
    test("synthesizes all 10 stacks with correct Beta- and Prod- prefixes", () => {
      const app = new cdk.App();
      const stages = ["Beta", "Prod"];

      for (const stage of stages) {
        const authStack = new OrderGoodsAuthStack(
          app,
          `${stage}-OrderGoodsAuthStack`,
          { stage },
        );
        const dataStack = new OrderGoodsDataStack(
          app,
          `${stage}-OrderGoodsDataStack`,
          { stage },
        );
        const lambdaStack = new OrderGoodsLambdaStack(
          app,
          `${stage}-OrderGoodsLambdaStack`,
          {
            stage,
            orderedListTable: dataStack.orderedListTable,
            productsTable: dataStack.productsTable,
          },
        );
        new OrderGoodsApiStack(app, `${stage}-OrderGoodsApiStack`, {
          stage,
          goodsLambdaIntegration: lambdaStack.goodsLambdaIntegration,
          listsLambdaIntegration: lambdaStack.listsLambdaIntegration,
        });
        new OrderGoodsDispatchStack(app, `${stage}-OrderGoodsDispatchStack`, {
          stage,
          orderedListTable: dataStack.orderedListTable,
        });
      }

      const assembly = app.synth();
      const stackNames = assembly.stacks.map((s) => s.stackName);

      expect(stackNames).toHaveLength(10);

      const expectedStacks = [
        "Beta-OrderGoodsAuthStack",
        "Beta-OrderGoodsDataStack",
        "Beta-OrderGoodsLambdaStack",
        "Beta-OrderGoodsApiStack",
        "Beta-OrderGoodsDispatchStack",
        "Prod-OrderGoodsAuthStack",
        "Prod-OrderGoodsDataStack",
        "Prod-OrderGoodsLambdaStack",
        "Prod-OrderGoodsApiStack",
        "Prod-OrderGoodsDispatchStack",
      ];

      for (const expected of expectedStacks) {
        expect(stackNames).toContain(expected);
      }

      // Every stack name starts with Beta- or Prod-
      for (const name of stackNames) {
        expect(name.startsWith("Beta-") || name.startsWith("Prod-")).toBe(true);
      }
    });
  });

  describe("Beta-OrderGoodsDataStack DynamoDB table names contain Beta", () => {
    test("DynamoDB table names contain Beta in the Fn::Join expression", () => {
      const app = new cdk.App();
      const dataStack = new OrderGoodsDataStack(
        app,
        "Beta-OrderGoodsDataStack",
        { stage: "Beta" },
      );
      const template = Template.fromStack(dataStack);

      // Both DynamoDB tables should have TableName using Fn::Join containing "Beta"
      template.hasResourceProperties("AWS::DynamoDB::Table", {
        TableName: Match.objectLike({
          "Fn::Join": Match.arrayWith([
            Match.arrayWith(["OrderedListTable-Beta-"]),
          ]),
        }),
      });

      template.hasResourceProperties("AWS::DynamoDB::Table", {
        TableName: Match.objectLike({
          "Fn::Join": Match.arrayWith([
            Match.arrayWith(["ProductsTable-Beta-"]),
          ]),
        }),
      });
    });
  });

  describe("Prod-OrderGoodsDataStack DynamoDB table names contain Prod", () => {
    test("DynamoDB table names contain Prod in the Fn::Join expression", () => {
      const app = new cdk.App();
      const dataStack = new OrderGoodsDataStack(
        app,
        "Prod-OrderGoodsDataStack",
        { stage: "Prod" },
      );
      const template = Template.fromStack(dataStack);

      template.hasResourceProperties("AWS::DynamoDB::Table", {
        TableName: Match.objectLike({
          "Fn::Join": Match.arrayWith([
            Match.arrayWith(["OrderedListTable-Prod-"]),
          ]),
        }),
      });

      template.hasResourceProperties("AWS::DynamoDB::Table", {
        TableName: Match.objectLike({
          "Fn::Join": Match.arrayWith([
            Match.arrayWith(["ProductsTable-Prod-"]),
          ]),
        }),
      });
    });
  });

  describe("Beta LambdaStack Lambda function names contain Beta", () => {
    test("Lambda functions have functionName containing Beta", () => {
      const app = new cdk.App();
      const dataStack = new OrderGoodsDataStack(
        app,
        "Beta-OrderGoodsDataStack",
        { stage: "Beta" },
      );
      const lambdaStack = new OrderGoodsLambdaStack(
        app,
        "Beta-OrderGoodsLambdaStack",
        {
          stage: "Beta",
          orderedListTable: dataStack.orderedListTable,
          productsTable: dataStack.productsTable,
        },
      );
      const template = Template.fromStack(lambdaStack);

      template.hasResourceProperties("AWS::Lambda::Function", {
        FunctionName: "OrderGoods-Beta-GoodsHandler",
      });

      template.hasResourceProperties("AWS::Lambda::Function", {
        FunctionName: "OrderGoods-Beta-ListsHandler",
      });
    });
  });

  describe("AuthStack creates User Pool and Identity Pool with stage name", () => {
    test("User Pool name and Identity Pool name contain the stage", () => {
      const app = new cdk.App();
      const authStack = new OrderGoodsAuthStack(
        app,
        "Beta-OrderGoodsAuthStack",
        { stage: "Beta" },
      );
      const template = Template.fromStack(authStack);

      template.hasResourceProperties("AWS::Cognito::UserPool", {
        UserPoolName: "OrderGoods-Beta-UserPool",
      });

      template.hasResourceProperties("AWS::Cognito::IdentityPool", {
        IdentityPoolName: "OrderGoods-Beta-IdentityPool",
      });
    });
  });

  describe("ApiStack creates REST API with stage name", () => {
    test("REST API name contains the stage", () => {
      const app = new cdk.App();
      const dataStack = new OrderGoodsDataStack(
        app,
        "Beta-OrderGoodsDataStack",
        { stage: "Beta" },
      );
      const lambdaStack = new OrderGoodsLambdaStack(
        app,
        "Beta-OrderGoodsLambdaStack",
        {
          stage: "Beta",
          orderedListTable: dataStack.orderedListTable,
          productsTable: dataStack.productsTable,
        },
      );
      const apiStack = new OrderGoodsApiStack(app, "Beta-OrderGoodsApiStack", {
        stage: "Beta",
        goodsLambdaIntegration: lambdaStack.goodsLambdaIntegration,
        listsLambdaIntegration: lambdaStack.listsLambdaIntegration,
      });
      const template = Template.fromStack(apiStack);

      template.hasResourceProperties("AWS::ApiGateway::RestApi", {
        Name: "OrderGoods-Beta-Api",
      });
    });
  });

  describe("DispatchStack creates Lambda with stage name", () => {
    test("Dispatch Lambda functionName contains the stage", () => {
      const app = new cdk.App();
      const dataStack = new OrderGoodsDataStack(
        app,
        "Beta-OrderGoodsDataStack",
        { stage: "Beta" },
      );
      const dispatchStack = new OrderGoodsDispatchStack(
        app,
        "Beta-OrderGoodsDispatchStack",
        {
          stage: "Beta",
          orderedListTable: dataStack.orderedListTable,
        },
      );
      const template = Template.fromStack(dispatchStack);

      template.hasResourceProperties("AWS::Lambda::Function", {
        FunctionName: "OrderGoods-Beta-DispatchHandler",
      });
    });
  });
});
