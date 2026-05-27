import { SSMClient, GetParameterCommand, ParameterNotFound } from "@aws-sdk/client-ssm";
import { DispatchMethod, SharedConfig, VendorConfig } from "./constants/types";

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

export const getVendorConfig = async (stage: string, vendorId: string): Promise<VendorConfig> => {
  const prefix = `/order-goods/${stage.toLowerCase()}/${vendorId}`;
  const [taskDefinitionArn, taskDefinitionFamily, logGroupName] = await Promise.all([
    getParam(`${prefix}/task-definition-arn`),
    getParam(`${prefix}/task-definition-family`),
    getParam(`${prefix}/log-group-name`),
  ]);
  return { taskDefinitionArn, taskDefinitionFamily, logGroupName };
};

export const getVendorEmail = async (stage: string, vendorId: string): Promise<string> => {
  const param = `/order-goods/${stage.toLowerCase()}/${vendorId}/recipient-email`;
  return getParam(param);
};

/**
 * Reads the dispatch method for a vendor from SSM.
 * Returns "not_configured" if the parameter does not exist.
 */
export const getDispatchMethod = async (
  stage: string,
  vendorId: string,
): Promise<DispatchMethod> => {
  const param = `/order-goods/${stage.toLowerCase()}/${vendorId}/dispatch-method`;
  try {
    return (await getParam(param)) as DispatchMethod;
  } catch (err) {
    if (
      err instanceof ParameterNotFound ||
      (err as { name?: string }).name === "ParameterNotFound"
    ) {
      return "not_configured";
    }
    throw err;
  }
};

export const getStateMachineArn = async (stage: string): Promise<string> => {
  const param = `/order-goods/${stage.toLowerCase()}/orchestration/state-machine-arn`;
  return getParam(param);
};

export const getRecipientEmail = async (stage: string): Promise<string> => {
  const param = `/order-goods/${stage.toLowerCase()}/recipients/admin-001/email`;
  return getParam(param);
};

export const getRecipientPhone = async (stage: string): Promise<string> => {
  const param = `/order-goods/${stage.toLowerCase()}/recipients/admin-001/phone`;
  return getParam(param);
};

export const getSnsTopicArn = async (stage: string): Promise<string> => {
  const param = `/order-goods/${stage.toLowerCase()}/orchestration/sns-topic-arn`;
  return getParam(param);
};
