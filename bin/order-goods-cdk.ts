#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { OrderGoodsApiStack } from "../lib/OrderGoodsApiStack";
import { OrderGoodsLambdaStack } from "../lib/OrderGoodsLambdaStack";
// Hello from another computer!!
const app = new cdk.App();

const orderGoodsLambdaStack = new OrderGoodsLambdaStack(
  app,
  "OrderGoodsLambdaStack"
);

new OrderGoodsApiStack(app, "OrderGoodsApiStack", {
  goodsLambdaIntegration: orderGoodsLambdaStack.goodsLambdaIntegration,
  listsLambdaIntegration: orderGoodsLambdaStack.listsLambdaIntegration,
});
