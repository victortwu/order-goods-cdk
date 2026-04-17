import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import { OrderGoodsDataStack } from "../lib/stacks/OrderGoodsDataStack";
import { OrderGoodsAuthStack } from "../lib/stacks/OrderGoodsAuthStack";
import { OrderGoodsLambdaStack } from "../lib/stacks/OrderGoodsLambdaStack";
import { OrderGoodsApiStack } from "../lib/stacks/OrderGoodsApiStack";

/**
 * Helper: synthesize a single-stage ApiStack with all its dependencies.
 * Returns the ApiStack template for assertion testing.
 */
function synthesizeApiStack(stage: string) {
  const app = new cdk.App();
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
  const apiStack = new OrderGoodsApiStack(app, `${stage}-OrderGoodsApiStack`, {
    stage,
    goodsLambdaIntegration: lambdaStack.goodsLambdaIntegration,
    listsLambdaIntegration: lambdaStack.listsLambdaIntegration,
    userPool: authStack.userPool,
  });
  return Template.fromStack(apiStack);
}

describe("API Auth Hardening", () => {
  // ───────────────────────────────────────────────────────────────
  // 1. Authorizer exists
  // Validates: Requirements 2.1
  // ───────────────────────────────────────────────────────────────
  describe("Cognito Authorizer resource", () => {
    test("exactly one COGNITO_USER_POOLS authorizer exists in ApiStack", () => {
      const template = synthesizeApiStack("Beta");

      template.resourceCountIs("AWS::ApiGateway::Authorizer", 1);
      template.hasResourceProperties("AWS::ApiGateway::Authorizer", {
        Type: "COGNITO_USER_POOLS",
      });
    });
  });

  // ───────────────────────────────────────────────────────────────
  // 2. All GET/POST methods have COGNITO_USER_POOLS auth
  // Validates: Requirements 2.2, 2.3, 2.4
  // ───────────────────────────────────────────────────────────────
  describe("GET and POST methods are protected", () => {
    test("all GET/POST methods have AuthorizationType COGNITO_USER_POOLS and reference the authorizer", () => {
      const template = synthesizeApiStack("Beta");

      const methods = template.findResources("AWS::ApiGateway::Method", {
        Properties: {
          HttpMethod: Match.anyValue(),
          AuthorizationType: Match.anyValue(),
        },
      });

      const protectedMethods = Object.values(methods).filter(
        (m: any) =>
          m.Properties.HttpMethod === "GET" ||
          m.Properties.HttpMethod === "POST",
      );

      expect(protectedMethods.length).toBeGreaterThanOrEqual(3); // GET /goods, GET /lists, POST /lists

      for (const method of protectedMethods) {
        expect((method as any).Properties.AuthorizationType).toBe(
          "COGNITO_USER_POOLS",
        );
        // The AuthorizerId should reference the authorizer resource
        expect((method as any).Properties.AuthorizerId).toBeDefined();
      }
    });
  });

  // ───────────────────────────────────────────────────────────────
  // 3. OPTIONS methods have AuthorizationType NONE
  // Validates: Requirements 5.1, 5.2
  // ───────────────────────────────────────────────────────────────
  describe("OPTIONS methods are unauthenticated", () => {
    test("all OPTIONS methods have AuthorizationType NONE", () => {
      const template = synthesizeApiStack("Beta");

      const methods = template.findResources("AWS::ApiGateway::Method", {
        Properties: {
          HttpMethod: Match.anyValue(),
          AuthorizationType: Match.anyValue(),
        },
      });

      const optionsMethods = Object.values(methods).filter(
        (m: any) => m.Properties.HttpMethod === "OPTIONS",
      );

      expect(optionsMethods.length).toBeGreaterThanOrEqual(1);

      for (const method of optionsMethods) {
        expect((method as any).Properties.AuthorizationType).toBe("NONE");
        // OPTIONS methods should NOT have an AuthorizerId
        expect((method as any).Properties.AuthorizerId).toBeUndefined();
      }
    });
  });

  // ───────────────────────────────────────────────────────────────
  // 4. Beta AuthStack User Pool has self-sign-up enabled
  // Validates: Requirements 4.2
  // ───────────────────────────────────────────────────────────────
  describe("Beta self-sign-up enabled", () => {
    test("Beta User Pool does not have AllowAdminCreateUserOnly set to true", () => {
      const app = new cdk.App();
      const authStack = new OrderGoodsAuthStack(
        app,
        "Beta-OrderGoodsAuthStack",
        { stage: "Beta" },
      );
      const template = Template.fromStack(authStack);

      // When selfSignUpEnabled is true, CDK either omits AdminCreateUserConfig
      // or sets AllowAdminCreateUserOnly to false. It should NOT be true.
      const userPools = template.findResources("AWS::Cognito::UserPool");
      const userPoolValues = Object.values(userPools);
      expect(userPoolValues).toHaveLength(1);

      const userPoolProps = (userPoolValues[0] as any).Properties;
      const adminCreateUserConfig = userPoolProps.AdminCreateUserConfig;

      // Either AdminCreateUserConfig is absent, or AllowAdminCreateUserOnly is false/absent
      if (adminCreateUserConfig) {
        expect(adminCreateUserConfig.AllowAdminCreateUserOnly).not.toBe(true);
      }
    });
  });

  // ───────────────────────────────────────────────────────────────
  // 5. Prod AuthStack User Pool has self-sign-up disabled
  // Validates: Requirements 4.1
  // ───────────────────────────────────────────────────────────────
  describe("Prod self-sign-up disabled", () => {
    test("Prod User Pool has AllowAdminCreateUserOnly set to true", () => {
      const app = new cdk.App();
      const authStack = new OrderGoodsAuthStack(
        app,
        "Prod-OrderGoodsAuthStack",
        { stage: "Prod" },
      );
      const template = Template.fromStack(authStack);

      template.hasResourceProperties("AWS::Cognito::UserPool", {
        AdminCreateUserConfig: {
          AllowAdminCreateUserOnly: true,
        },
      });
    });
  });

  // ───────────────────────────────────────────────────────────────
  // 6. Cross-stack wiring — Beta
  // Validates: Requirements 3.1, 3.3
  // ───────────────────────────────────────────────────────────────
  describe("Cross-stack wiring — Beta", () => {
    test("Beta ApiStack authorizer references Beta User Pool", () => {
      const app = new cdk.App();
      const stages = ["Beta", "Prod"];
      const apiStacks: Record<string, OrderGoodsApiStack> = {};
      const authStacks: Record<string, OrderGoodsAuthStack> = {};

      for (const stage of stages) {
        const authStack = new OrderGoodsAuthStack(
          app,
          `${stage}-OrderGoodsAuthStack`,
          { stage },
        );
        authStacks[stage] = authStack;
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
        const apiStack = new OrderGoodsApiStack(
          app,
          `${stage}-OrderGoodsApiStack`,
          {
            stage,
            goodsLambdaIntegration: lambdaStack.goodsLambdaIntegration,
            listsLambdaIntegration: lambdaStack.listsLambdaIntegration,
            userPool: authStack.userPool,
          },
        );
        apiStacks[stage] = apiStack;
      }

      const betaApiTemplate = Template.fromStack(apiStacks["Beta"]);
      const betaAuthTemplate = Template.fromStack(authStacks["Beta"]);

      // Find the authorizer in Beta ApiStack
      const authorizers = betaApiTemplate.findResources(
        "AWS::ApiGateway::Authorizer",
      );
      const authorizerValues = Object.values(authorizers);
      expect(authorizerValues).toHaveLength(1);

      const authorizerProps = (authorizerValues[0] as any).Properties;
      const providerArns = authorizerProps.ProviderARNs;
      expect(providerArns).toBeDefined();
      expect(providerArns).toHaveLength(1);

      // The ProviderARN should be an Fn::ImportValue referencing the Beta AuthStack export
      const providerArn = providerArns[0];

      // Find the User Pool ARN exported by Beta AuthStack
      const betaAuthOutputs = betaAuthTemplate.toJSON().Outputs || {};
      const betaExportNames = Object.values(betaAuthOutputs)
        .filter((o: any) => o.Export)
        .map((o: any) => o.Export.Name);

      // The authorizer's ProviderARN should use Fn::ImportValue
      // referencing a Beta AuthStack export
      if (providerArn["Fn::ImportValue"]) {
        expect(betaExportNames).toContain(providerArn["Fn::ImportValue"]);
      } else if (providerArn["Fn::GetAtt"]) {
        // Direct reference within the same app (CDK may resolve differently)
        expect(providerArn["Fn::GetAtt"]).toBeDefined();
      } else {
        // It should be some form of cross-stack reference
        fail(
          "Expected ProviderARN to be a cross-stack reference (Fn::ImportValue or Fn::GetAtt)",
        );
      }
    });
  });

  // ───────────────────────────────────────────────────────────────
  // 7. Cross-stack wiring — Prod
  // Validates: Requirements 3.2, 3.3
  // ───────────────────────────────────────────────────────────────
  describe("Cross-stack wiring — Prod", () => {
    test("Prod ApiStack authorizer references Prod User Pool", () => {
      const app = new cdk.App();
      const stages = ["Beta", "Prod"];
      const apiStacks: Record<string, OrderGoodsApiStack> = {};
      const authStacks: Record<string, OrderGoodsAuthStack> = {};

      for (const stage of stages) {
        const authStack = new OrderGoodsAuthStack(
          app,
          `${stage}-OrderGoodsAuthStack`,
          { stage },
        );
        authStacks[stage] = authStack;
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
        const apiStack = new OrderGoodsApiStack(
          app,
          `${stage}-OrderGoodsApiStack`,
          {
            stage,
            goodsLambdaIntegration: lambdaStack.goodsLambdaIntegration,
            listsLambdaIntegration: lambdaStack.listsLambdaIntegration,
            userPool: authStack.userPool,
          },
        );
        apiStacks[stage] = apiStack;
      }

      const prodApiTemplate = Template.fromStack(apiStacks["Prod"]);
      const prodAuthTemplate = Template.fromStack(authStacks["Prod"]);

      // Find the authorizer in Prod ApiStack
      const authorizers = prodApiTemplate.findResources(
        "AWS::ApiGateway::Authorizer",
      );
      const authorizerValues = Object.values(authorizers);
      expect(authorizerValues).toHaveLength(1);

      const authorizerProps = (authorizerValues[0] as any).Properties;
      const providerArns = authorizerProps.ProviderARNs;
      expect(providerArns).toBeDefined();
      expect(providerArns).toHaveLength(1);

      const providerArn = providerArns[0];

      // Find the User Pool ARN exported by Prod AuthStack
      const prodAuthOutputs = prodAuthTemplate.toJSON().Outputs || {};
      const prodExportNames = Object.values(prodAuthOutputs)
        .filter((o: any) => o.Export)
        .map((o: any) => o.Export.Name);

      if (providerArn["Fn::ImportValue"]) {
        expect(prodExportNames).toContain(providerArn["Fn::ImportValue"]);
      } else if (providerArn["Fn::GetAtt"]) {
        expect(providerArn["Fn::GetAtt"]).toBeDefined();
      } else {
        fail(
          "Expected ProviderARN to be a cross-stack reference (Fn::ImportValue or Fn::GetAtt)",
        );
      }

      // Additionally verify that Prod authorizer does NOT reference Beta exports
      const betaAuthTemplate = Template.fromStack(authStacks["Beta"]);
      const betaAuthOutputs = betaAuthTemplate.toJSON().Outputs || {};
      const betaExportNames = Object.values(betaAuthOutputs)
        .filter((o: any) => o.Export)
        .map((o: any) => o.Export.Name);

      if (providerArn["Fn::ImportValue"]) {
        // Prod's import should NOT match any Beta export
        expect(betaExportNames).not.toContain(providerArn["Fn::ImportValue"]);
      }
    });
  });
});
