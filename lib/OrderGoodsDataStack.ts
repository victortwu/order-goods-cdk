// Todo: shoppingList DB must "stream" and connect to another proxy lambda that sends and SNS topic and gets in a queue
// Must send a json of the list to be recieved by headless browser robot
// Must send an email alert with original list and "items not ordered" list produced from the headless browser robot

// https://stackoverflow.com/questions/51600780/dynamodb-triggering-a-lambda-function-in-another-account

import { Stack, StackProps } from "aws-cdk-lib";
import { AttributeType, ITable, Table } from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";
import { getSuffixFromStack } from "./utils/getSuffixFromStack";

export class OrderGoodsDataStack extends Stack {
  public readonly orderedListTable: ITable;
  public readonly productsTable: ITable;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const suffix = getSuffixFromStack(this);

    this.orderedListTable = new Table(this, "OrderedListTable", {
      partitionKey: {
        name: "id",
        type: AttributeType.STRING,
      },
      tableName: `OrderedListTable-${suffix}`,
    });

    this.productsTable = new Table(this, "ProductsTable", {
      partitionKey: {
        name: "id",
        type: AttributeType.STRING,
      },
      tableName: `ProductsTable-${suffix}`,
    });
  }
}
