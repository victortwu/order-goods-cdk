import { CfnOutput, RemovalPolicy, Stack, StackProps } from "aws-cdk-lib";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as targets from "aws-cdk-lib/aws-route53-targets";
import { Construct } from "constructs";

export interface OrderGoodsFrontendStackProps extends StackProps {
  stage: string;
  /**
   * Fully-qualified custom domain to attach to the CloudFront distribution
   * (e.g. "ordergoods.eatbdk.com"). When omitted, the distribution serves off
   * its default *.cloudfront.net domain only.
   */
  domainName?: string;
  /**
   * ARN of an existing ACM certificate (must live in us-east-1) that covers
   * `domainName`. Required when `domainName` is set.
   */
  certificateArn?: string;
  /**
   * Route 53 hosted zone id + apex zone name used to create the alias A-record.
   * Required when `domainName` is set. The zone must be same-account.
   */
  hostedZoneId?: string;
  zoneName?: string;
}

export class OrderGoodsFrontendStack extends Stack {
  constructor(scope: Construct, id: string, props: OrderGoodsFrontendStackProps) {
    super(scope, id, props);

    const { domainName, certificateArn, hostedZoneId, zoneName } = props;

    const bucket = new s3.Bucket(this, "FrontendBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const distributionProps: cloudfront.DistributionProps = {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      },
      defaultRootObject: "index.html",
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/index.html",
        },
      ],
    };

    // Attach the custom domain + certificate in-place when configured. Adding
    // domainNames/certificate to an existing distribution is an UPDATE, not a
    // replacement — the default *.cloudfront.net domain keeps working alongside
    // the custom domain, so there is no downtime.
    if (domainName && certificateArn) {
      const certificate = acm.Certificate.fromCertificateArn(this, "Certificate", certificateArn);
      Object.assign(distributionProps, {
        domainNames: [domainName],
        certificate,
      });
    }

    const distribution = new cloudfront.Distribution(
      this,
      "FrontendDistribution",
      distributionProps,
    );

    // Point the custom domain at the distribution via a Route 53 alias A-record.
    // The hosted zone is same-account, so we import it by attributes (no lookup,
    // no cross-account role, no DNS validation wait — the wildcard cert already
    // covers the subdomain).
    if (domainName && hostedZoneId && zoneName) {
      const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, "HostedZone", {
        hostedZoneId,
        zoneName,
      });

      new route53.ARecord(this, "AliasRecord", {
        zone: hostedZone,
        recordName: domainName,
        target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution)),
      });
    }

    new s3deploy.BucketDeployment(this, "DeployFrontend", {
      sources: [s3deploy.Source.asset("../order-goods-react-spa/dist")],
      destinationBucket: bucket,
      distribution: distribution,
      distributionPaths: ["/*"],
    });

    new CfnOutput(this, "DistributionUrl", {
      value: distribution.distributionDomainName,
    });

    if (domainName) {
      new CfnOutput(this, "CustomDomainUrl", {
        value: `https://${domainName}`,
      });
    }

    new CfnOutput(this, "BucketName", {
      value: bucket.bucketName,
    });
  }
}
