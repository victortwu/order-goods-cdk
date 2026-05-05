import { Duration } from "aws-cdk-lib";
import { PolicyStatement, Effect } from "aws-cdk-lib/aws-iam";
import { Stack, StackProps } from "aws-cdk-lib";
import { Runtime, StartingPosition } from "aws-cdk-lib/aws-lambda";
import { ITable } from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";
import { join } from "path";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { DynamoEventSource } from "aws-cdk-lib/aws-lambda-event-sources";

interface OrderGoodsDispatchStackProps extends StackProps {
  stage: string;
  orderedListTable: ITable;
}

export class OrderGoodsDispatchStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    props: OrderGoodsDispatchStackProps,
  ) {
    super(scope, id, props);

    const stageLower = props.stage.toLowerCase();

    const dispatchLambda = new NodejsFunction(this, "DispatchLambda", {
      functionName: `OrderGoods-${props.stage}-DispatchHandler`,
      entry: join(__dirname, "..", "lambdas", "dispatch", "handler.ts"),
      handler: "dispatchHandler",
      runtime: Runtime.NODEJS_22_X,
      timeout: Duration.minutes(1),
      bundling: {
        forceDockerBundling: false,
      },
      environment: {
        RECIPIENT_EMAIL: process.env.RECIPIENT_EMAIL || "",
        STAGE: props.stage,
      },
    });

    dispatchLambda.addEventSource(
      new DynamoEventSource(props.orderedListTable, {
        startingPosition: StartingPosition.LATEST,
        batchSize: 1,
      }),
    );

    dispatchLambda.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["states:StartExecution"],
        resources: [
          `arn:aws:states:*:*:stateMachine:OrderGoods-${props.stage}-OrderOrchestration`,
        ],
      }),
    );

    dispatchLambda.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["ssm:GetParameter"],
        resources: [
          `arn:aws:ssm:*:*:parameter/order-goods/${stageLower}/*`,
        ],
      }),
    );
  }
}
