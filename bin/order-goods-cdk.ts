#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { OrderGoodsApiStack } from "../lib/stacks/OrderGoodsApiStack";
import { OrderGoodsLambdaStack } from "../lib/stacks/OrderGoodsLambdaStack";
import { OrderGoodsDataStack } from "../lib/stacks/OrderGoodsDataStack";
import { OrderGoodsAuthStack } from "../lib/stacks/OrderGoodsAuthStack";
import { OrderGoodsDispatchStack } from "../lib/stacks/OrderGoodsDispatchStack";
import { OrderGoodsFrontendStack } from "../lib/stacks/OrderGoodsFrontendStack";
import { BotClusterStack } from "../lib/stacks/BotClusterStack";
import { PlaywrightBotStack } from "../lib/stacks/PlaywrightBotStack";
import { OrderGoodsOrchestrationStack } from "../lib/stacks/OrderGoodsOrchestrationStack";

const app = new cdk.App();
const stages = ["Beta", "Prod"];

for (const stage of stages) {
  const stageLower = stage.toLowerCase();

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
    userPool: authStack.userPool,
  });

  // Shared bot infrastructure
  const botClusterStack = new BotClusterStack(
    app,
    `${stage}-BotClusterStack`,
    { stage },
  );

  // Per-vendor bot stacks
  const rdBotStack = new PlaywrightBotStack(
    app,
    `${stage}-PlaywrightBotStack-restaurant-depot`,
    {
      stage,
      vendorId: "restaurant-depot",
      botName: "RD Order Bot",
      credentialSecretPath: `order-goods/${stageLower}/restaurant-depot-creds`,
      environmentVars: { DELIVERY_ZIP_CODE: "" },
    },
  );
  rdBotStack.addDependency(botClusterStack);

  // Orchestration stack — Step Functions state machine + supporting Lambdas
  const orchestrationStack = new OrderGoodsOrchestrationStack(
    app,
    `${stage}-OrderGoodsOrchestrationStack`,
    { stage },
  );

  // Dispatch stack — fully decoupled, reads SSM at runtime
  const dispatchStack = new OrderGoodsDispatchStack(
    app,
    `${stage}-OrderGoodsDispatchStack`,
    {
      stage,
      orderedListTable: dataStack.orderedListTable,
    },
  );
  dispatchStack.addDependency(rdBotStack);
  dispatchStack.addDependency(orchestrationStack);

  new OrderGoodsFrontendStack(app, `${stage}-OrderGoodsFrontendStack`, {
    stage,
  });
}
