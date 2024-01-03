import { Stack, StackProps } from "aws-cdk-lib";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { LambdaIntegration } from "aws-cdk-lib/aws-apigateway";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { Construct } from "constructs";
import { join } from "path";

export class OrderGoodsLambdaStack extends Stack {
  public readonly goodsLambdaIntegration: LambdaIntegration;
  public readonly listsLambdaIntegration: LambdaIntegration;
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const goodsLambda = new NodejsFunction(this, "OrderGoodsLambda", {
      entry: join(__dirname, "services", "goodsHandler.ts"),
      handler: "goodsHandler",
      runtime: Runtime.NODEJS_18_X,
    });

    const listsLambda = new NodejsFunction(this, "OrderGoodsListsLambda", {
      entry: join(__dirname, "services", "listsHandler.ts"),
      handler: "listsHandler",
      runtime: Runtime.NODEJS_18_X,
    });

    this.goodsLambdaIntegration = new LambdaIntegration(goodsLambda);
    this.listsLambdaIntegration = new LambdaIntegration(listsLambda);
  }
}
