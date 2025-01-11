import { PolicyStatement, Effect } from "aws-cdk-lib/aws-iam";
import { Stack, StackProps } from "aws-cdk-lib";
import { LambdaIntegration } from "aws-cdk-lib/aws-apigateway";
import { Runtime, Function, Code } from "aws-cdk-lib/aws-lambda";
import { ITable } from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";
import { join } from "path";

interface OrderGoodsLambdaStackProps extends StackProps {
  orderedListTable: ITable;
  productsTable: ITable;
}

export class OrderGoodsLambdaStack extends Stack {
  public readonly goodsLambdaIntegration: LambdaIntegration;
  public readonly listsLambdaIntegration: LambdaIntegration;
  constructor(scope: Construct, id: string, props: OrderGoodsLambdaStackProps) {
    super(scope, id, props);

    const goodsLambda = new Function(this, "OrderGoodsLambda", {
      code: Code.fromAsset(join(__dirname, "services")),
      handler: "goodsHandler.goodsHandler",
      runtime: Runtime.NODEJS_18_X,
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
      })
    );

    const listsLambda = new Function(this, "OrderGoodsListsLambda", {
      code: Code.fromAsset(join(__dirname, "services")),
      handler: "listsHandler.listsHandler",
      runtime: Runtime.NODEJS_18_X,
      environment: {
        ORDERED_LIST_TABLE_NAME: props.orderedListTable.tableName,
      },
    });

    listsLambda.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        resources: [props.orderedListTable.tableArn],
        actions: ["dynamodb:PutItem", "dynamodb:GetItem"],
      })
    );

    this.goodsLambdaIntegration = new LambdaIntegration(goodsLambda);
    this.listsLambdaIntegration = new LambdaIntegration(listsLambda);
  }
}
