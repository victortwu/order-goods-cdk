import { Stack, StackProps } from "aws-cdk-lib";
import { Construct } from "constructs";
import {
  UserPool,
  UserPoolClient,
  CfnUserPoolGroup,
  CfnIdentityPool,
  CfnIdentityPoolRoleAttachment,
} from "aws-cdk-lib/aws-cognito";
import { Role, ManagedPolicy, FederatedPrincipal } from "aws-cdk-lib/aws-iam";

export interface OrderGoodsAuthStackProps extends StackProps {
  stage: string;
}

export class OrderGoodsAuthStack extends Stack {
  public readonly userPool: UserPool;
  public readonly userPoolClient: UserPoolClient;
  public readonly identityPool: CfnIdentityPool;

  constructor(scope: Construct, id: string, props: OrderGoodsAuthStackProps) {
    super(scope, id, props);

    this.userPool = new UserPool(this, "OrderGoodsUserPool", {
      userPoolName: `OrderGoods-${props.stage}-UserPool`,
      selfSignUpEnabled: props.stage !== "Prod",
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

    this.identityPool = new CfnIdentityPool(this, "OrderGoodsIdentityPool", {
      identityPoolName: `OrderGoods-${props.stage}-IdentityPool`,
      allowUnauthenticatedIdentities: false,
      cognitoIdentityProviders: [
        {
          clientId: this.userPoolClient.userPoolClientId,
          providerName: `cognito-idp.${this.region}.amazonaws.com/${this.userPool.userPoolId}`,
        },
      ],
    });

    const authenticatedRole = new Role(this, "OrderGoodsAuthenticatedRole", {
      assumedBy: new FederatedPrincipal(
        "cognito-identity.amazonaws.com",
        {
          StringEquals: {
            "cognito-identity.amazonaws.com:aud": this.identityPool.ref,
          },
          "ForAnyValue:StringLike": {
            "cognito-identity.amazonaws.com:amr": "authenticated",
          },
        },
        "sts:AssumeRoleWithWebIdentity",
      ),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName("AmazonCognitoPowerUser"),
      ],
    });

    const adminRole = new Role(this, "OrderGoodsAdminRole", {
      assumedBy: new FederatedPrincipal(
        "cognito-identity.amazonaws.com",
        {
          StringEquals: {
            "cognito-identity.amazonaws.com:aud": this.identityPool.ref,
          },
          "ForAnyValue:StringLike": {
            "cognito-identity.amazonaws.com:amr": "authenticated",
          },
        },
        "sts:AssumeRoleWithWebIdentity",
      ),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName("AdministratorAccess"),
      ],
    });

    new CfnUserPoolGroup(this, "OrderGoodsAdminsGroup", {
      userPoolId: this.userPool.userPoolId,
      groupName: "admins",
      roleArn: adminRole.roleArn,
    });

    new CfnIdentityPoolRoleAttachment(
      this,
      "OrderGoodsIdentityPoolRoleAttachment",
      {
        identityPoolId: this.identityPool.ref,
        roles: {
          authenticated: authenticatedRole.roleArn,
        },
        roleMappings: {
          admins: {
            type: "Token",
            ambiguousRoleResolution: "AuthenticatedRole",
            identityProvider: `cognito-idp.${this.region}.amazonaws.com/${this.userPool.userPoolId}:${this.userPoolClient.userPoolClientId}`,
            rulesConfiguration: {
              rules: [
                {
                  claim: "cognito:groups",
                  matchType: "Contains",
                  value: "admins",
                  roleArn: adminRole.roleArn,
                },
              ],
            },
          },
        },
      },
    );
  }
}
