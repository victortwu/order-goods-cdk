import { Stack, StackProps } from "aws-cdk-lib";
import { AttributeType, ITable, StreamViewType, Table } from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";
import { getSuffixFromStack } from "../utils/getSuffixFromStack";

interface OrderGoodsDataStackProps extends StackProps {
  stage: string;
}

export class OrderGoodsDataStack extends Stack {
  public readonly orderedListTable: ITable;
  public readonly productsTable: ITable;

  constructor(scope: Construct, id: string, props: OrderGoodsDataStackProps) {
    super(scope, id, props);

    const suffix = getSuffixFromStack(this);

    const orderedListTable = (this.orderedListTable = new Table(this, "OrderedListTable", {
      partitionKey: {
        name: "id",
        type: AttributeType.STRING,
      },
      tableName: `OrderedListTable-${props.stage}-${suffix}`,
      stream: StreamViewType.NEW_IMAGE,
    }));

    orderedListTable.addGlobalSecondaryIndex({
      partitionKey: {
        name: "timestamp",
        type: AttributeType.NUMBER,
      },
      indexName: "TimestampIndex",
    });

    orderedListTable.addGlobalSecondaryIndex({
      partitionKey: {
        name: "entityType",
        type: AttributeType.STRING,
      },
      sortKey: {
        name: "timestamp",
        type: AttributeType.NUMBER,
      },
      indexName: "EntityTypeTimestampIndex",
    });

    const productsTable = (this.productsTable = new Table(this, "ProductsTable", {
      partitionKey: {
        name: "id",
        type: AttributeType.STRING,
      },
      tableName: `ProductsTable-${props.stage}-${suffix}`,
    }));

    productsTable.addGlobalSecondaryIndex({
      partitionKey: {
        name: "name",
        type: AttributeType.STRING,
      },
      indexName: "NameIndex",
    });
  }
}
