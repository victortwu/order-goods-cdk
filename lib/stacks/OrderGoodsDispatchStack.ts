import { PolicyStatement, Effect } from "aws-cdk-lib/aws-iam";
import { Stack, StackProps } from "aws-cdk-lib";
import { Runtime, StartingPosition } from "aws-cdk-lib/aws-lambda";
import { ITable } from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";
import { join } from "path";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { DynamoEventSource } from "aws-cdk-lib/aws-lambda-event-sources";

interface OrderGoodsDispatchStackProps extends StackProps {
  orderedListTable: ITable;
}

export class OrderGoodsDispatchStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    props: OrderGoodsDispatchStackProps,
  ) {
    super(scope, id, props);

    const dispatchLambda = new NodejsFunction(this, "DispatchLambda", {
      entry: join(__dirname, "..", "lambdas", "dispatch", "handler.ts"),
      handler: "dispatchHandler",
      runtime: Runtime.NODEJS_22_X,
      bundling: {
        forceDockerBundling: false,
      },
      environment: {
        RECIPIENT_EMAIL: process.env.RECIPIENT_EMAIL || "",
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
        actions: ["ses:SendEmail", "ses:SendRawEmail"],
        resources: ["*"],
      }),
    );
  }
}
