import { Stack, StackProps } from "aws-cdk-lib";
import { LambdaIntegration, RestApi, Cors } from "aws-cdk-lib/aws-apigateway";
import { Construct } from "constructs";

interface OrderGoodsApiStackProps extends StackProps {
  stage: string;
  goodsLambdaIntegration: LambdaIntegration;
  listsLambdaIntegration: LambdaIntegration;
}

export class OrderGoodsApiStack extends Stack {
  constructor(scope: Construct, id: string, props: OrderGoodsApiStackProps) {
    super(scope, id, props);

    const api = new RestApi(this, "OrderGoodsApi", {
      restApiName: `OrderGoods-${props.stage}-Api`,
    });

    const optionsWithCors = {
      defaultCorsPreflightOptions: {
        allowOrigins: Cors.ALL_ORIGINS,
        allowMethods: Cors.ALL_METHODS,
      },
    };

    const goodsResource = api.root.addResource("goods", optionsWithCors);

    const listsResource = api.root.addResource("lists", optionsWithCors);

    goodsResource.addMethod("GET", props.goodsLambdaIntegration);

    listsResource.addMethod("GET", props.listsLambdaIntegration);
    listsResource.addMethod("POST", props.listsLambdaIntegration);
  }
}
