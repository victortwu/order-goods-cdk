import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ssm from "aws-cdk-lib/aws-ssm";

interface BotClusterStackProps extends StackProps {
  stage: string;
}

export class BotClusterStack extends Stack {
  constructor(scope: Construct, id: string, props: BotClusterStackProps) {
    super(scope, id, props);

    const stage = props.stage;
    const stageLower = stage.toLowerCase();
    const prefix = `/order-goods/${stageLower}/shared`;

    const vpc = new ec2.Vpc(this, "BotVpc", {
      vpcName: `OrderGoods-${stage}-BotVpc`,
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        { cidrMask: 24, name: "Public", subnetType: ec2.SubnetType.PUBLIC },
        {
          cidrMask: 24,
          name: "Private",
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
      ],
    });

    const securityGroup = new ec2.SecurityGroup(this, "BotSG", {
      vpc,
      description: "Security group for bot Fargate tasks",
      allowAllOutbound: true,
    });

    const cluster = new ecs.Cluster(this, "BotCluster", {
      clusterName: `OrderGoods-${stage}-BotCluster`,
      vpc,
    });

    new ssm.StringParameter(this, "ClusterArnParam", {
      parameterName: `${prefix}/cluster-arn`,
      stringValue: cluster.clusterArn,
    });

    new ssm.StringParameter(this, "SubnetIdsParam", {
      parameterName: `${prefix}/subnet-ids`,
      stringValue: vpc.privateSubnets.map((s) => s.subnetId).join(","),
    });

    new ssm.StringParameter(this, "SecurityGroupIdsParam", {
      parameterName: `${prefix}/security-group-ids`,
      stringValue: securityGroup.securityGroupId,
    });

    new ssm.StringParameter(this, "VpcIdParam", {
      parameterName: `${prefix}/vpc-id`,
      stringValue: vpc.vpcId,
    });
  }
}
