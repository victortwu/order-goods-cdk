import { Stack, StackProps } from "aws-cdk-lib";
import { LambdaIntegration, RestApi } from "aws-cdk-lib/aws-apigateway";
import { Construct } from "constructs";

interface OrderGoodsApiStackProps extends StackProps {
  goodsLambdaIntegration: LambdaIntegration;
  listsLambdaIntegration: LambdaIntegration;
}

export class OrderGoodsApiStack extends Stack {
  constructor(scope: Construct, id: string, props: OrderGoodsApiStackProps) {
    super(scope, id, props);

    const api = new RestApi(this, "OrderGoodsApi", {
      defaultCorsPreflightOptions: {
        allowOrigins: ["*"],
        allowMethods: ["*"],
        allowHeaders: ["*"],
      },
    });

    const goodsResource = api.root.addResource("goods");

    const listsResource = api.root.addResource("lists");

    goodsResource.addMethod("GET", props.goodsLambdaIntegration);

    listsResource.addMethod("GET", props.listsLambdaIntegration);
    listsResource.addMethod("POST", props.listsLambdaIntegration);
  }
}
