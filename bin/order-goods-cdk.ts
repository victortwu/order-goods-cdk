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

// Shared DNS + certificate facts (management account 653102291240). The
// eatbdk.com hosted zone and the wildcard cert both live in this account, so
// OrderGoods can reference them directly — no cross-account work required.
const EATBDK_HOSTED_ZONE_ID = "Z0800972IN9ZTIJFYOY3";
const EATBDK_ZONE_NAME = "eatbdk.com";
const EATBDK_WILDCARD_CERT_ARN =
  "arn:aws:acm:us-east-1:653102291240:certificate/402cdd8e-9f77-4c07-8aee-2e908b646f47";

// Per-stage custom domain for the frontend. Only Prod is publicly branded;
// Beta continues to serve off its default *.cloudfront.net domain.
const frontendDomainByStage: Record<string, string | undefined> = {
  Prod: "ordergoods.eatbdk.com",
};

for (const stage of stages) {
  const stageLower = stage.toLowerCase();

  const authStack = new OrderGoodsAuthStack(app, `${stage}-OrderGoodsAuthStack`, { stage });
  const dataStack = new OrderGoodsDataStack(app, `${stage}-OrderGoodsDataStack`, { stage });
  const lambdaStack = new OrderGoodsLambdaStack(app, `${stage}-OrderGoodsLambdaStack`, {
    stage,
    orderedListTable: dataStack.orderedListTable,
    productsTable: dataStack.productsTable,
  });
  new OrderGoodsApiStack(app, `${stage}-OrderGoodsApiStack`, {
    stage,
    goodsLambdaIntegration: lambdaStack.goodsLambdaIntegration,
    listsLambdaIntegration: lambdaStack.listsLambdaIntegration,
    userPool: authStack.userPool,
  });

  // Shared bot infrastructure
  const botClusterStack = new BotClusterStack(app, `${stage}-BotClusterStack`, { stage });

  // Per-vendor bot stacks
  const rdBotStack = new PlaywrightBotStack(app, `${stage}-PlaywrightBotStack-restaurant-depot`, {
    stage,
    vendorId: "restaurant-depot",
    botName: "RD Order Bot",
    credentialSecretPath: `order-goods/${stageLower}/restaurant-depot-creds`,
    environmentVars: { DELIVERY_ZIP_CODE: "" },
  });
  rdBotStack.addDependency(botClusterStack);

  // Orchestration stack — Step Functions state machine + supporting Lambdas
  const orchestrationStack = new OrderGoodsOrchestrationStack(
    app,
    `${stage}-OrderGoodsOrchestrationStack`,
    { stage },
  );

  // Dispatch stack — fully decoupled, reads SSM at runtime
  const dispatchStack = new OrderGoodsDispatchStack(app, `${stage}-OrderGoodsDispatchStack`, {
    stage,
    orderedListTable: dataStack.orderedListTable,
  });
  dispatchStack.addDependency(rdBotStack);
  dispatchStack.addDependency(orchestrationStack);

  const frontendDomainName = frontendDomainByStage[stage];

  new OrderGoodsFrontendStack(app, `${stage}-OrderGoodsFrontendStack`, {
    stage,
    ...(frontendDomainName
      ? {
          domainName: frontendDomainName,
          certificateArn: EATBDK_WILDCARD_CERT_ARN,
          hostedZoneId: EATBDK_HOSTED_ZONE_ID,
          zoneName: EATBDK_ZONE_NAME,
        }
      : {}),
  });
}
