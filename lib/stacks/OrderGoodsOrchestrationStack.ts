import { Duration, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import { Runtime } from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { PolicyStatement, Effect } from "aws-cdk-lib/aws-iam";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import * as logs from "aws-cdk-lib/aws-logs";
import * as sns from "aws-cdk-lib/aws-sns";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { join } from "path";

interface OrderGoodsOrchestrationStackProps extends StackProps {
  stage: string;
}

export class OrderGoodsOrchestrationStack extends Stack {
  constructor(scope: Construct, id: string, props: OrderGoodsOrchestrationStackProps) {
    super(scope, id, props);

    const { stage } = props;
    const stageLower = stage.toLowerCase();
    const lambdaDir = join(__dirname, "..", "lambdas", "orchestration");

    // --- SNS Topic ---

    const notificationTopic = new sns.Topic(this, "NotificationTopic", {
      topicName: `OrderGoods-${stage}-OrderNotifications`,
    });

    new ssm.StringParameter(this, "SnsTopicArnParam", {
      parameterName: `/order-goods/${stageLower}/orchestration/sns-topic-arn`,
      stringValue: notificationTopic.topicArn,
    });

    // --- Lambdas ---

    const resultProcessorLambda = new NodejsFunction(this, "ResultProcessorLambda", {
      functionName: `OrderGoods-${stage}-ResultProcessor`,
      entry: join(lambdaDir, "resultProcessor.ts"),
      handler: "handler",
      runtime: Runtime.NODEJS_22_X,
      timeout: Duration.seconds(30),
      bundling: { forceDockerBundling: false },
    });

    resultProcessorLambda.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["logs:GetLogEvents"],
        resources: [`arn:aws:logs:*:*:log-group:/ecs/order-goods-*:*`],
      }),
    );

    const notificationLambda = new NodejsFunction(this, "NotificationLambda", {
      functionName: `OrderGoods-${stage}-Notification`,
      entry: join(lambdaDir, "notificationHandler.ts"),
      handler: "handler",
      runtime: Runtime.NODEJS_22_X,
      timeout: Duration.seconds(30),
      bundling: { forceDockerBundling: false },
    });

    notificationLambda.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["ses:SendEmail", "ses:SendRawEmail"],
        resources: ["*"],
      }),
    );

    notificationLambda.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["sns:Publish"],
        resources: [notificationTopic.topicArn],
      }),
    );

    notificationLambda.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["dynamodb:UpdateItem"],
        resources: [`arn:aws:dynamodb:*:*:table/OrderedListTable-${stage}-*`],
      }),
    );

    const emailDispatchLambda = new NodejsFunction(this, "EmailDispatchLambda", {
      functionName: `OrderGoods-${stage}-EmailDispatch`,
      entry: join(lambdaDir, "emailDispatch.ts"),
      handler: "handler",
      runtime: Runtime.NODEJS_22_X,
      timeout: Duration.seconds(30),
      bundling: { forceDockerBundling: false },
    });

    emailDispatchLambda.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["ses:SendEmail", "ses:SendRawEmail"],
        resources: ["*"],
      }),
    );

    // --- State Machine Definition ---

    // Bot path: RunTask.sync → Result Processor → Notification
    const runBotTask = new sfn.CustomState(this, "RunBotTask", {
      stateJson: {
        Type: "Task",
        Resource: "arn:aws:states:::ecs:runTask.sync",
        Parameters: {
          "Cluster.$": "$.ecsConfig.clusterArn",
          "TaskDefinition.$": "$.ecsConfig.taskDefinitionFamily",
          LaunchType: "FARGATE",
          NetworkConfiguration: {
            AwsvpcConfiguration: {
              "Subnets.$": "$.ecsConfig.subnets",
              "SecurityGroups.$": "$.ecsConfig.securityGroups",
              AssignPublicIp: "DISABLED",
            },
          },
          Overrides: {
            ContainerOverrides: [
              {
                "Name.$": "$.ecsConfig.containerName",
                Environment: [
                  {
                    Name: "VENDOR_GROUP_PAYLOAD",
                    "Value.$": "States.JsonToString($.vendorGroup)",
                  },
                ],
              },
            ],
          },
        },
        ResultPath: "$.taskResult",
      },
    });

    const processResult = new tasks.LambdaInvoke(this, "ProcessResult", {
      lambdaFunction: resultProcessorLambda,
      payload: sfn.TaskInput.fromObject({
        taskArn: sfn.JsonPath.stringAt("$.taskResult.TaskArn"),
        logGroupName: sfn.JsonPath.stringAt("$.ecsConfig.logGroupName"),
        containerName: sfn.JsonPath.stringAt("$.ecsConfig.containerName"),
      }),
      resultPath: "$.resultProcessorOutput",
      payloadResponseOnly: true,
    });

    const sendSuccessNotification = new tasks.LambdaInvoke(this, "SendSuccessNotification", {
      lambdaFunction: notificationLambda,
      payload: sfn.TaskInput.fromObject({
        type: "success",
        recipientEmail: sfn.JsonPath.stringAt("$.recipientEmail"),
        recipientPhone: sfn.JsonPath.stringAt("$.recipientPhone"),
        snsTopicArn: sfn.JsonPath.stringAt("$.snsTopicArn"),
        tableName: sfn.JsonPath.stringAt("$.tableName"),
        vendorGroup: sfn.JsonPath.objectAt("$.vendorGroup"),
        orderResult: sfn.JsonPath.objectAt("$.resultProcessorOutput"),
      }),
      resultPath: sfn.JsonPath.DISCARD,
      payloadResponseOnly: true,
    });

    const sendErrorNotification = new tasks.LambdaInvoke(this, "SendErrorNotification", {
      lambdaFunction: notificationLambda,
      payload: sfn.TaskInput.fromObject({
        type: "failure",
        recipientEmail: sfn.JsonPath.stringAt("$.recipientEmail"),
        recipientPhone: sfn.JsonPath.stringAt("$.recipientPhone"),
        snsTopicArn: sfn.JsonPath.stringAt("$.snsTopicArn"),
        tableName: sfn.JsonPath.stringAt("$.tableName"),
        vendorGroup: sfn.JsonPath.objectAt("$.vendorGroup"),
        error: sfn.JsonPath.stringAt("$.error.Cause"),
      }),
      resultPath: sfn.JsonPath.DISCARD,
      payloadResponseOnly: true,
    });

    // Email path: Email Dispatch Lambda → Notification (email_sent status)
    const invokeEmailDispatch = new tasks.LambdaInvoke(this, "InvokeEmailDispatch", {
      lambdaFunction: emailDispatchLambda,
      payload: sfn.TaskInput.fromObject({
        vendorGroup: sfn.JsonPath.objectAt("$.vendorGroup"),
        emailConfig: sfn.JsonPath.objectAt("$.emailConfig"),
        recipientEmail: sfn.JsonPath.stringAt("$.recipientEmail"),
      }),
      resultPath: sfn.JsonPath.DISCARD,
      payloadResponseOnly: true,
    });

    const sendEmailSentNotification = new tasks.LambdaInvoke(this, "SendEmailSentNotification", {
      lambdaFunction: notificationLambda,
      payload: sfn.TaskInput.fromObject({
        type: "email_sent",
        recipientEmail: sfn.JsonPath.stringAt("$.recipientEmail"),
        recipientPhone: sfn.JsonPath.stringAt("$.recipientPhone"),
        snsTopicArn: sfn.JsonPath.stringAt("$.snsTopicArn"),
        tableName: sfn.JsonPath.stringAt("$.tableName"),
        vendorGroup: sfn.JsonPath.objectAt("$.vendorGroup"),
      }),
      resultPath: sfn.JsonPath.DISCARD,
      payloadResponseOnly: true,
    });

    // Not configured path: Notification with items list
    const sendNotConfiguredNotification = new tasks.LambdaInvoke(
      this,
      "SendNotConfiguredNotification",
      {
        lambdaFunction: notificationLambda,
        payload: sfn.TaskInput.fromObject({
          type: "not_configured",
          recipientEmail: sfn.JsonPath.stringAt("$.recipientEmail"),
          recipientPhone: sfn.JsonPath.stringAt("$.recipientPhone"),
          snsTopicArn: sfn.JsonPath.stringAt("$.snsTopicArn"),
          tableName: sfn.JsonPath.stringAt("$.tableName"),
          vendorGroup: sfn.JsonPath.objectAt("$.vendorGroup"),
        }),
        resultPath: sfn.JsonPath.DISCARD,
        payloadResponseOnly: true,
      },
    );

    // API path: placeholder fail
    const apiNotImplemented = new sfn.Fail(this, "ApiNotImplemented", {
      cause: "API dispatch not yet implemented",
      error: "NotImplementedError",
    });

    // Wire bot path with error handling
    const botPath = runBotTask.next(processResult).next(sendSuccessNotification);

    runBotTask.addCatch(sendErrorNotification, { resultPath: "$.error" });
    processResult.addCatch(sendErrorNotification, { resultPath: "$.error" });

    // Email path: dispatch then notify
    const emailPath = invokeEmailDispatch.next(sendEmailSentNotification);
    invokeEmailDispatch.addCatch(sendErrorNotification, { resultPath: "$.error" });

    // Choice state: route by dispatch method
    const routeByMethod = new sfn.Choice(this, "RouteByDispatchMethod")
      .when(sfn.Condition.stringEquals("$.dispatchMethod", "ecs_bot"), botPath)
      .when(sfn.Condition.stringEquals("$.dispatchMethod", "email"), emailPath)
      .when(
        sfn.Condition.stringEquals("$.dispatchMethod", "not_configured"),
        sendNotConfiguredNotification,
      )
      .when(sfn.Condition.stringEquals("$.dispatchMethod", "api"), apiNotImplemented)
      .otherwise(
        new sfn.Fail(this, "UnknownDispatchMethod", {
          cause: "Unknown dispatch method",
          error: "UnknownDispatchMethodError",
        }),
      );

    // --- Log Group ---

    const logGroup = new logs.LogGroup(this, "StateMachineLogGroup", {
      logGroupName: `/aws/stepfunctions/OrderGoods-${stage}-OrderOrchestration`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // --- State Machine ---

    const stateMachine = new sfn.StateMachine(this, "OrderStateMachine", {
      stateMachineName: `OrderGoods-${stage}-OrderOrchestration`,
      definitionBody: sfn.DefinitionBody.fromChainable(routeByMethod),
      tracingEnabled: true,
      logs: {
        destination: logGroup,
        level: sfn.LogLevel.ALL,
        includeExecutionData: true,
      },
    });

    // --- State Machine IAM (ECS RunTask.sync requirements) ---

    stateMachine.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["ecs:RunTask"],
        resources: ["*"],
      }),
    );

    stateMachine.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["ecs:StopTask", "ecs:DescribeTasks"],
        resources: ["*"],
      }),
    );

    stateMachine.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["iam:PassRole"],
        resources: ["*"],
      }),
    );

    stateMachine.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ["events:PutTargets", "events:PutRule", "events:DescribeRule"],
        resources: ["*"],
      }),
    );

    // --- SSM Output ---

    new ssm.StringParameter(this, "StateMachineArnParam", {
      parameterName: `/order-goods/${stageLower}/orchestration/state-machine-arn`,
      stringValue: stateMachine.stateMachineArn,
    });
  }
}
