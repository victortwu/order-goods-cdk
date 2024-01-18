#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { OrderGoodsApiStack } from "../lib/OrderGoodsApiStack";
import { OrderGoodsLambdaStack } from "../lib/OrderGoodsLambdaStack";
import { OrderGoodsDataStack } from "../lib/OrderGoodsDataStack";

const app = new cdk.App();

const orderGoodsDataStack = new OrderGoodsDataStack(app, "OrderGoodsDataStack");

const orderGoodsLambdaStack = new OrderGoodsLambdaStack(
  app,
  "OrderGoodsLambdaStack",
  {
    orderedListTable: orderGoodsDataStack.orderedListTable,
    productsTable: orderGoodsDataStack.productsTable,
  }
);

new OrderGoodsApiStack(app, "OrderGoodsApiStack", {
  goodsLambdaIntegration: orderGoodsLambdaStack.goodsLambdaIntegration,
  listsLambdaIntegration: orderGoodsLambdaStack.listsLambdaIntegration,
});
