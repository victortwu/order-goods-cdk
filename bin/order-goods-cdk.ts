#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { OrderGoodsApiStack } from "../lib/stacks/OrderGoodsApiStack";
import { OrderGoodsLambdaStack } from "../lib/stacks/OrderGoodsLambdaStack";
import { OrderGoodsDataStack } from "../lib/stacks/OrderGoodsDataStack";
import { OrderGoodsAuthStack } from "../lib/stacks/OrderGoodsAuthStack";
import { OrderGoodsDispatchStack } from "../lib/stacks/OrderGoodsDispatchStack";

const app = new cdk.App();

const orderGoodsAuthStack = new OrderGoodsAuthStack(app, "OrderGoodsAuthStack");

const orderGoodsDataStack = new OrderGoodsDataStack(app, "OrderGoodsDataStack");

const orderGoodsLambdaStack = new OrderGoodsLambdaStack(
  app,
  "OrderGoodsLambdaStack",
  {
    orderedListTable: orderGoodsDataStack.orderedListTable,
    productsTable: orderGoodsDataStack.productsTable,
  },
);

new OrderGoodsApiStack(app, "OrderGoodsApiStack", {
  goodsLambdaIntegration: orderGoodsLambdaStack.goodsLambdaIntegration,
  listsLambdaIntegration: orderGoodsLambdaStack.listsLambdaIntegration,
});

new OrderGoodsDispatchStack(app, "OrderGoodsDispatchStack", {
  orderedListTable: orderGoodsDataStack.orderedListTable,
});
