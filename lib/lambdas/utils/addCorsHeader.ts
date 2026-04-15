import { APIGatewayProxyResult } from "aws-lambda";

export const addCorsHeader = (res: APIGatewayProxyResult) => {
  res.headers = res.headers ?? {};
  res.headers["Access-Control-Allow-Origin"] = "*";
  res.headers["Access-Control-Allow-Methods"] = "*";
};

// export const addCorsHeader = (res: APIGatewayProxyResult) => {
//   res.headers = res.headers ?? {};

//   res.headers["Access-Control-Allow-Origin"] = "*"; // Todo: restrict this to frontend domain
//   res.headers["Access-Control-Allow-Methods"] =
//     "GET, POST, PUT, DELETE, PATCH, OPTIONS";
//   res.headers["Access-Control-Allow-Headers"] =
//     "Content-Type, Authorization, X-Amz-Date, X-Amz-Security-Token, X-Api-Key";
//   res.headers["Content-Type"] = "application/json";
// };
