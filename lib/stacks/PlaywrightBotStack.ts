import { Stack, StackProps, RemovalPolicy } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as ssm from "aws-cdk-lib/aws-ssm";

interface PlaywrightBotStackProps extends StackProps {
  stage: string;
  vendorId: string;
  botName: string;
  credentialSecretPath: string;
  environmentVars?: Record<string, string>;
  cpu?: number;
  memoryMiB?: number;
}

export class PlaywrightBotStack extends Stack {
  constructor(scope: Construct, id: string, props: PlaywrightBotStackProps) {
    super(scope, id, props);

    const { stage, vendorId, credentialSecretPath } = props;
    const stageLower = stage.toLowerCase();
    const cpu = props.cpu ?? 1024;
    const memoryMiB = props.memoryMiB ?? 2048;
    const prefix = `/order-goods/${stageLower}/${vendorId}`;

    const ecrRepository = new ecr.Repository(this, "BotRepo", {
      repositoryName: `order-goods-${stageLower}-${vendorId}-bot`,
      imageScanOnPush: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    const logGroup = new logs.LogGroup(this, "BotLogGroup", {
      logGroupName: `/ecs/order-goods-${stageLower}-${vendorId}-bot`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const taskExecutionRole = new iam.Role(this, "TaskExecutionRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AmazonECSTaskExecutionRolePolicy",
        ),
      ],
    });

    const taskRole = new iam.Role(this, "TaskRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    });

    taskRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["secretsmanager:GetSecretValue"],
        resources: [
          `arn:aws:secretsmanager:*:*:secret:${credentialSecretPath}*`,
        ],
      }),
    );

    const taskDefinition = new ecs.FargateTaskDefinition(this, "BotTaskDef", {
      cpu,
      memoryLimitMiB: memoryMiB,
      executionRole: taskExecutionRole,
      taskRole,
    });

    taskDefinition.addContainer(`${vendorId}-bot`, {
      image: ecs.ContainerImage.fromEcrRepository(ecrRepository),
      logging: ecs.LogDrivers.awsLogs({
        logGroup,
        streamPrefix: `${vendorId}-bot`,
      }),
      environment: {
        CREDENTIAL_SOURCE: "secrets_manager",
        SECRET_NAME_OR_PATH: credentialSecretPath,
        ...props.environmentVars,
      },
    });

    new ssm.StringParameter(this, "TaskDefArnParam", {
      parameterName: `${prefix}/task-definition-arn`,
      stringValue: taskDefinition.taskDefinitionArn,
    });

    new ssm.StringParameter(this, "LogGroupNameParam", {
      parameterName: `${prefix}/log-group-name`,
      stringValue: logGroup.logGroupName,
    });

    new ssm.StringParameter(this, "EcrRepoUriParam", {
      parameterName: `${prefix}/ecr-repo-uri`,
      stringValue: ecrRepository.repositoryUri,
    });
  }
}
