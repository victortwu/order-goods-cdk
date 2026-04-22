#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { OrderGoodsApiStack } from "../lib/stacks/OrderGoodsApiStack";
import { OrderGoodsLambdaStack } from "../lib/stacks/OrderGoodsLambdaStack";
import { OrderGoodsDataStack } from "../lib/stacks/OrderGoodsDataStack";
import { OrderGoodsAuthStack } from "../lib/stacks/OrderGoodsAuthStack";
import { OrderGoodsDispatchStack } from "../lib/stacks/OrderGoodsDispatchStack";
import { OrderGoodsFrontendStack } from "../lib/stacks/OrderGoodsFrontendStack";
import { OrderGoodsRDOrderBotStack } from "../lib/stacks/OrderGoodsRDOrderBotStack";

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
    userPool: authStack.userPool,
  });
  const rdOrderBotStack = new OrderGoodsRDOrderBotStack(
    app,
    `${stage}-OrderGoodsRDOrderBotStack`,
    {
      stage,
    },
  );
  new OrderGoodsDispatchStack(app, `${stage}-OrderGoodsDispatchStack`, {
    stage,
    orderedListTable: dataStack.orderedListTable,
    ecsClusterArn: rdOrderBotStack.clusterArn,
    ecsTaskDefinitionArn: rdOrderBotStack.taskDefinitionArn,
    ecsSubnetIds: rdOrderBotStack.subnetIds,
    ecsSecurityGroupIds: rdOrderBotStack.securityGroupIds,
    ecsLogGroupName: rdOrderBotStack.logGroupName,
  });
  new OrderGoodsFrontendStack(app, `${stage}-OrderGoodsFrontendStack`, {
    stage,
  });
}
