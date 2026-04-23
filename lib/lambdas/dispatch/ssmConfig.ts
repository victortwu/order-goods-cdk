import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

const ssmClient = new SSMClient({});
const cache = new Map<string, string>();

async function getParam(name: string): Promise<string> {
  const cached = cache.get(name);
  if (cached) return cached;
  const resp = await ssmClient.send(new GetParameterCommand({ Name: name }));
  const value = resp.Parameter!.Value!;
  cache.set(name, value);
  return value;
}

export interface SharedConfig {
  clusterArn: string;
  subnetIds: string;
  securityGroupIds: string;
}

export interface VendorConfig {
  taskDefinitionArn: string;
  logGroupName: string;
}

export async function getSharedConfig(stage: string): Promise<SharedConfig> {
  const prefix = `/order-goods/${stage.toLowerCase()}/shared`;
  const [clusterArn, subnetIds, securityGroupIds] = await Promise.all([
    getParam(`${prefix}/cluster-arn`),
    getParam(`${prefix}/subnet-ids`),
    getParam(`${prefix}/security-group-ids`),
  ]);
  return { clusterArn, subnetIds, securityGroupIds };
}

export async function getVendorConfig(
  stage: string,
  vendorId: string,
): Promise<VendorConfig> {
  const prefix = `/order-goods/${stage.toLowerCase()}/${vendorId}`;
  const [taskDefinitionArn, logGroupName] = await Promise.all([
    getParam(`${prefix}/task-definition-arn`),
    getParam(`${prefix}/log-group-name`),
  ]);
  return { taskDefinitionArn, logGroupName };
}
