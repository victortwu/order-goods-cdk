import { APIGatewayProxyResult } from "aws-lambda";

export const addCorsHeader = (res: APIGatewayProxyResult) => {
  res.headers = res.headers ?? {};
  res.headers["Access-Control-Allow-Origin"] = "*";
  res.headers["Access-Control-Allow-Methods"] = "*";
};
