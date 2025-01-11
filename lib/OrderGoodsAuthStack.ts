import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  UserPool,
  UserPoolClient,
  CfnUserPoolGroup,
} from "aws-cdk-lib/aws-cognito";
import { Role, ServicePrincipal, ManagedPolicy } from "aws-cdk-lib/aws-iam";

export class OrderGoodsAuthStack extends Stack {
  public readonly userPool: UserPool;
  public readonly userPoolClient: UserPoolClient;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    this.userPool = new UserPool(this, "OrderGoodsUserPool", {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: {
          required: true,
          mutable: false,
        },
      },
    });

    this.userPoolClient = new UserPoolClient(this, "OrderGoodsUserPoolClient", {
      userPool: this.userPool,
    });

    const adminRole = new Role(this, "OrderGoodsAdminRole", {
      assumedBy: new ServicePrincipal("cognito-idp.amazonaws.com"),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName("AdministratorAccess"),
      ],
    });

    new CfnUserPoolGroup(this, "OrderGoodsAdminsGroup", {
      userPoolId: this.userPool.userPoolId,
      groupName: "admins",
      roleArn: adminRole.roleArn,
    });
  }
}
