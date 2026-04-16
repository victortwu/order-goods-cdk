import { PolicyStatement, Effect } from "aws-cdk-lib/aws-iam";
import { Stack, StackProps } from "aws-cdk-lib";
import { LambdaIntegration } from "aws-cdk-lib/aws-apigateway";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { ITable } from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";
import { join } from "path";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";

// Lambda handler entry points are in lib/lambdas/

interface OrderGoodsLambdaStackProps extends StackProps {
  stage: string;
  orderedListTable: ITable;
  productsTable: ITable;
}

export class OrderGoodsLambdaStack extends Stack {
  public readonly goodsLambdaIntegration: LambdaIntegration;
  public readonly listsLambdaIntegration: LambdaIntegration;
  constructor(scope: Construct, id: string, props: OrderGoodsLambdaStackProps) {
    super(scope, id, props);

    const goodsLambda = new NodejsFunction(this, "OrderGoodsLambda", {
      functionName: `OrderGoods-${props.stage}-GoodsHandler`,
      entry: join(__dirname, "..", "lambdas", "goods", "handler.ts"),
      handler: "goodsHandler",
      runtime: Runtime.NODEJS_22_X,
      bundling: {
        forceDockerBundling: false,
      },
      environment: {
        PRODUCTS_TABLE: props.productsTable.tableName,
      },
    });

    goodsLambda.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        resources: [props.productsTable.tableArn],
        actions: [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:Scan",
          "dynamodb:Query",
        ],
      }),
    );

    const listsLambda = new NodejsFunction(this, "OrderGoodsListsLambda", {
      functionName: `OrderGoods-${props.stage}-ListsHandler`,
      entry: join(__dirname, "..", "lambdas", "lists", "handler.ts"),
      handler: "listsHandler",
      runtime: Runtime.NODEJS_22_X,
      bundling: {
        forceDockerBundling: false,
      },
      environment: {
        ORDERED_LIST_TABLE_NAME: props.orderedListTable.tableName,
      },
    });

    listsLambda.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        resources: [props.orderedListTable.tableArn],
        actions: ["dynamodb:PutItem", "dynamodb:GetItem"],
      }),
    );

    this.goodsLambdaIntegration = new LambdaIntegration(goodsLambda);
    this.listsLambdaIntegration = new LambdaIntegration(listsLambda);
  }
}
