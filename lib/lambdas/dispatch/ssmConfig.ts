import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { SharedConfig, VendorConfig } from "./constants/types";

const ssmClient = new SSMClient({});
const cache = new Map<string, string>();

const getParam = async (name: string): Promise<string> => {
  const cached = cache.get(name);
  if (cached) return cached;
  const resp = await ssmClient.send(new GetParameterCommand({ Name: name }));
  const value = resp.Parameter!.Value!;
  cache.set(name, value);
  return value;
};

export const getSharedConfig = async (stage: string): Promise<SharedConfig> => {
  const prefix = `/order-goods/${stage.toLowerCase()}/shared`;
  const [clusterArn, subnetIds, securityGroupIds] = await Promise.all([
    getParam(`${prefix}/cluster-arn`),
    getParam(`${prefix}/subnet-ids`),
    getParam(`${prefix}/security-group-ids`),
  ]);
  return { clusterArn, subnetIds, securityGroupIds };
};

export const getVendorConfig = async (
  stage: string,
  vendorId: string,
): Promise<VendorConfig> => {
  const prefix = `/order-goods/${stage.toLowerCase()}/${vendorId}`;
  const [taskDefinitionArn, taskDefinitionFamily, logGroupName] =
    await Promise.all([
      getParam(`${prefix}/task-definition-arn`),
      getParam(`${prefix}/task-definition-family`),
      getParam(`${prefix}/log-group-name`),
    ]);
  return { taskDefinitionArn, taskDefinitionFamily, logGroupName };
};
