import { json } from "@remix-run/node";
import { useLoaderData, useNavigate } from "@remix-run/react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import {
  Page, Layout, Card, BlockStack, Text, InlineGrid,
  Box, Icon, Button, Badge, Divider, EmptyState,
  InlineStack, Thumbnail,
} from "@shopify/polaris";
import { ProductIcon, LinkIcon, ClockIcon } from "@shopify/polaris-icons";

const PRODUCTS_QUERY = `
  query GetProducts($first: Int!) {
    products(first: $first) {
      edges {
        node {
          id title status
          featuredImage { url altText }
          priceRangeV2 {
            minVariantPrice { amount currencyCode }
          }
        }
      }
    }
    productsCount { count }
  }
`;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { authenticate } = await import("~/shopify.server");
  const prisma = (await import("~/db.server")).default;
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const response = await admin.graphql(PRODUCTS_QUERY, { variables: { first: 4 } });
  const { data } = await response.json();

  const existingFeed = await prisma.productFeed.findUnique({ where: { shop } });

  return json({
    shop,
    totalProducts: data.productsCount.count,
    recentProducts: data.products.edges.map((e: any) => e.node),
    existingFeed,
  });
};

export default function Dashboard() {
  const { shop, totalProducts, recentProducts, existingFeed } = useLoaderData<typeof loader>();
  const navigate = useNavigate();

  const formatDate = (dateStr: string) =>
    new Date(dateStr).toLocaleDateString("en-US", {
      year: "numeric", month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });

  return (
    <Page
      title="Mango Product Feed"
      subtitle={`Connected to ${shop}`}
      primaryAction={{ content: "Manage Feed", onAction: () => navigate("/app/feed") }}
    >
      <BlockStack gap="500">
        <InlineGrid columns={["oneThird", "oneThird", "oneThird"]} gap="400">
          <Card>
            <BlockStack gap="200">
              <InlineStack align="space-between">
                <Text variant="bodyMd" tone="subdued" as="p">Total Products</Text>
                <Icon source={ProductIcon} tone="base" />
              </InlineStack>
              <Text variant="heading2xl" as="p">{totalProducts.toLocaleString()}</Text>
              <Text variant="bodySm" tone="subdued" as="p">Available in your store</Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="200">
              <InlineStack align="space-between">
                <Text variant="bodyMd" tone="subdued" as="p">Feed Status</Text>
                <Icon source={LinkIcon} tone="base" />
              </InlineStack>
              {existingFeed ? <Badge tone="success">Active</Badge> : <Badge tone="attention">Not Generated</Badge>}
              <Text variant="bodySm" tone="subdued" as="p">
                {existingFeed ? "Feed URL is live" : "Generate a feed to get started"}
              </Text>
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="200">
              <InlineStack align="space-between">
                <Text variant="bodyMd" tone="subdued" as="p">Last Generated</Text>
                <Icon source={ClockIcon} tone="base" />
              </InlineStack>
              <Text variant="headingMd" as="p">
                {existingFeed ? formatDate(existingFeed.lastGenerated) : "Never"}
              </Text>
              <Text variant="bodySm" tone="subdued" as="p">
                {existingFeed ? `${existingFeed.productCount} products` : "—"}
              </Text>
            </BlockStack>
          </Card>
        </InlineGrid>

        <Layout>
          <Layout.Section>
            {existingFeed ? (
              <Card>
                <BlockStack gap="400">
                  <Text variant="headingMd" as="h2">Your Product Feed URL</Text>
                  <Divider />
                  <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                    <Text variant="bodyMd" as="p" breakWord>
                      <code style={{ fontFamily: "monospace", fontSize: "13px" }}>
                        {existingFeed.feedUrl}
                      </code>
                    </Text>
                  </Box>
                  <InlineStack gap="300">
                    <Button variant="primary" onClick={() => navigate("/app/feed")}>View Feed Details</Button>
                    <Button onClick={() => navigator.clipboard.writeText(existingFeed.feedUrl)}>Copy URL</Button>
                  </InlineStack>
                </BlockStack>
              </Card>
            ) : (
              <Card>
                <EmptyState
                  heading="No product feed generated yet"
                  action={{ content: "Generate Feed", onAction: () => navigate("/app/feed") }}
                  image="https://cdn.shopify.com/s/files/1/0262/4071/2726/files/emptystate-files.png"
                >
                  <p>Generate a product feed URL to share your catalog with Google Shopping, Facebook, or other platforms.</p>
                </EmptyState>
              </Card>
            )}
          </Layout.Section>
          <Layout.Section variant="oneThird">
            <Card>
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <Text variant="headingMd" as="h2">Recent Products</Text>
                  <Text variant="bodySm" tone="subdued" as="p">{totalProducts} total</Text>
                </InlineStack>
                <Divider />
                <BlockStack gap="300">
                  {recentProducts.map((product: any) => (
                    <InlineStack key={product.id} gap="300" blockAlign="center" align="space-between">
                      <InlineStack gap="300" blockAlign="center">
                        <Thumbnail
                          source={product.featuredImage?.url || "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-product-1_small.png"}
                          alt={product.title}
                          size="small"
                        />
                        <BlockStack gap="050">
                          <Text variant="bodyMd" as="p" truncate>{product.title}</Text>
                          <Text variant="bodySm" tone="subdued" as="p">
                            {product.priceRangeV2.minVariantPrice.currencyCode}{" "}
                            {parseFloat(product.priceRangeV2.minVariantPrice.amount).toFixed(2)}
                          </Text>
                        </BlockStack>
                      </InlineStack>
                      <Badge tone={product.status === "ACTIVE" ? "success" : "attention"}>
                        {product.status}
                      </Badge>
                    </InlineStack>
                  ))}
                </BlockStack>
              </BlockStack>
            </Card>
          </Layout.Section>
        </Layout>
      </BlockStack>
    </Page>
  );
}
