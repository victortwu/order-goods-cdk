# Migration Guide: Multi-Stage Deployment

This guide walks you through migrating from the legacy single-stack deployment to the new multi-stage (Beta / Prod) deployment. After completing these steps, each stage will have its own isolated set of AWS resources.

## Prerequisites

- AWS CLI configured with appropriate credentials
- Node.js 18+ and npm installed
- CDK CLI installed (`npm install -g aws-cdk`)
- Working directory: `order-goods-cdk/`

---

## Step 1: Deploy New Stage-Prefixed Stacks

The CDK app now creates stage-prefixed stacks for each stage (`Beta`, `Prod`). Deploy them using wildcard patterns.

### Deploy Beta

```bash
cd order-goods-cdk
npx cdk deploy 'Beta-*'
```

This deploys the following stacks:

- `Beta-OrderGoodsAuthStack`
- `Beta-OrderGoodsDataStack`
- `Beta-OrderGoodsLambdaStack`
- `Beta-OrderGoodsApiStack`
- `Beta-OrderGoodsDispatchStack`

### Deploy Prod

```bash
npx cdk deploy 'Prod-*'
```

This deploys the following stacks:

- `Prod-OrderGoodsAuthStack`
- `Prod-OrderGoodsDataStack`
- `Prod-OrderGoodsLambdaStack`
- `Prod-OrderGoodsApiStack`
- `Prod-OrderGoodsDispatchStack`

> **Tip:** You can also deploy all stages at once with `npx cdk deploy --all`, but deploying stage-by-stage gives you a chance to verify Beta before touching Prod.

---

## Step 2: Seed the Database

The seed script now reads the target table name from the `TABLE_NAME` environment variable. You need to provide the full table name including the stage prefix and the CloudFormation-generated suffix.

### Find Your Table Names

After deploying, find the actual table names in the AWS Console under DynamoDB → Tables, or from the CloudFormation stack outputs. Table names follow this pattern:

```
ProductsTable-<Stage>-<suffix>
```

For example: `ProductsTable-Beta-a1b2c3d4e5f6`

### Seed Beta

```bash
cd order-goods-cdk
TABLE_NAME=ProductsTable-Beta-<suffix> npx ts-node data/seed.ts
```

### Seed Prod

```bash
TABLE_NAME=ProductsTable-Prod-<suffix> npx ts-node data/seed.ts
```

> **Note:** Replace `<suffix>` with the actual suffix from your deployed stack. The suffix is derived from the CloudFormation stack ID and will be different for each stack.

If `TABLE_NAME` is not set, the script exits with an error and usage instructions.

---

## Step 3: Update Frontend Environment Files

The React SPA uses Vite mode-specific environment files to target different stages. After deploying the new stacks, update these files with the actual values from CloudFormation outputs.

### `.env.beta`

Located at `order-goods-react-spa/.env.beta`:

```env
VITE_BASE_URL=<Beta-OrderGoodsApiStack API Gateway URL>
VITE_USERPOOL_ID=<Beta-OrderGoodsAuthStack User Pool ID>
VITE_USERPOOL_CLIENT_ID=<Beta-OrderGoodsAuthStack User Pool Client ID>
VITE_IDENTITYPOOL_ID=<Beta-OrderGoodsAuthStack Identity Pool ID>
```

### `.env.production`

Located at `order-goods-react-spa/.env.production`:

```env
VITE_BASE_URL=<Prod-OrderGoodsApiStack API Gateway URL>
VITE_USERPOOL_ID=<Prod-OrderGoodsAuthStack User Pool ID>
VITE_USERPOOL_CLIENT_ID=<Prod-OrderGoodsAuthStack User Pool Client ID>
VITE_IDENTITYPOOL_ID=<Prod-OrderGoodsAuthStack Identity Pool ID>
```

### Where to Find These Values

| Variable                  | Source                                                                 |
| ------------------------- | ---------------------------------------------------------------------- |
| `VITE_BASE_URL`           | API Gateway console → Stages → prod → Invoke URL                       |
| `VITE_USERPOOL_ID`        | Cognito console → User Pools → `OrderGoods-<Stage>-UserPool` → Pool ID |
| `VITE_USERPOOL_CLIENT_ID` | Cognito console → User Pools → App clients → Client ID                 |
| `VITE_IDENTITYPOOL_ID`    | Cognito console → Identity Pools → `OrderGoods-<Stage>-IdentityPool`   |

### Running the Frontend Against a Stage

```bash
cd order-goods-react-spa

# Development against Beta
npm run dev -- --mode beta

# Production build
npm run build -- --mode production
```

---

## Step 4: Verify

Before destroying legacy stacks, verify the new deployment works end-to-end:

1. Start the frontend against Beta: `npm run dev -- --mode beta`
2. Log in through Cognito — confirm authentication works
3. Browse the product catalog — confirm data loads from the Beta DynamoDB tables
4. Submit a test order — confirm the full flow completes
5. Check the AWS Console — verify resources have stage-prefixed names (e.g., `OrderGoods-Beta-GoodsHandler`, `ProductsTable-Beta-<suffix>`)

---

## Step 5: Destroy Legacy Stacks

> ⚠️ **Warning:** The legacy stacks are **not managed** by the new CDK app code. They must be destroyed manually using `cdk destroy` or the CloudFormation console.

Legacy stacks must be destroyed in **reverse dependency order** to avoid CloudFormation errors from dangling cross-stack references.

### Destruction Order

Run these commands one at a time, in this exact order:

```bash
cd order-goods-cdk

# 1. Dispatch stack (depends on DataStack)
npx cdk destroy OrderGoodsDispatchStack

# 2. API stack (depends on LambdaStack)
npx cdk destroy OrderGoodsApiStack

# 3. Lambda stack (depends on DataStack)
npx cdk destroy OrderGoodsLambdaStack

# 4. Auth stack (no remaining dependents)
npx cdk destroy OrderGoodsAuthStack

# 5. Data stack (no remaining dependents)
npx cdk destroy OrderGoodsDataStack
```

> ⚠️ **Destroying `OrderGoodsDataStack` permanently deletes the legacy DynamoDB tables (`OrderedListTable` and `ProductsTable`) and all their data.** Make sure you have seeded the new stage-prefixed tables and verified the application works before running this step.

### If `cdk destroy` Doesn't Recognize a Stack

Since the legacy stacks are no longer defined in the CDK app code, the CLI may not recognize them. In that case, delete them directly from the **AWS CloudFormation console**:

1. Open the CloudFormation console
2. Select the legacy stack (e.g., `OrderGoodsDispatchStack`)
3. Click **Delete**
4. Repeat in the order listed above
