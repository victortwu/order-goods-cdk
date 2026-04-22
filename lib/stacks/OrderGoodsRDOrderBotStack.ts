import { Stack, StackProps, RemovalPolicy } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";

interface OrderGoodsRDOrderBotStackProps extends StackProps {
  stage: string;
}

export class OrderGoodsRDOrderBotStack extends Stack {
  public readonly taskDefinitionArn: string;
  public readonly clusterArn: string;
  public readonly subnetIds: string;
  public readonly securityGroupIds: string;
  public readonly logGroupName: string;

  constructor(
    scope: Construct,
    id: string,
    props: OrderGoodsRDOrderBotStackProps,
  ) {
    super(scope, id, props);

    const stage = props.stage;
    const stageLower = stage.toLowerCase();

    // ECR Repository for the RD Order Bot Docker image
    const ecrRepository = new ecr.Repository(this, "RDOrderBotRepo", {
      repositoryName: `order-goods-${stageLower}-rd-order-bot`,
      imageScanOnPush: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // VPC — dedicated VPC for the order bot Fargate tasks.
    // Using a new VPC avoids the Vpc.fromLookup requirement for explicit
    // account/region env, and keeps the bot network isolated.
    const vpc = new ec2.Vpc(this, "RDOrderBotVpc", {
      vpcName: `OrderGoods-${stage}-RDOrderBotVpc`,
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: "Public",
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: "Private",
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    });

    // Security group for the Fargate tasks
    const securityGroup = new ec2.SecurityGroup(
      this,
      "RDOrderBotSecurityGroup",
      {
        vpc,
        description: "Security group for RD Order Bot Fargate tasks",
        allowAllOutbound: true,
      },
    );

    // ECS Cluster
    const cluster = new ecs.Cluster(this, "RDOrderBotCluster", {
      clusterName: `OrderGoods-${stage}-RDOrderBotCluster`,
      vpc,
    });

    // CloudWatch Log Group for container stdout/stderr
    const logGroup = new logs.LogGroup(this, "RDOrderBotLogGroup", {
      logGroupName: `/ecs/order-goods-${stageLower}-rd-order-bot`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // IAM Task Execution Role — pull ECR image, write CloudWatch logs
    const taskExecutionRole = new iam.Role(this, "TaskExecutionRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AmazonECSTaskExecutionRolePolicy",
        ),
      ],
    });

    // IAM Task Role — for the container to access Secrets Manager
    const taskRole = new iam.Role(this, "TaskRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
    });

    taskRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["secretsmanager:GetSecretValue"],
        resources: ["*"],
      }),
    );

    // Fargate Task Definition
    const taskDefinition = new ecs.FargateTaskDefinition(
      this,
      "RDOrderBotTaskDef",
      {
        cpu: 1024,
        memoryLimitMiB: 2048,
        executionRole: taskExecutionRole,
        taskRole,
      },
    );

    taskDefinition.addContainer("rd-order-bot", {
      image: ecs.ContainerImage.fromEcrRepository(ecrRepository),
      logging: ecs.LogDrivers.awsLogs({
        logGroup,
        streamPrefix: "rd-order-bot",
      }),
      environment: {
        CREDENTIAL_SOURCE: "secrets_manager",
        SECRET_NAME_OR_PATH: `order-goods/${stageLower}/restaurant-depot-creds`,
        DELIVERY_ZIP_CODE: "98109",
      },
    });

    // Export values as public readonly properties
    this.taskDefinitionArn = taskDefinition.taskDefinitionArn;
    this.clusterArn = cluster.clusterArn;
    this.logGroupName = logGroup.logGroupName;

    // Collect subnet IDs (private subnets with NAT for outbound internet access)
    this.subnetIds = vpc.privateSubnets
      .map((subnet) => subnet.subnetId)
      .join(",");

    this.securityGroupIds = securityGroup.securityGroupId;
  }
}
