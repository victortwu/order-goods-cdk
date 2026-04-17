import * as cdk from "aws-cdk-lib";
import { Template, Match } from "aws-cdk-lib/assertions";
import * as fs from "fs";
import * as path from "path";
import { OrderGoodsFrontendStack } from "../lib/stacks/OrderGoodsFrontendStack";

describe("OrderGoodsFrontendStack", () => {
  let template: Template;
  const distDir = path.resolve(__dirname, "../../order-goods-react-spa/dist");
  let createdDistDir = false;

  beforeAll(() => {
    // Ensure dist/ directory exists so Source.asset() resolves during synthesis
    if (!fs.existsSync(distDir)) {
      fs.mkdirSync(distDir, { recursive: true });
      fs.writeFileSync(path.join(distDir, "index.html"), "<html></html>");
      createdDistDir = true;
    }

    const app = new cdk.App();
    const stack = new OrderGoodsFrontendStack(
      app,
      "Beta-OrderGoodsFrontendStack",
      { stage: "Beta" },
    );
    template = Template.fromStack(stack);
  });

  afterAll(() => {
    // Clean up temporary dist/ directory if we created it
    if (createdDistDir) {
      fs.rmSync(distDir, { recursive: true, force: true });
    }
  });

  test("S3 bucket has PublicAccessBlockConfiguration all set to true (Req 1.1, 1.2, 1.4)", () => {
    template.hasResourceProperties("AWS::S3::Bucket", {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  test("S3 bucket has DeletionPolicy Delete and auto-delete custom resource (Req 1.3)", () => {
    template.hasResource("AWS::S3::Bucket", {
      DeletionPolicy: "Delete",
    });

    // autoDeleteObjects: true creates a Custom::S3AutoDeleteObjects resource
    template.hasResourceProperties("Custom::S3AutoDeleteObjects", {
      BucketName: Match.anyValue(),
    });
  });

  test("CloudFront distribution exists with S3 origin (Req 2.1)", () => {
    template.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: {
        Origins: Match.arrayWith([
          Match.objectLike({
            S3OriginConfig: Match.anyValue(),
          }),
        ]),
      },
    });
  });

  test("CloudFront distribution uses Origin Access Control (Req 2.2)", () => {
    // OAC creates an AWS::CloudFront::OriginAccessControl resource
    template.hasResourceProperties("AWS::CloudFront::OriginAccessControl", {
      OriginAccessControlConfig: Match.objectLike({
        OriginAccessControlOriginType: "s3",
        SigningBehavior: "always",
        SigningProtocol: "sigv4",
      }),
    });

    // The distribution origin should reference the OAC
    template.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: {
        Origins: Match.arrayWith([
          Match.objectLike({
            OriginAccessControlId: Match.anyValue(),
          }),
        ]),
      },
    });
  });

  test("CloudFront DefaultRootObject is index.html (Req 2.3)", () => {
    template.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: {
        DefaultRootObject: "index.html",
      },
    });
  });

  test("CloudFront ViewerProtocolPolicy is redirect-to-https (Req 2.5)", () => {
    template.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: {
        DefaultCacheBehavior: Match.objectLike({
          ViewerProtocolPolicy: "redirect-to-https",
        }),
      },
    });
  });

  test("CloudFront custom error response for 403 → /index.html with status 200 (Req 3.1)", () => {
    template.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: {
        CustomErrorResponses: Match.arrayWith([
          Match.objectLike({
            ErrorCode: 403,
            ResponseCode: 200,
            ResponsePagePath: "/index.html",
          }),
        ]),
      },
    });
  });

  test("CloudFront custom error response for 404 → /index.html with status 200 (Req 3.2)", () => {
    template.hasResourceProperties("AWS::CloudFront::Distribution", {
      DistributionConfig: {
        CustomErrorResponses: Match.arrayWith([
          Match.objectLike({
            ErrorCode: 404,
            ResponseCode: 200,
            ResponsePagePath: "/index.html",
          }),
        ]),
      },
    });
  });

  test("BucketDeployment custom resource exists (Req 5.1)", () => {
    template.hasResourceProperties("Custom::CDKBucketDeployment", {
      SourceBucketNames: Match.anyValue(),
      DestinationBucketName: Match.anyValue(),
    });
  });

  test("Stack outputs include DistributionUrl and BucketName (Req 6.1, 6.2)", () => {
    template.hasOutput("DistributionUrl", {
      Value: Match.anyValue(),
    });

    template.hasOutput("BucketName", {
      Value: Match.anyValue(),
    });
  });
});
